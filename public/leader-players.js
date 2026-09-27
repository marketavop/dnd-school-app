import { getCurrentUser } from './login.js';
import { handleSessionFailure } from './login.js';

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
  const sheet = document.querySelector('#leader-sheet');
  const main = document.querySelector('main');
  let selected = null;
  let generation = 0;
  function closeSheet() {
    selected = null;
    sheet.hidden = true;
    sheet.removeAttribute('src');
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
    const request = ++generation;
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
        button.textContent = row.name ?? 'Beze jména';
        button.addEventListener('click', () => {
          selected = row.character_id;
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
  document.querySelector('#players-back').addEventListener('click', () => {
    generation++;
    closeSheet();
    list.replaceChildren();
    panel.hidden = true;
    main.classList.remove('players-open');
    home.hidden = false;
  });
}

mountLeaderPlayers(document, window);
