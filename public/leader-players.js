import { getCurrentUser } from './login.js';
import { handleSessionFailure } from './login.js';
import { showAdminView, navigateAdminView } from './admin-view.js';
import { CHARACTER_SECTIONS } from './character-sections.js';

async function rpc(name, args) {
  const user = getCurrentUser();
  if (user?.role !== 'leader' || !user.session_token) throw new Error('Access denied');
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import('./config.local.js');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', credentials: 'omit', cache: 'no-store',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...args, p_session_token: user.session_token }),
  });
  if (!response.ok) {
    await handleSessionFailure(response);
    throw new Error('Players unavailable');
  }
  return response.json();
}

export function mountLeaderPlayers(document, window, call = rpc) {
  const home = document.querySelector('#leader-content');
  const panel = document.querySelector('#leader-players');
  const list = document.querySelector('#players-list');
  const status = document.querySelector('#players-status');
  const visibilityControls = document.querySelector('#character-visibility-controls');
  const visibilityStatus = document.querySelector('#character-visibility-status');
  const sheet = document.querySelector('#leader-sheet');
  const main = document.querySelector('main');
  let selected = null;
  let generation = 0;
  let visibilityGeneration = 0;
  let visibilityState = new Map();
  let sheetResizeObserver = null;
  function syncSheetHeight() {
    const body = sheet.contentDocument?.body;
    const content = sheet.contentDocument?.querySelector('main');
    if (!body || !content) return;
    const style = sheet.contentWindow?.getComputedStyle(body);
    const margins = (Number.parseFloat(style?.marginTop) || 0) + (Number.parseFloat(style?.marginBottom) || 0);
    const height = content.scrollHeight + margins;
    if (sheet.dataset) {
      sheet.dataset.iframeHeight = String(Math.ceil(sheet.getBoundingClientRect().height));
      sheet.dataset.documentHeight = String(sheet.contentDocument?.documentElement?.scrollHeight ?? 0);
      sheet.dataset.contentHeight = String(Math.ceil(height));
    }
    if (height > 0) sheet.style.height = `${height}px`;
  }
  function observeSheetHeight() {
    sheetResizeObserver?.disconnect();
    sheetResizeObserver = null;
    syncSheetHeight();
    const content = sheet.contentDocument?.querySelector('main');
    if (typeof ResizeObserver === 'undefined' || !content) return;
    sheetResizeObserver = new ResizeObserver(syncSheetHeight);
    sheetResizeObserver.observe(content);
  }
  sheet.addEventListener('load', observeSheetHeight);
  function clearSelectedPlayer() {
    Array.from(list.children).forEach(item => item.children[0]?.removeAttribute('aria-current'));
  }
  async function loadVisibility(request) {
    visibilityControls.replaceChildren();
    visibilityStatus.textContent = 'Načítám nastavení…';
    try {
      const rows = await call('character_section_visibility', {});
      if (request !== visibilityGeneration) return;
      if (!Array.isArray(rows)) throw new Error('Invalid visibility settings');
      visibilityState = new Map(rows.map(row => [row.section_id, row.is_visible]));
      for (const section of CHARACTER_SECTIONS) {
        const label = document.createElement('label');
        label.className = 'character-visibility-toggle';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = visibilityState.get(section.id) ?? false;
        checkbox.addEventListener('change', async () => {
          if (getCurrentUser()?.role !== 'leader' || checkbox.disabled) return;
          const previous = visibilityState.get(section.id) ?? false;
          const next = checkbox.checked;
          checkbox.disabled = true;
          visibilityStatus.textContent = 'Ukládám…';
          try {
            const saved = await call('leader_set_character_section_visibility', {
              p_section_id: section.id, p_is_visible: next,
            });
            if (!Array.isArray(saved) || saved.length !== 1 || saved[0].section_id !== section.id
                || saved[0].is_visible !== next) throw new Error('Invalid save response');
            visibilityState.set(section.id, next);
            visibilityStatus.textContent = 'Nastavení uloženo.';
          } catch {
            checkbox.checked = previous;
            visibilityStatus.textContent = 'Nastavení se nepodařilo uložit.';
          } finally {
            checkbox.disabled = false;
          }
        });
        const text = document.createElement('span');
        text.className = 'character-visibility-toggle-text';
        const translationStart = section.name.lastIndexOf(' (');
        const czechName = document.createElement('span');
        czechName.className = 'character-visibility-toggle-czech';
        czechName.textContent = translationStart > 0 ? section.name.slice(0, translationStart) : section.name;
        text.append(czechName);
        if (translationStart > 0) {
          const englishName = document.createElement('span');
          englishName.className = 'character-visibility-toggle-english';
          englishName.textContent = section.name.slice(translationStart);
          text.append(englishName);
        }
        label.append(checkbox, text);
        visibilityControls.append(label);
      }
      visibilityStatus.textContent = '';
    } catch {
      if (request !== visibilityGeneration) return;
      visibilityStatus.textContent = 'Nastavení viditelnosti se nepodařilo načíst.';
    }
  }
  function closeSheet() {
    selected = null;
    sheetResizeObserver?.disconnect();
    sheetResizeObserver = null;
    sheet.hidden = true;
    sheet.removeAttribute('src');
    clearSelectedPlayer();
  }
  // Only data crosses into the existing sheet. The token stays in this document.
  window.loadLeaderCharacter = async id => {
    if (getCurrentUser()?.role !== 'leader' || id !== selected) throw new Error('Access denied');
    const rows = await call('leader_character', { p_character_id: id });
    if (id !== selected || !Array.isArray(rows) || rows.length !== 1 || rows[0].id !== id) {
      throw new Error('Character unavailable');
    }
    return rows[0];
  };
  document.querySelector('#leader-players-link').addEventListener('click', async event => {
    event.preventDefault();
    if (getCurrentUser()?.role !== 'leader') return;
    if (new URL(window.location.href).searchParams.get('view') !== 'players') navigateAdminView(window, 'players');
    showAdminView(document, 'players');
    const request = ++generation;
    if (getCurrentUser()?.role === 'leader') loadVisibility(++visibilityGeneration);
    closeSheet();
    home.hidden = true;
    panel.hidden = false;
    main.classList.add('players-open');
    list.replaceChildren();
    status.textContent = 'Načítám hráče…';
    try {
      const rows = await call('leader_players', {});
      if (request !== generation) return;
      if (!Array.isArray(rows)) throw new Error('Invalid list');
      for (const row of rows) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.character_id)) {
          throw new Error('Invalid character');
        }
      }
      for (const row of rows) {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        const name = document.createElement('span');
        name.textContent = row.name ?? 'Beze jména';
        button.append(name);
        if (row.username) {
          const username = document.createElement('span');
          username.className = 'character-owner-username';
          username.textContent = ` (${row.username})`;
          button.append(username);
        }
        button.addEventListener('click', () => {
          selected = row.character_id;
          clearSelectedPlayer();
          button.setAttribute('aria-current', 'true');
          sheet.src = `./character.html?mode=leader&character_id=${encodeURIComponent(selected)}`;
          sheet.hidden = false;
        });
        item.append(button);
        list.append(item);
      }
      status.textContent = rows.length ? '' : 'Zatím nejsou přiřazené žádné hráčské postavy.';
    } catch {
      if (request !== generation) return;
      list.replaceChildren();
      status.textContent = 'Hráče se nepodařilo načíst. Zkuste to znovu; pokud přihlášení vypršelo, obnovte stránku a přihlaste se.';
    }
  });
  document.querySelector('#players-home-nav')?.addEventListener('click', event => {
    event.preventDefault();
    document.querySelector('#players-back').click();
  });
  document.querySelector('#players-maps-nav')?.addEventListener('click', event => {
    event.preventDefault();
    document.querySelector('#leader-maps-link').click();
  });
  document.querySelector('#players-back').addEventListener('click', () => {
    generation++;
    closeSheet();
    list.replaceChildren();
    panel.hidden = true;
    main.classList.remove('players-open');
    home.hidden = false;
    showAdminView(document, 'home');
    if (new URL(window.location.href).searchParams.get('view') === 'players') navigateAdminView(window, 'home');
  });
}

mountLeaderPlayers(document, window);
