const map = document.querySelector('#map');
const mapSpace = document.querySelector('#map-space');
const grid = document.querySelector('#grid');
// navigation.js spustí mapu pouze s platným character_id v URL.
const CHARACTER_ID = new URLSearchParams(window.location.search).get('character_id').toLowerCase();
const MAPS = [
  { id: 'test-map', name: 'Test map', src: './assets/maps/test-map.png' },
  { id: 'mapa-akademie', name: 'Mapa akademie', src: './assets/maps/mapa-akademie.png' },
];
const mapSelect = document.querySelector('#map-select');
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
const cellSizeInput = document.querySelector('#cell-size');
const cellSizeError = document.querySelector('#cell-size-error');
const cellSizeStatus = document.querySelector('#cell-size-status');
cellSizeInput.min = MIN_CELL_SIZE;
cellSizeInput.max = MAX_CELL_SIZE;
cellSizeInput.value = CELL_SIZE;
const TOKEN_SCALE = 0.9; // Hráčský token logicky zabírá jedno pole.
let tokenDiameter = cellSize * TOKEN_SCALE;
const mapStatus = document.querySelector('#map-status');
const token = document.querySelector('#token');
token.style.width = `${tokenDiameter}px`;
token.style.height = `${tokenDiameter}px`;
const status = document.querySelector('#status');
const connection = document.querySelector('#connection');
const position = document.querySelector('#position');
const addTokenButton = document.querySelector('#add-token');
const addTokenMessage = document.querySelector('#add-token-message');
const removeTokenButton = document.querySelector('#remove-token');
const removeTokenMessage = document.querySelector('#remove-token-message');
let db;
let saved = null;
let shown = null;
let drag = null;
let saving = false;
let connected = false;
let loading = true;
let realtimeRevision = 0;
let positionChannel = null;
let positionConnected = false;
let mapReady = false;
let configReady = false;
let savedCellSize = null;
let configRevision = 0;
let inputRevision = 0;
let pendingConfigWrites = 0;
let configWriteQueue = Promise.resolve();
let activeMapId = null;
let mapVersion = 0;
let gameStateRevision = 0;
let gameStateReady = false;
let savingMap = false;
let positionLoaded = false;
let addingToken = false;
let removingToken = false;

function showMessage(type, text, target = status) {
  target.textContent = text;
  target.setAttribute('data-message-type', type);
}

function updateAddTokenButton() {
  addTokenButton.hidden = !positionLoaded || Boolean(saved) || !mapReady || !configReady;
  addTokenButton.disabled = addingToken || !connected || !positionConnected;
  removeTokenButton.hidden = !positionLoaded || !saved || !mapReady || !configReady;
  removeTokenButton.disabled = removingToken || !connected || !positionConnected;
}

removeTokenButton.addEventListener('click', async () => {
  if (removingToken || !saved || !positionLoaded || !mapReady || !configReady || !connected || !positionConnected) return;
  if (!window.confirm('Odebrat postavu z této mapy?')) return;
  const mapId = activeMapId;
  const version = mapVersion;
  removingToken = true;
  updateAddTokenButton();
  showMessage('info', 'Odebírám postavu z mapy…', removeTokenMessage);
  try {
    const { error } = await db.from('token_positions')
      .delete().eq('character_id', CHARACTER_ID).eq('map_id', mapId);
    if (error) throw error;
    if (version !== mapVersion) return;
    saved = null;
    render(null);
    showMessage('info', '', removeTokenMessage);
    showMessage('info', 'Postava byla odebrána z mapy.');
  } catch (error) {
    console.error('Odebrání postavy z mapy selhalo:', { mapId, characterId: CHARACTER_ID, error });
    if (version === mapVersion) showMessage('error', 'Postavu se nepodařilo odebrat z mapy. Zkus to znovu.', removeTokenMessage);
  } finally {
    if (version === mapVersion) {
      removingToken = false;
      updateAddTokenButton();
    }
  }
});

addTokenButton.addEventListener('click', async () => {
  if (addingToken || saved || !positionLoaded || !mapReady || !configReady || !connected || !positionConnected) return;
  const mapId = activeMapId;
  const version = mapVersion;
  const revision = realtimeRevision;
  addingToken = true;
  updateAddTokenButton();
  showMessage('info', 'Přidávám postavu na mapu…', addTokenMessage);
  try {
    const destination = snapToCell({ x: map.naturalWidth / 2, y: map.naturalHeight / 2 });
    if (!destination) throw new Error('Mapa neobsahuje úplné gridové pole.');
    // INSERT nikdy nepřepisuje pozici, kterou mezitím vytvořil jiný klient.
    const { data, error } = await db.from('token_positions')
      .insert({ character_id: CHARACTER_ID, map_id: mapId, ...destination })
      .select('x,y').single();
    if (error) throw error;
    if (version !== mapVersion) return;
    if (revision === realtimeRevision) saved = data;
    render(saved);
    showMessage('info', '', addTokenMessage);
    showMessage('info', 'Postava je přidaná na mapu.');
  } catch (error) {
    console.error('Přidání postavy na mapu selhalo:', { mapId, characterId: CHARACTER_ID, error });
    if (version !== mapVersion) return;
    // Realtime mohl mezitím potvrdit vložení od druhého klienta.
    showMessage(saved ? 'info' : 'error', saved ? '' : 'Postavu se nepodařilo přidat na mapu. Zkus to znovu.', addTokenMessage);
  } finally {
    if (version === mapVersion) {
      addingToken = false;
      updateAddTokenButton();
    }
  }
});

async function activateMap(mapId, refresh = false) {
  if (mapId === activeMapId && configReady && !refresh) return;
  const version = ++mapVersion;
  activeMapId = mapId;
  configReady = false;
  mapReady = false;
  savedCellSize = null;
  configRevision = 0;
  pendingConfigWrites = 0;
  inputRevision += 1;
  cellSizeInput.disabled = true;
  cellSizeInput.value = '';
  cellSizeInput.setAttribute('aria-invalid', 'false');
  cellSizeError.textContent = '';
  cellSizeStatus.textContent = '';
  map.hidden = true;
  grid.style.display = 'none';
  token.hidden = true;
  saved = null;
  shown = null;
  saving = false;
  loading = true;
  positionLoaded = false;
  addingToken = false;
  removingToken = false;
  updateAddTokenButton();
  showMessage('info', '', addTokenMessage);
  showMessage('info', '', removeTokenMessage);
  realtimeRevision = 0;
  positionConnected = false;
  position.textContent = '—';
  status.textContent = 'Načítám pozici postavy pro mapu…';
  if (positionChannel) {
    void db.removeChannel(positionChannel);
    positionChannel = null;
  }
  // Přepnutí během dragu pohyb zruší; žádná nová tokenová pozice se neukládá.
  if (drag) {
    const pointerId = drag.id;
    drag = null;
    token.classList.remove('dragging');
    token.releasePointerCapture(pointerId);
  }
  const entry = MAPS.find(item => item.id === mapId);
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
  if (!connected || !gameStateReady || savingMap) return;
  const mapId = mapSelect.value;
  if (!MAPS.some(entry => entry.id === mapId) || mapId === activeMapId) return;
  const revision = gameStateRevision;
  savingMap = true;
  mapSelect.disabled = true;
  activeMapStatus.textContent = 'Ukládám aktivní mapu…';
  try {
    const { data, error } = await db.from('game_state')
      .update({ active_map_id: mapId }).eq('id', 1).select('active_map_id').single();
    if (error) throw error;
    if (revision === gameStateRevision) await activateMap(data.active_map_id);
  } catch (error) {
    console.error('Přepnutí mapy selhalo:', error);
    mapSelect.value = MAPS.some(entry => entry.id === activeMapId) ? activeMapId : '';
    showMessage('error', 'Mapu se nepodařilo přepnout. Zkus to znovu.', activeMapStatus);
  } finally {
    savingMap = false;
    mapSelect.disabled = !connected || !gameStateReady;
  }
});

function validCellSize(value) {
  return Number.isFinite(value) && value >= MIN_CELL_SIZE && value <= MAX_CELL_SIZE;
}

function applyCellSize(value, updateInput = true) {
  cellSize = value;
  tokenDiameter = cellSize * TOKEN_SCALE;
  token.style.width = `${tokenDiameter}px`;
  token.style.height = `${tokenDiameter}px`;
  if (mapReady) renderGrid();
  if (updateInput) {
    cellSizeInput.value = value;
    cellSizeInput.setAttribute('aria-invalid', 'false');
    cellSizeError.textContent = '';
  }
  // Nevoláme render: jeho omezení na hranice by posunulo střed u kraje mapy.
}

async function loadMapConfig(mapId = activeMapId, version = mapVersion) {
  const revision = configRevision;
  cellSizeInput.disabled = true;
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
    cellSizeInput.disabled = !connected;
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
  if (!pendingConfigWrites) {
    applyCellSize(value);
    cellSizeStatus.textContent = 'Velikost pole přijata přes realtime.';
  }
}

cellSizeInput.addEventListener('input', () => {
  if (!configReady || !connected) return;
  const revision = ++inputRevision;
  const mapId = activeMapId;
  const version = mapVersion;
  const value = cellSizeInput.valueAsNumber;
  let error = '';
  if (cellSizeInput.validity.badInput) {
    error = 'Zadej velikost pole jako číslo.';
  } else if (cellSizeInput.value === '') {
    error = 'Zadej velikost pole.';
  } else if (!Number.isFinite(value) || value < MIN_CELL_SIZE || value > MAX_CELL_SIZE) {
    error = `Zadej velikost pole od ${MIN_CELL_SIZE} do ${MAX_CELL_SIZE} px.`;
  }
  cellSizeInput.setAttribute('aria-invalid', String(Boolean(error)));
  cellSizeError.textContent = error;
  if (error) return;
  applyCellSize(value, false);
  pendingConfigWrites += 1;
  cellSizeStatus.textContent = 'Ukládám velikost pole…';
  // Rychlé změny jednoho inputu zapisujeme v pořadí, ve kterém vznikly.
  configWriteQueue = configWriteQueue.then(async () => {
    try {
      const { data, error } = await db.from('map_config')
        .update({ cell_size: value }).eq('map_id', mapId).select('cell_size').single();
      if (version !== mapVersion) return;
      if (error) throw error;
      if (!validCellSize(data.cell_size)) throw new Error('DB vrátila neplatnou velikost pole');
      savedCellSize = data.cell_size;
      if (revision === inputRevision) {
        applyCellSize(savedCellSize);
        cellSizeStatus.textContent = 'Velikost pole uložena do DB.';
      }
    } catch (error) {
      console.error('Uložení velikosti pole selhalo:', error);
      if (version === mapVersion && revision === inputRevision) {
        applyCellSize(savedCellSize);
        showMessage('error', 'Velikost pole se nepodařilo uložit. Zkus to znovu.', cellSizeStatus);
      }
    } finally {
      if (version === mapVersion) pendingConfigWrites -= 1;
    }
  });
});

function renderGrid() {
  const width = map.naturalWidth;
  const height = map.naturalHeight;
  grid.setAttribute('width', width);
  grid.setAttribute('height', height);
  grid.setAttribute('viewBox', `0 0 ${width} ${height}`);
  grid.replaceChildren();
  function line(x1, y1, x2, y2) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    for (const [name, value] of Object.entries({ x1, y1, x2, y2 })) {
      element.setAttribute(name, value);
    }
    grid.append(element);
  }
  for (let x = 0; x <= width; x += cellSize) line(x, 0, x, height);
  for (let y = 0; y <= height; y += cellSize) line(0, y, width, y);
}

function mapLoaded() {
  if (!configReady || !map.complete || !map.naturalWidth) return;
  mapReady = true;
  map.hidden = false;
  grid.style.display = '';
  mapSpace.style.width = `${map.naturalWidth}px`;
  mapSpace.style.height = `${map.naturalHeight}px`;
  renderGrid();
  mapStatus.textContent = `Mapa: ${map.naturalWidth} × ${map.naturalHeight} px (1:1). Souřadnice označují střed tokenu.`;
  if (saved) render(saved);
  updateAddTokenButton();
}
map.addEventListener('load', mapLoaded);
map.addEventListener('error', () => {
  mapReady = false;
  token.hidden = true;
  updateAddTokenButton();
  console.error('Načtení obrázku mapy selhalo:', MAPS.find(entry => entry.id === activeMapId)?.src);
  showMessage('error', 'Obrázek mapy se nepodařilo načíst. Zkus obnovit stránku.', mapStatus);
});
if (map.complete && map.naturalWidth) mapLoaded();

function render(point) {
  if (!point) {
    token.hidden = true;
    shown = null;
    position.textContent = '—';
    return;
  }
  if (!mapReady) return;
  token.hidden = false;
  // I starší pozici z DB zobrazíme uvnitř mapy, bez automatického zápisu.
  const halfWidth = tokenDiameter / 2;
  const halfHeight = tokenDiameter / 2;
  shown = {
    x: Math.max(halfWidth, Math.min(map.naturalWidth - halfWidth, point.x)),
    y: Math.max(halfHeight, Math.min(map.naturalHeight - halfHeight, point.y)),
  };
  token.style.left = `${shown.x}px`;
  token.style.top = `${shown.y}px`;
  position.textContent = `x = ${shown.x}, y = ${shown.y}`;
}

function subscribePosition(mapId, version) {
  const receive = (payload) => {
    const row = payload.new;
    if (version !== mapVersion || row.character_id !== CHARACTER_ID || row.map_id !== mapId) return;
    realtimeRevision += 1;
    saved = { x: row.x, y: row.y };
    positionLoaded = true;
    updateAddTokenButton();
    showMessage('info', '', addTokenMessage);
    showMessage('info', '', removeTokenMessage);
    if (!drag && !saving) {
      render(saved);
      status.textContent = 'Pozice přijata přes realtime.';
    }
  };
  positionChannel = db.channel(`token-position-${mapId}-${version}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'token_positions', filter: `map_id=eq.${mapId}` }, receive)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'token_positions', filter: `map_id=eq.${mapId}` }, receive)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'token_positions', filter: `map_id=eq.${mapId}` }, (payload) => {
      const row = payload.old;
      if (version !== mapVersion || row.character_id !== CHARACTER_ID || row.map_id !== mapId) return;
      realtimeRevision += 1;
      saved = null;
      render(null);
      positionLoaded = true;
      showMessage('info', '', removeTokenMessage);
      showMessage('info', 'Postava byla odebrána z mapy.');
      updateAddTokenButton();
    })
    .subscribe(async (state) => {
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
  loading = true;
  positionLoaded = false;
  updateAddTokenButton();
  const revision = realtimeRevision;
  try {
    const { data, error } = await db.from('token_positions').select('x,y')
      .eq('character_id', CHARACTER_ID).eq('map_id', mapId).maybeSingle();
    if (version !== mapVersion) return;
    if (error) throw error;
    // Novější realtime událost nesmí přepsat pomalejší odpověď SELECTu.
    if (revision === realtimeRevision) saved = data;
    positionLoaded = true;
    if (!drag && !saving) render(saved);
    status.textContent = saved ? 'Pozice načtena z DB.' : 'Postava na této mapě nemá uloženou pozici.';
  } catch (error) {
    console.error('Načtení pozice postavy selhalo:', error);
    if (version !== mapVersion) return;
    showMessage('error', 'Pozici postavy se nepodařilo načíst. Zkus obnovit stránku.');
  } finally {
    if (version === mapVersion) {
      loading = false;
      updateAddTokenButton();
    }
  }
}

token.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || drag || !mapReady || !saved || saving || loading || !connected || !positionConnected || !configReady) return;
  event.preventDefault();
  const rect = mapSpace.getBoundingClientRect();
  drag = { id: event.pointerId, offsetX: event.clientX - rect.left - shown.x,
    offsetY: event.clientY - rect.top - shown.y, moved: false, mapId: activeMapId, version: mapVersion, ...shown };
  token.setPointerCapture(event.pointerId);
  token.classList.add('dragging');
  status.textContent = 'Přetahuji lokálně — zatím neukládám.';
});

function move(event) {
  if (!drag || event.pointerId !== drag.id) return;
  // Aktuální rect zahrnuje scroll i posun stránky během tažení.
  const rect = mapSpace.getBoundingClientRect();
  render({
    x: Math.round(event.clientX - rect.left - drag.offsetX),
    y: Math.round(event.clientY - rect.top - drag.offsetY),
  });
  if (shown.x !== drag.x || shown.y !== drag.y) drag.moved = true;
}
token.addEventListener('pointermove', move);

function snapToCell(point) {
  const columnCount = Math.floor(map.naturalWidth / cellSize);
  const rowCount = Math.floor(map.naturalHeight / cellSize);
  if (!columnCount || !rowCount) return null;
  // Na přesné hranici dvou polí vyhrává pravé/spodní pole.
  const column = Math.max(0, Math.min(columnCount - 1, Math.floor(point.x / cellSize)));
  const row = Math.max(0, Math.min(rowCount - 1, Math.floor(point.y / cellSize)));
  return { x: column * cellSize + cellSize / 2, y: row * cellSize + cellSize / 2 };
}

token.addEventListener('pointerup', async (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  move(event);
  const start = drag;
  const destination = start.moved ? snapToCell(shown) : null;
  drag = null;
  token.classList.remove('dragging');
  token.releasePointerCapture(event.pointerId);
  if (!destination || (destination.x === saved.x && destination.y === saved.y)) {
    render(saved);
    status.textContent = 'Beze změny — nic neukládám.';
    return;
  }
  render(destination);
  saving = true;
  status.textContent = 'Ukládám…';
  try {
    // Pozice patří dvojici postava + mapa zachycené při začátku dragu.
    const { data, error } = await db.from('token_positions')
      .upsert({ character_id: CHARACTER_ID, map_id: start.mapId, ...destination },
        { onConflict: 'character_id,map_id' }).select('x,y').single();
    if (start.version !== mapVersion) return;
    if (error) throw error;
    saved = data;
    render(saved);
    status.textContent = 'Uloženo do DB.';
  } catch (error) {
    console.error('Uložení pozice postavy selhalo:', error);
    if (start.version !== mapVersion) return;
    render(saved);
    showMessage('error', 'Pozici postavy se nepodařilo uložit. Zkus obnovit stránku a přesunout ji znovu.');
  } finally {
    if (start.version === mapVersion) saving = false;
  }
});

function cancelDrag(event) {
  if (!drag || event.pointerId !== drag.id) return;
  drag = null;
  token.classList.remove('dragging');
  render(saved);
  status.textContent = 'Pohyb zrušen — nic neukládám.';
}
token.addEventListener('pointercancel', cancelDrag);
token.addEventListener('lostpointercapture', cancelDrag);

try {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import('./config.local.js');
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
  db.channel('map-state')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'map_config' }, receiveMapConfig)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'game_state', filter: 'id=eq.1' }, receiveGameState)
    .subscribe(async (state) => {
      connected = state === 'SUBSCRIBED';
      cellSizeInput.disabled = !connected || !configReady;
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
