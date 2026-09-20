const map = document.querySelector('#map');
const mapSpace = document.querySelector('#map-space');
const grid = document.querySelector('#grid');
const CELL_SIZE = 100; // Přirozené pixely mapy; 1 čtvercové pole = 5 ft.
const TOKEN_SCALE = 0.9; // Hráčský token logicky zabírá jedno pole.
const tokenDiameter = CELL_SIZE * TOKEN_SCALE;
const mapStatus = document.querySelector('#map-status');
const token = document.querySelector('#token');
token.style.width = `${tokenDiameter}px`;
token.style.height = `${tokenDiameter}px`;
const status = document.querySelector('#status');
const connection = document.querySelector('#connection');
const position = document.querySelector('#position');
let db;
let saved = null;
let shown = null;
let drag = null;
let saving = false;
let connected = false;
let loading = true;
let realtimeRevision = 0;
let mapReady = false;

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
  for (let x = 0; x <= width; x += CELL_SIZE) line(x, 0, x, height);
  for (let y = 0; y <= height; y += CELL_SIZE) line(0, y, width, y);
}

function mapLoaded() {
  mapReady = true;
  mapSpace.style.width = `${map.naturalWidth}px`;
  mapSpace.style.height = `${map.naturalHeight}px`;
  renderGrid();
  mapStatus.textContent = `Mapa: ${map.naturalWidth} × ${map.naturalHeight} px (1:1). Souřadnice označují střed tokenu.`;
  if (saved) render(saved);
}
map.addEventListener('load', mapLoaded);
map.addEventListener('error', () => {
  mapReady = false;
  token.hidden = true;
  mapStatus.textContent = 'Mapu se nepodařilo načíst. Zkontrolujte assets/maps/test-map.png a obnovte stránku.';
});
if (map.complete && map.naturalWidth) mapLoaded();

function render(point) {
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

async function loadPosition() {
  loading = true;
  const revision = realtimeRevision;
  try {
    const { data, error } = await db.from('spike_token').select('x,y').eq('id', 1).single();
    if (error) throw error;
    // Novější realtime událost nesmí přepsat pomalejší odpověď SELECTu.
    if (revision === realtimeRevision) saved = data;
    if (!drag && !saving) render(saved);
    status.textContent = 'Načteno z DB.';
  } catch (error) {
    status.textContent = `Načtení selhalo: ${error.message}. Zkuste reload.`;
  } finally {
    loading = false;
  }
}

token.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || drag || !mapReady || !saved || saving || loading || !connected) return;
  event.preventDefault();
  const rect = mapSpace.getBoundingClientRect();
  drag = { id: event.pointerId, offsetX: event.clientX - rect.left - shown.x,
    offsetY: event.clientY - rect.top - shown.y, moved: false, ...shown };
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
  const columnCount = Math.floor(map.naturalWidth / CELL_SIZE);
  const rowCount = Math.floor(map.naturalHeight / CELL_SIZE);
  if (!columnCount || !rowCount) return null;
  // Na přesné hranici dvou polí vyhrává pravé/spodní pole.
  const column = Math.max(0, Math.min(columnCount - 1, Math.floor(point.x / CELL_SIZE)));
  const row = Math.max(0, Math.min(rowCount - 1, Math.floor(point.y / CELL_SIZE)));
  return { x: column * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 };
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
    // Jediné místo, které zapisuje do DB: jeden UPDATE po dokončení pohybu.
    const { data, error } = await db.from('spike_token')
      .update(destination).eq('id', 1).select('x,y').single();
    if (error) throw error;
    saved = data;
    render(saved);
    status.textContent = 'Uloženo do DB.';
  } catch (error) {
    render(saved);
    status.textContent = `Uložení selhalo: ${error.message}. Pro ověření stavu proveďte reload.`;
  } finally {
    saving = false;
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
  db.channel('tech-001-token')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'spike_token', filter: 'id=eq.1' }, (payload) => {
      realtimeRevision += 1;
      saved = { x: payload.new.x, y: payload.new.y };
      if (!drag && !saving) {
        render(saved);
        status.textContent = 'Přijato přes realtime.';
      }
    })
    .subscribe((state) => {
      connected = state === 'SUBSCRIBED';
      connection.textContent = connected ? 'Realtime: připojeno' : `Realtime: ${state}`;
      if (connected) void loadPosition();
    });
  status.textContent = 'Čekám na realtime připojení…';
} catch (error) {
  connection.textContent = 'Realtime: nepřipojeno';
  status.textContent = `Spuštění selhalo. Zkontrolujte config.local.js (vzor: config.example.js) a dostupnost CDN. ${error.message}`;
}
