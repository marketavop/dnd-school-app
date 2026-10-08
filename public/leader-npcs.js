import { getCurrentUser } from './login.js';
import { loadNpcDefinitions, mutateNpc } from './token-api.js';
import { portraitImageUrl, uploadPortrait, removePortrait } from './portrait-api.js';
import { showAdminView, navigateAdminView } from './admin-view.js';

const $ = id => document.getElementById(id);
const panel = $('leader-npcs');
const list = $('leader-npcs-list');
const status = $('npcs-status');
const form = $('leader-npc-form');
const name = $('leader-npc-name');
const file = $('leader-npc-image');
const submit = $('leader-npc-submit');
let rows = [];
let generation = 0;
let request = 0;
let busy = false;
let ready = false;
let pendingId = null;
const uncertain = new Set();
const leader = () => getCurrentUser()?.role === 'leader' && Boolean(getCurrentUser()?.session_token);
const active = () => leader() && !panel.hidden && new URL(window.location.href).searchParams.get('view') === 'npcs';

function controls() {
  submit.disabled = busy || !ready || (pendingId && uncertain.has(pendingId));
  submit.textContent = pendingId ? 'Dokončit obrázek vytvořeného NPC' : 'Vytvořit NPC';
  name.disabled = busy || Boolean(pendingId);
  file.disabled = busy || !ready || (pendingId && uncertain.has(pendingId));
  $('npcs-reload').disabled = busy;
}

function render() {
  if (!active()) return;
  controls();
  list.replaceChildren();
  const version = generation;
  for (const row of rows) {
    const item = document.createElement('li');
    item.className = 'npc-card';
    const label = document.createElement('span');
    label.textContent = row.name || 'NPC';
    item.append(label);
    if (row.image_url != null) {
      void portraitImageUrl(row.id, { entityType: 'npc' }).then(url => {
        if (!url || version !== generation || !active() || !item.isConnected) return;
        const image = document.createElement('img');
        image.alt = ''; image.referrerPolicy = 'no-referrer'; image.src = url;
        image.addEventListener('error', () => image.remove());
        item.prepend(image);
      }).catch(() => { /* The NPC name remains usable without a preview. */ });
    }
    const button = (text, action) => {
      const element = document.createElement('button');
      element.type = 'button'; element.textContent = text;
      element.disabled = busy || !ready || uncertain.has(row.id);
      element.addEventListener('click', action); item.append(element);
    };
    const input = document.createElement('input');
    input.type = 'file'; input.hidden = true; input.accept = file.accept;
    input.addEventListener('change', () => {
      const selected = input.files?.[0]; input.value = '';
      if (selected) void changeImage(row.id, selected);
    });
    item.append(input);
    button(row.image_url ? 'Změnit obrázek' : 'Nahrát obrázek', () => input.click());
    if (row.image_url) button('Odstranit obrázek', () => changeImage(row.id));
    button('Smazat NPC', () => deleteNpc(row));
    list.append(item);
  }
}

async function reload() {
  const version = generation, read = ++request;
  ready = false; controls();
  try {
    const data = await loadNpcDefinitions();
    if (version !== generation || read !== request || !active()) return false;
    if (!Array.isArray(data) || data.some(row => !row || typeof row.id !== 'string' || typeof row.name !== 'string')) throw new Error('Invalid NPC list');
    rows = data; ready = true; uncertain.clear();
    if (pendingId && !rows.some(row => row.id === pendingId)) pendingId = null;
    render();
    return true;
  } catch {
    if (version === generation && read === request && active()) {
      rows = []; render();
      status.textContent = 'Seznam NPC se nepodařilo načíst. Obnovte seznam; do té doby jsou zápisy zablokované.';
    }
    return false;
  }
}

async function showNpcs(event) {
  event?.preventDefault();
  if (!leader()) return;
  if (new URL(window.location.href).searchParams.get('view') !== 'npcs') navigateAdminView(window, 'npcs');
  showAdminView(document, 'npcs');
  $('leader-game').hidden = true;
  $('map-preparation').hidden = true;
  generation++;
  list.replaceChildren(); status.textContent = 'Načítám NPC…';
  if (await reload()) status.textContent = rows.length ? '' : 'Zatím nejsou vytvořená žádná NPC.';
}

async function changeImage(id, selected) {
  if (!active() || busy || !ready || uncertain.has(id)) return;
  busy = true; render();
  const version = generation;
  let message;
  try {
    const result = selected ? await uploadPortrait(id, selected, { entityType: 'npc' }) : await removePortrait(id, { entityType: 'npc' });
    message = result.cleanup_pending ? 'Obrázek uložen; úklid starého souboru čeká na dokončení.' : 'Obrázek uložen. Token v otevřené hře se obnoví po znovunačtení hry.';
  } catch (error) {
    if (error.status === 409 || error.outcome_unknown) uncertain.add(id);
    message = uncertain.has(id) ? 'Výsledek změny nebyl potvrzen. Seznam byl znovu načten; zkontrolujte stav před opakováním.'
      : error.code === 'FILE_TOO_LARGE' ? error.message : 'Obrázek se nepodařilo uložit.';
  } finally {
    const restored = active() ? await reload() : false;
    busy = false; render();
    if (restored && version === generation) status.textContent = message;
  }
}

async function deleteNpc(row) {
  if (!active() || busy || !ready || uncertain.has(row.id)) return;
  if (!window.confirm(`Opravdu smazat NPC „${row.name}“? Odstraní se globální NPC i jeho umístění na všech mapách. Tuto akci nelze vrátit.`)) return;
  busy = true; render();
  const version = generation;
  let message = 'NPC bylo smazáno.';
  try { await mutateNpc('delete', { p_npc_id: row.id }); }
  catch {
    uncertain.add(row.id);
    message = 'Výsledek smazání nebyl potvrzen. Seznam byl znovu načten; zkontrolujte, zda NPC zůstalo v seznamu.';
  } finally {
    const restored = active() ? await reload() : false;
    busy = false; render();
    if (restored && version === generation) status.textContent = message;
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!active() || busy || !ready || (pendingId && uncertain.has(pendingId))) return;
  const value = name.value.trim();
  if (!pendingId && (!value || value.length > 120)) { status.textContent = 'Zadejte jméno NPC (1–120 znaků).'; return; }
  const selected = file.files?.[0];
  const version = generation;
  busy = true; render();
  let message;
  try {
    if (!pendingId) {
      pendingId = await mutateNpc('create', { p_name: value, p_image_url: null });
      if (typeof pendingId !== 'string' || !pendingId) { pendingId = null; throw new Error('Missing NPC ID'); }
    }
    const result = selected ? await uploadPortrait(pendingId, selected, { entityType: 'npc' }) : null;
    pendingId = null; form.reset();
    message = result?.cleanup_pending ? 'NPC vytvořeno; úklid obrázku čeká na dokončení.' : 'NPC bylo vytvořeno.';
  } catch (error) {
    if (pendingId && (error.status === 409 || error.outcome_unknown)) uncertain.add(pendingId);
    message = pendingId ? 'NPC bylo vytvořeno, ale obrázek se nepodařilo potvrdit. Zkontrolujte obnovený seznam před opakováním uploadu.'
      : 'Vytvoření NPC nebylo potvrzeno. Zkontrolujte obnovený seznam před dalším pokusem.';
    if (error.code === 'FILE_TOO_LARGE') message += ` ${error.message}`;
  } finally {
    const restored = active() ? await reload() : false;
    busy = false; render();
    if (restored && version === generation) status.textContent = message;
  }
});

$('leader-npcs-link').addEventListener('click', showNpcs);
$('npcs-reload').addEventListener('click', showNpcs);
$('npcs-home-nav').addEventListener('click', event => {
  event.preventDefault(); generation++;
  showAdminView(document, 'home'); navigateAdminView(window, 'home');
});
for (const view of ['players', 'maps']) $('npcs-' + view + '-nav').addEventListener('click', event => {
  event.preventDefault(); generation++;
  $('leader-' + view + '-link').click();
});
