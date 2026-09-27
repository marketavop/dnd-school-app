import { renderGrid } from './grid.js';
const map = document.querySelector('#map');
const mapSpace = document.querySelector('#map-space');
const mapViewport = document.querySelector('#map-viewport');
let mapScale = 1;
let userZoom = 1;
let panX = 0;
let panY = 0;
let cameraDrag = null;

function fitMap() {
  if (!map.naturalWidth || !map.naturalHeight || !mapViewport.clientWidth || !mapViewport.clientHeight) return;
  mapScale = Math.min(1, mapViewport.clientWidth / map.naturalWidth, mapViewport.clientHeight / map.naturalHeight) * userZoom;
  mapSpace.style.transform = `scale(${mapScale})`;
  mapSpace.style.left = `${(mapViewport.clientWidth - map.naturalWidth * mapScale) / 2 + panX}px`;
  mapSpace.style.top = `${(mapViewport.clientHeight - map.naturalHeight * mapScale) / 2 + panY}px`;
}

function resetCamera() {
  if (cameraDrag) endPan({ pointerId: cameraDrag.id });
  userZoom = 1;
  panX = panY = 0;
  fitMap();
}
mapViewport.addEventListener('wheel', event => {
  if (!mapReady || drag || cameraDrag) return;
  event.preventDefault();
  const rect = mapViewport.getBoundingClientRect();
  const x = event.clientX - rect.left - mapViewport.clientWidth / 2;
  const y = event.clientY - rect.top - mapViewport.clientHeight / 2;
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? mapViewport.clientHeight : 1);
  const next = Math.max(0.5, Math.min(4, userZoom * Math.exp(-delta * 0.002)));
  const ratio = next / userZoom;
  panX = x - (x - panX) * ratio;
  panY = y - (y - panY) * ratio;
  userZoom = next;
  fitMap();
}, { passive: false });
mapViewport.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !mapReady || drag || cameraDrag || event.target.closest('.token')) return;
  event.preventDefault();
  cameraDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, panX, panY };
  mapViewport.setPointerCapture(event.pointerId);
  mapViewport.classList.add('panning');
});
mapViewport.addEventListener('pointermove', event => {
  if (!cameraDrag || event.pointerId !== cameraDrag.id) return;
  panX = cameraDrag.panX + event.clientX - cameraDrag.x;
  panY = cameraDrag.panY + event.clientY - cameraDrag.y;
  fitMap();
});
function endPan(event) {
  if (!cameraDrag || event.pointerId !== cameraDrag.id) return;
  cameraDrag = null;
  if (mapViewport.hasPointerCapture(event.pointerId)) mapViewport.releasePointerCapture(event.pointerId);
  mapViewport.classList.remove('panning');
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) mapViewport.addEventListener(type, endPan);
document.querySelector('#fit-map').addEventListener('click', () => { if (!drag) resetCamera(); });

new ResizeObserver(fitMap).observe(mapViewport);
const grid = document.querySelector('#grid');
// Session stays on the homepage. The server resolves player ownership again.
const gameIdentity = window.parent.getGameIdentity();
const leaderMode = gameIdentity.role === 'leader';
import { configureMapImageUrl, resolveMapImage } from './map-image.js';

const MAPS = [
  { id: 'test-map', name: 'Test map', src: './assets/maps/test-map.png' },
  { id: 'mapa-akademie', name: 'Mapa akademie', src: './assets/maps/mapa-akademie.png' },
];
const mapSelect = document.querySelector('#map-select');
let leaderMaps = [];
const activeMapStatus = document.querySelector('#active-map-status');
for (const entry of MAPS) {
  const option = document.createElement('option');
  option.value = entry.id;
  option.textContent = entry.name;
  mapSelect.append(option);
}
mapSelect.value = '';
const CELL_SIZE = 100; // Přirozené pixely mapy; 1 čtvercové pole = 5 ft.
const MIN_CELL_SIZE = 20;
const MAX_CELL_SIZE = 300;
let cellSize = CELL_SIZE;
const cellSizeOutput = document.querySelector('#cell-size');
const cellSizeStatus = document.querySelector('#cell-size-status');
cellSizeOutput.value = CELL_SIZE;
const TOKEN_SCALE = 0.9; // Hráčský token logicky zabírá jedno pole.
let tokenDiameter = cellSize * TOKEN_SCALE;
const mapStatus = document.querySelector('#map-status');
const tokens = new Map();
const npcs = new Map();
let npcDefinitions = [];
const npcBusy = new Set();
let npcRequest = 0;
let npcAdding = false;
const npcStatus = document.querySelector('#npc-status');
const npcList = document.querySelector('#npc-list');
const npcForm = document.querySelector('#npc-form');
document.querySelector('#npc-controls').hidden = !leaderMode;
const scenePlayers = document.querySelector('#scene-players');
const scenePlayersList = document.querySelector('#scene-players-list');
scenePlayers.hidden = !leaderMode;
const status = document.querySelector('#status');
const connection = document.querySelector('#connection');
const position = document.querySelector('#position');
const addTokenButton = document.querySelector('#add-token');
const addTokenMessage = document.querySelector('#add-token-message');
const removeTokenButton = document.querySelector('#remove-token');
const removeTokenMessage = document.querySelector('#remove-token-message');
let db;
let supabaseUrlForMaps = '';
let drag = null;
let connected = false;
let loading = true;
let realtimeRevision = 0;
let positionLoadVersion = 0;
const positionChanges = new Map();
let positionChannel = null;
let positionConnected = false;
let mapReady = false;
let configReady = false;
let savedCellSize = null;
let configRevision = 0;
let activeMapId = null;
let mapVersion = 0;
let gameStateRevision = 0;
let gameStateReady = false;
let savingMap = false;
let positionLoaded = false;

function showMessage(type, text, target = status) {
  target.textContent = text;
  target.setAttribute('data-message-type', type);
}

function updateAddTokenButton() {
  const own = tokens.values().next().value;
  const ready = positionLoaded && mapReady && configReady;
  addTokenButton.hidden = leaderMode || !ready || !own || Boolean(own.saved);
  removeTokenButton.hidden = leaderMode || !ready || !own?.saved;
  addTokenButton.disabled = removeTokenButton.disabled = !connected || !positionConnected || loading || Boolean(own?.busy);
  for (const state of tokens.values()) {
    if (!state.action) continue;
    state.label.textContent = `${state.saved ? '●' : '○'} ${state.name}${state.saved ? ' — na mapě' : ''}`;
    state.action.textContent = state.saved ? 'Odebrat' : 'Přidat';
    state.action.disabled = !ready || !connected || !positionConnected || loading || state.busy || Boolean(drag);
  }
}

function createToken(row, npc = false) {
  const element = document.createElement('div');
  element.className = 'token';
  element.hidden = true;
  element.style.width = element.style.height = `${tokenDiameter}px`;
  element.setAttribute('aria-label', row.name || 'Postava');
  element.textContent = (row.name || '?').slice(0, 1);
  if (row.portrait_path) {
    try {
      const url = new URL(row.portrait_path, document.baseURI);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid portrait URL');
      const portrait = document.createElement('img');
      portrait.alt = '';
      portrait.draggable = false;
      portrait.referrerPolicy = 'no-referrer';
      portrait.addEventListener('error', () => portrait.remove());
      portrait.src = url.href;
      element.append(portrait);
    } catch (error) { console.error('Portrét tokenu nelze načíst:', error); }
  }
  mapSpace.append(element);
  const state = { id: row.character_id, name: row.name, npc, element, saved: null, shown: null, busy: false, revision: 0 };
  (npc ? npcs : tokens).set(state.id, state);
  if (leaderMode && !npc) {
    state.item = document.createElement('li');
    state.label = document.createElement('span');
    state.action = document.createElement('button');
    state.action.type = 'button';
    state.message = document.createElement('p');
    state.message.setAttribute('role', 'status');
    state.action.addEventListener('click', () => editToken(state, state.saved ? 'remove' : 'add'));
    state.item.append(state.label, state.action, state.message);
    scenePlayersList.append(state.item);
  }
  element.addEventListener('pointerdown', event => beginDrag(state, event));
  element.addEventListener('pointermove', move);
  element.addEventListener('pointerup', endDrag);
  element.addEventListener('pointercancel', cancelDrag);
  element.addEventListener('lostpointercapture', cancelDrag);
  return state;
}

async function editToken(state, action) {
  if (!state || state.busy || drag || !positionLoaded || !mapReady || !configReady || !connected || !positionConnected || loading) return;
  if (action === 'remove' && !window.confirm('Odebrat postavu z této mapy?')) return;
  const destination = action === 'add' ? snapToCell({ x: map.naturalWidth / 2, y: map.naturalHeight / 2 }) : null;
  if (action === 'add' && !destination) {
    showMessage('error', 'Postavu nelze přidat: mapa neobsahuje celé pole.', state.message || addTokenMessage);
    return;
  }
  await saveToken(state, action, destination);
}

async function saveToken(state, action, point) {
  if (state.npc) return saveNpc(state, action, point);
  const mapId = activeMapId;
  const version = mapVersion;
  const revision = state.revision;
  const target = state.message || (action === 'add' ? addTokenMessage : action === 'remove' ? removeTokenMessage : status);
  state.busy = true;
  updateAddTokenButton();
  showMessage('info', 'Ukládám…', target);
  try {
    const data = await window.parent.mutateGameToken(action, state.id, mapId, point);
    if (version !== mapVersion || tokens.get(state.id) !== state) return;
    // Realtime (including DELETE) arriving while saving is newer than this response.
    if (revision === state.revision) {
      state.saved = data;
      state.revision++;
      positionChanges.set(state.id, { point: data, revision: ++realtimeRevision });
    }
    showMessage('info', '', target);
    status.textContent = 'Uloženo do DB.';
  } catch (error) {
    console.error('Změna tokenu selhala:', { action, mapId, characterId: state.id, error });
    if (version !== mapVersion || tokens.get(state.id) !== state) return;
    const text = action === 'add' ? 'Postavu se nepodařilo přidat na mapu. Zkus to znovu.'
      : action === 'remove' ? 'Postavu se nepodařilo odebrat z mapy. Zkus to znovu.'
      : 'Pozici postavy se nepodařilo uložit. Zkus obnovit stránku a přesunout ji znovu.';
    showMessage('error', text, target);
  } finally {
    if (version === mapVersion && tokens.get(state.id) === state) {
      state.busy = false;
      render(state, state.saved);
      updateAddTokenButton();
    }
  }
}

function clearNpcs() {
  npcRequest++;
  for (const state of npcs.values()) {
    if (drag?.state === state) cancelDrag({ pointerId: drag.id });
    state.element.remove(); state.item?.remove();
  }
  npcs.clear();
  npcDefinitions = [];
  npcList.replaceChildren();
}

async function refreshNpcs() {
  if (!activeMapId) return;
  const version = mapVersion;
  const request = ++npcRequest;
  try {
    const [rows, definitions] = await Promise.all([
      window.parent.loadNpcs(activeMapId),
      leaderMode ? window.parent.loadNpcDefinitions() : Promise.resolve([]),
    ]);
    if (version !== mapVersion || request !== npcRequest) return;
    if (!Array.isArray(rows) || !Array.isArray(definitions)) throw new Error('Invalid NPC list');
    npcDefinitions = definitions;
    const ids = new Set(rows.map(row => row.id));
    for (const [id, state] of npcs) {
      if (ids.has(id)) continue;
      if (drag?.state === state) cancelDrag({ pointerId: drag.id });
      state.element.remove(); state.item?.remove(); npcs.delete(id);
    }
    for (const row of rows) {
      const state = npcs.get(row.id) || createToken({ character_id: row.id,
        name: row.name || 'NPC', portrait_path: row.image_url }, true);
      state.saved = { x: row.x, y: row.y };
      state.npcId = row.npc_id;
      state.visible = row.visible;
      state.element.title = `${row.name || 'NPC'}${row.visible ? '' : ' (skryté hráčům)'}`;
      state.element.style.opacity = row.visible ? '1' : '0.5';
      if (!state.busy && drag?.state !== state) render(state, state.saved);
    }
    drawNpcList();
  } catch (error) {
    console.error('Načtení NPC selhalo:', error);
    if (version === mapVersion && request === npcRequest) {
      clearNpcs();
      npcStatus.textContent = 'NPC se nepodařilo načíst. Zkus obnovit stránku.';
    }
  }
}

function drawNpcList() {
  if (!leaderMode) return;
  npcList.replaceChildren();
  for (const definition of npcDefinitions) {
    const state = [...npcs.values()].find(item => item.npcId === definition.id);
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${definition.name || 'NPC'}${state ? state.visible ? ' — na mapě' : ' — skryté na mapě' : ''} `;
    item.append(label);
    const button = (text, action) => {
      const element = document.createElement('button');
      element.type = 'button'; element.textContent = text;
      element.disabled = npcBusy.has(definition.id) || Boolean(state?.busy);
      element.addEventListener('click', action); item.append(element);
    };
    button(state ? 'Odebrat z mapy' : 'Přidat na mapu', () => state
      ? saveNpc(state, 'remove') : changeNpcDefinition(definition, 'add'));
    if (state) button(state.visible ? 'Skrýt' : 'Odhalit', () => saveNpc(state, 'visibility'));
    button('Smazat NPC', () => {
      if (window.confirm('Opravdu smazat NPC? Tato akce odstraní NPC ze seznamu a ze všech map.')) {
        return changeNpcDefinition(definition, 'delete');
      }
    });
    npcList.append(item);
  }
}

async function changeNpcDefinition(definition, action) {
  if (!leaderMode || npcBusy.has(definition.id) || drag) return;
  const version = mapVersion;
  const args = { p_npc_id: definition.id };
  if (action === 'add') {
    if (!mapReady || !configReady) return;
    const point = snapToCell({ x: map.naturalWidth / 2, y: map.naturalHeight / 2 });
    if (!point) { npcStatus.textContent = 'Mapa neobsahuje celé pole pro NPC.'; return; }
    Object.assign(args, { p_map_id: activeMapId, p_x: point.x, p_y: point.y });
  }
  npcBusy.add(definition.id); drawNpcList();
  npcStatus.textContent = 'Ukládám NPC…';
  try {
    await window.parent.mutateNpc(action, args);
    if (version === mapVersion) npcStatus.textContent = '';
  } catch (error) {
    console.error('Změna NPC selhala:', error);
    if (version === mapVersion) npcStatus.textContent = 'Změnu NPC se nepodařilo uložit. Zkus to znovu.';
  } finally {
    npcBusy.delete(definition.id);
    if (version === mapVersion) await refreshNpcs();
  }
}

async function saveNpc(state, action, point) {
  if (!leaderMode || state.busy || npcBusy.has(state.npcId) || npcs.get(state.id) !== state || drag) return;
  const version = mapVersion;
  state.busy = true;
  drawNpcList();
  npcStatus.textContent = 'Ukládám NPC…';
  try {
    const args = { p_placement_id: state.id };
    if (action === 'move') Object.assign(args, { p_x: point.x, p_y: point.y });
    if (action === 'visibility') args.p_visible = !state.visible;
    await window.parent.mutateNpc(action, args);
    if (version === mapVersion) npcStatus.textContent = '';
  } catch (error) {
    console.error('Změna NPC selhala:', error);
    if (version === mapVersion) npcStatus.textContent = 'Změnu NPC se nepodařilo uložit. Zkus to znovu.';
  } finally {
    state.busy = false;
    if (version === mapVersion) {
      render(state, state.saved);
      await refreshNpcs();
    }
  }
}

npcForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!leaderMode || npcAdding) return;
  const name = document.querySelector('#npc-name').value.trim();
  if (!name) { npcStatus.textContent = 'Zadej název NPC.'; return; }
  const version = mapVersion;
  npcAdding = true;
  const button = npcForm.querySelector('button');
  button.disabled = true;
  npcStatus.textContent = 'Vytvářím NPC…';
  try {
    await window.parent.mutateNpc('create', { p_name: name,
      p_image_url: document.querySelector('#npc-image').value.trim() || null });
    if (version === mapVersion) { npcForm.reset(); npcStatus.textContent = ''; await refreshNpcs(); }
  } catch (error) {
    console.error('Přidání NPC selhalo:', error);
    if (version === mapVersion) npcStatus.textContent = 'NPC se nepodařilo přidat. Zkus to znovu.';
  } finally { npcAdding = false; button.disabled = false; }
});

addTokenButton.addEventListener('click', () => editToken(tokens.values().next().value, 'add'));
removeTokenButton.addEventListener('click', () => editToken(tokens.values().next().value, 'remove'));

async function activateMap(mapId, refresh = false) {
  if (mapId === activeMapId && configReady && !refresh) return;
  const version = ++mapVersion;
  clearNpcs();
  npcStatus.textContent = '';
  if (mapId !== activeMapId) resetCamera();
  activeMapId = mapId;
  configReady = false;
  mapReady = false;
  savedCellSize = null;
  configRevision = 0;
  cellSizeOutput.value = '';
  cellSizeStatus.textContent = '';
  map.hidden = true;
  grid.style.display = 'none';
  if (drag) cancelDrag({ pointerId: drag.id });
  for (const state of tokens.values()) { state.element.remove(); state.item?.remove(); }
  tokens.clear();
  positionChanges.clear();
  positionLoadVersion++;
  loading = true;
  positionLoaded = false;
  updateAddTokenButton();
  showMessage('info', '', addTokenMessage);
  showMessage('info', '', removeTokenMessage);
  realtimeRevision = 0;
  positionConnected = false;
  position.textContent = '—';
  status.textContent = 'Načítám postavy pro mapu…';
  if (positionChannel) {
    void db.removeChannel(positionChannel);
    positionChannel = null;
  }
  let entry = MAPS.find(item => item.id === mapId);
  if (!entry && leaderMode) {
    const row = leaderMaps.find(item => item.map_id === mapId);
    if (row) entry = { id: row.map_id, name: row.name, src: await resolveMapImage(row.image_path, row.map_id) };
  }
  if (!entry && db?.rpc) {
    const { data, error } = await db.rpc('active_map_metadata', { p_map_id: mapId });
    if (!error && data?.[0]) {
      const row = data[0];
      entry = { id: row.map_id, name: row.name, src: await resolveMapImage(row.image_path, row.map_id) };
    }
  }
  mapSelect.value = entry ? mapId : '';
  if (!entry) {
    console.error('Neznámé active_map_id:', mapId);
    showMessage('error', 'Tato mapa není dostupná. Vyber jinou mapu ze seznamu.', activeMapStatus);
    return;
  }
  activeMapStatus.textContent = `Aktivní mapa: ${entry.name}`;
  mapStatus.textContent = `Načítám mapu ${entry.name}…`;
  map.alt = entry.name;
  map.src = entry.src;
  subscribePosition(mapId, version);
  void refreshNpcs();
  await loadMapConfig(mapId, version);
  if (version === mapVersion) mapLoaded();
}

async function loadGameState() {
  const revision = gameStateRevision;
  gameStateReady = false;
  mapSelect.disabled = true;
  try {
    const { data, error } = await db.from('game_state').select('active_map_id').eq('id', 1).single();
    if (error) throw error;
    if (revision === gameStateRevision) await activateMap(data.active_map_id, true);
    gameStateReady = true;
    mapSelect.disabled = !connected || savingMap;
  } catch (error) {
    console.error('Načtení aktivní mapy selhalo:', error);
    showMessage('error', 'Aktivní mapu se nepodařilo načíst. Zkus obnovit stránku.', activeMapStatus);
  }
}

async function receiveGameState(payload) {
  gameStateRevision += 1;
  await activateMap(payload.new.active_map_id);
}

mapSelect.addEventListener('change', async () => {
  if (!leaderMode || !connected || !gameStateReady || savingMap) return;
  const mapId = mapSelect.value;
  if (!leaderMaps.some(entry => entry.map_id === mapId) || mapId === activeMapId) return;
  const revision = gameStateRevision;
  savingMap = true;
  mapSelect.disabled = true;
  activeMapStatus.textContent = 'Ukládám aktivní mapu…';
  try {
    const data = await window.parent.setLeaderActiveMap(mapId);
    if (revision === gameStateRevision) await activateMap(data.active_map_id);
  } catch (error) {
    console.error('Přepnutí mapy selhalo:', error);
    mapSelect.value = activeMapId;
    showMessage('error', 'Mapu se nepodařilo přepnout. Zkus to znovu.', activeMapStatus);
  } finally {
    savingMap = false;
    mapSelect.disabled = !connected || !gameStateReady;
  }
});

function validCellSize(value) {
  return Number.isFinite(value) && value >= MIN_CELL_SIZE && value <= MAX_CELL_SIZE;
}

function applyCellSize(value) {
  cellSize = value;
  tokenDiameter = cellSize * TOKEN_SCALE;
  for (const state of [...tokens.values(), ...npcs.values()]) {
    state.element.style.width = state.element.style.height = `${tokenDiameter}px`;
  }
  if (mapReady) renderGrid(document, grid, map.naturalWidth, map.naturalHeight, cellSize);
  cellSizeOutput.value = value;
  // Nevoláme render: jeho omezení na hranice by posunulo střed u kraje mapy.
}

async function loadMapConfig(mapId = activeMapId, version = mapVersion) {
  const revision = configRevision;
  configReady = false;
  cellSizeStatus.textContent = 'Načítám velikost pole z DB…';
  try {
    const { data, error } = await db.from('map_config').select('cell_size').eq('map_id', mapId).single();
    if (version !== mapVersion) return;
    if (error) throw error;
    if (revision === configRevision) {
      if (!validCellSize(data.cell_size)) throw new Error('Neplatná velikost pole v DB (povoleno 20–300 px)');
      savedCellSize = data.cell_size;
    }
    applyCellSize(savedCellSize);
    configReady = true;
    cellSizeStatus.textContent = 'Velikost pole načtena z DB.';
  } catch (error) {
    console.error('Načtení velikosti pole selhalo:', error);
    if (version !== mapVersion) return;
    showMessage('error', 'Velikost pole se nepodařilo načíst. Zkus obnovit stránku.', cellSizeStatus);
  }
}

function receiveMapConfig(payload) {
  if (payload.new.map_id !== activeMapId) return;
  const value = payload.new.cell_size;
  if (!validCellSize(value)) {
    console.error('Neplatné cell_size z realtime:', value);
    showMessage('error', 'Velikost pole se nepodařilo aktualizovat. Zkus obnovit stránku.', cellSizeStatus);
    return;
  }
  configRevision += 1;
  savedCellSize = value;
  applyCellSize(value);
  cellSizeStatus.textContent = 'Velikost pole přijata přes realtime.';
}

function mapLoaded() {
  if (!configReady || !map.complete || !map.naturalWidth) return;
  mapReady = true;
  map.hidden = false;
  grid.style.display = '';
  mapSpace.style.width = `${map.naturalWidth}px`;
  mapSpace.style.height = `${map.naturalHeight}px`;
  fitMap();
  renderGrid(document, grid, map.naturalWidth, map.naturalHeight, cellSize);
  mapStatus.textContent = `Mapa: ${map.naturalWidth} × ${map.naturalHeight} px. Souřadnice označují střed tokenu.`;
  for (const state of [...tokens.values(), ...npcs.values()]) render(state, state.saved);
  updateAddTokenButton();
}
map.addEventListener('load', mapLoaded);
map.addEventListener('error', () => {
  mapReady = false;
  for (const state of [...tokens.values(), ...npcs.values()]) state.element.hidden = true;
  updateAddTokenButton();
  console.error('Načtení obrázku mapy selhalo:', MAPS.find(entry => entry.id === activeMapId)?.src);
  showMessage('error', 'Obrázek mapy se nepodařilo načíst. Zkus obnovit stránku.', mapStatus);
});
if (map.complete && map.naturalWidth) mapLoaded();

function render(state, point) {
  if (!point) {
    state.element.hidden = true;
    state.shown = null;
    if (!leaderMode) position.textContent = '—';
    return;
  }
  if (!mapReady) return;
  state.element.hidden = false;
  // Same center-coordinate bounds as the original single token.
  const halfWidth = tokenDiameter / 2;
  const halfHeight = tokenDiameter / 2;
  state.shown = {
    x: Math.max(halfWidth, Math.min(map.naturalWidth - halfWidth, point.x)),
    y: Math.max(halfHeight, Math.min(map.naturalHeight - halfHeight, point.y)),
  };
  state.element.style.left = `${state.shown.x}px`;
  state.element.style.top = `${state.shown.y}px`;
  if (!leaderMode || drag?.state === state) position.textContent = `x = ${state.shown.x}, y = ${state.shown.y}`;
}

function subscribePosition(mapId, version) {
  function receive(row, point) {
    if (version !== mapVersion || row.map_id !== mapId) return;
    if (!leaderMode && row.character_id !== gameIdentity.character_id) return;
    const revision = ++realtimeRevision;
    positionChanges.set(row.character_id, { point, revision });
    const state = tokens.get(row.character_id);
    if (!state) return; // Initial RPC will merge events received before the roster.
    state.revision++;
    state.saved = point;
    if (!point && drag?.state === state) cancelDrag({ pointerId: drag.id });
    if (!point || (!state.busy && drag?.state !== state)) render(state, point);
    showMessage('info', '', state.message || addTokenMessage);
    if (!leaderMode) showMessage('info', '', removeTokenMessage);
    updateAddTokenButton();
  }
  positionChannel = db.channel(`token-position-${mapId}-${version}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'token_positions', filter: `map_id=eq.${mapId}` }, payload => receive(payload.new, { x: payload.new.x, y: payload.new.y }))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'token_positions', filter: `map_id=eq.${mapId}` }, payload => receive(payload.new, { x: payload.new.x, y: payload.new.y }))
    // DELETE may contain only primary keys. No server filter: reconcile via RPC if keys are incomplete.
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'token_positions' }, payload => {
      if (version !== mapVersion) return;
      if (payload.old?.map_id && payload.old?.character_id) receive(payload.old, null);
      else return loadPosition(mapId, version);
    })
    .subscribe(async state => {
      if (version !== mapVersion) return;
      positionConnected = state === 'SUBSCRIBED';
      updateAddTokenButton();
      if (positionConnected) await loadPosition(mapId, version);
      else {
        console.error('Realtime pozice není připojené:', state);
        showMessage('error', 'Spojení s mapou je přerušené. Počkej na opětovné připojení.');
      }
    });
}

async function loadPosition(mapId = activeMapId, version = mapVersion) {
  const request = ++positionLoadVersion;
  const revision = realtimeRevision;
  loading = true;
  positionLoaded = false;
  updateAddTokenButton();
  try {
    const rows = await window.parent.loadGameTokens(mapId);
    if (version !== mapVersion || request !== positionLoadVersion) return;
    if (!Array.isArray(rows)) throw new Error('Invalid token list');
    const ids = new Set();
    for (const row of rows) {
      if (!leaderMode && row.character_id !== gameIdentity.character_id) continue;
      ids.add(row.character_id);
      const state = tokens.get(row.character_id) || createToken(row);
      const change = positionChanges.get(row.character_id);
      state.saved = change && change.revision > revision ? change.point
        : row.x === null || row.y === null ? null : { x: row.x, y: row.y };
      state.revision++;
      if (!state.saved && drag?.state === state) cancelDrag({ pointerId: drag.id });
      if (!state.saved || (!state.busy && drag?.state !== state)) render(state, state.saved);
    }
    for (const [id, state] of tokens) {
      if (ids.has(id)) continue;
      if (drag?.state === state) cancelDrag({ pointerId: drag.id });
      state.element.remove(); state.item?.remove(); tokens.delete(id);
    }
    positionLoaded = true;
    status.textContent = rows.length ? 'Pozice načteny z DB.' : 'Nejsou přiřazené žádné hráčské postavy.';
  } catch (error) {
    console.error('Načtení pozic postav selhalo:', error);
    if (version !== mapVersion || request !== positionLoadVersion) return;
    showMessage('error', 'Pozice postav se nepodařilo načíst. Obnovte stránku a přihlaste se znovu.');
  } finally {
    if (version === mapVersion && request === positionLoadVersion) {
      loading = false;
      updateAddTokenButton();
    }
  }
}

function beginDrag(state, event) {
  if (event.button !== 0 || drag || !mapReady || !state.saved || state.busy || loading || !positionLoaded || !connected || !positionConnected || !configReady) return;
  if (!leaderMode && (state.npc || state.id !== gameIdentity.character_id)) return;
  event.preventDefault();
  const rect = mapSpace.getBoundingClientRect();
  drag = { state, id: event.pointerId, offsetX: (event.clientX - rect.left) / mapScale - state.shown.x,
    offsetY: (event.clientY - rect.top) / mapScale - state.shown.y, moved: false, mapId: activeMapId, version: mapVersion, ...state.shown };
  state.element.setPointerCapture(event.pointerId);
  state.element.classList.add('dragging');
  updateAddTokenButton();
  status.textContent = 'Přetahuji lokálně — zatím neukládám.';
}

function move(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const state = drag.state;
  // Aktuální rect zahrnuje scroll i posun stránky během tažení.
  const rect = mapSpace.getBoundingClientRect();
  render(state, {
    x: Math.round((event.clientX - rect.left) / mapScale - drag.offsetX),
    y: Math.round((event.clientY - rect.top) / mapScale - drag.offsetY),
  });
  if (state.shown.x !== drag.x || state.shown.y !== drag.y) drag.moved = true;
}

function snapToCell(point) {
  const columnCount = Math.floor(map.naturalWidth / cellSize);
  const rowCount = Math.floor(map.naturalHeight / cellSize);
  if (!columnCount || !rowCount) return null;
  // Na přesné hranici dvou polí vyhrává pravé/spodní pole.
  const column = Math.max(0, Math.min(columnCount - 1, Math.floor(point.x / cellSize)));
  const row = Math.max(0, Math.min(rowCount - 1, Math.floor(point.y / cellSize)));
  return { x: column * cellSize + cellSize / 2, y: row * cellSize + cellSize / 2 };
}

async function endDrag(event) {
  if (!drag || event.pointerId !== drag.id) return;
  move(event);
  const start = drag;
  const state = start.state;
  const destination = start.moved ? snapToCell(state.shown) : null;
  drag = null;
  state.element.classList.remove('dragging');
  state.element.releasePointerCapture(event.pointerId);
  updateAddTokenButton();
  if (!state.saved || !destination || (destination.x === state.saved.x && destination.y === state.saved.y)) {
    render(state, state.saved);
    status.textContent = 'Beze změny — nic neukládám.';
    return;
  }
  render(state, destination);
  await saveToken(state, 'move', destination);
}

function cancelDrag(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const state = drag.state;
  drag = null;
  state.element.classList.remove('dragging');
  if (state.element.hasPointerCapture(event.pointerId)) state.element.releasePointerCapture(event.pointerId);
  render(state, state.saved);
  updateAddTokenButton();
  status.textContent = 'Pohyb zrušen — nic neukládám.';
}

try {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import('./config.local.js');
  supabaseUrlForMaps = SUPABASE_URL;
  configureMapImageUrl(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  if (leaderMode) {
    leaderMaps = await window.parent.loadLeaderMaps();
    mapSelect.replaceChildren();
    for (const entry of leaderMaps) {
      const option = document.createElement('option');
      option.value = entry.map_id;
      option.textContent = entry.name;
      mapSelect.append(option);
    }
    mapSelect.hidden = false;
    document.querySelector('#map-select-label').hidden = false;
  }
  if (!SUPABASE_URL?.startsWith('https://') || SUPABASE_URL.includes('YOUR_PROJECT')) {
    throw new Error('Doplňte platnou SUPABASE_URL v config.local.js');
  }
  if (!SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_') || SUPABASE_PUBLISHABLE_KEY.includes('REPLACE_ME')) {
    throw new Error('SUPABASE_PUBLISHABLE_KEY v config.local.js musí obsahovat celý klíč sb_publishable_…');
  }
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
  db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  db.channel('npc-changes')
    .on('broadcast', { event: 'changed' }, () => { void refreshNpcs(); })
    .subscribe(state => { if (state === 'SUBSCRIBED') void refreshNpcs(); });
  db.channel('map-state')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'map_config' }, receiveMapConfig)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state', filter: 'id=eq.1' }, receiveGameState)
    .subscribe(async (state) => {
      connected = state === 'SUBSCRIBED';
      mapSelect.disabled = !connected || !gameStateReady || savingMap;
      updateAddTokenButton();
      connection.textContent = connected ? 'Připojeno.' : 'Spojení je přerušené. Čekám na opětovné připojení…';
      if (!connected) console.error('Realtime mapy není připojené:', state);
      if (connected) {
        await loadGameState();
      }
    });
  status.textContent = 'Čekám na realtime připojení…';
} catch (error) {
  console.error('Spuštění aplikace selhalo:', error);
  connection.textContent = 'Realtime: nepřipojeno';
  showMessage('error', 'Aplikaci se nepodařilo spustit. Zkus obnovit stránku. Pokud problém trvá, obrať se na správce.');
}
