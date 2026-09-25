import { getCurrentUser } from './login.js';
import { loadMaps, setMapCellSize, mapImageUrl } from './leader-map-api.js';
import { renderGrid } from './grid.js';
import { resolveMapImage } from './map-image.js';

const panel = document.querySelector('#map-preparation');
const list = document.querySelector('#leader-maps');
const input = document.querySelector('#prep-cell-size');
const error = document.querySelector('#prep-error');
const status = document.querySelector('#prep-status');
const save = document.querySelector('#prep-save');
const image = document.querySelector('#prep-image');
const grid = document.querySelector('#prep-grid');
const space = document.querySelector('#prep-space');
const viewport = document.querySelector('#prep-viewport');
const MIN = 20;
const MAX = 300;
input.min = MIN;
input.max = MAX;
let generation = 0;
let selected = null;
let previewSize = null;
let saving = false;
const valid = value => Number.isFinite(value) && value >= MIN && value <= MAX;

function draw() {
  if (!selected || !image.complete || !image.naturalWidth || !valid(previewSize)) return;
  image.hidden = false;
  grid.style.display = '';
  space.style.width = `${image.naturalWidth}px`;
  space.style.height = `${image.naturalHeight}px`;
  renderGrid(document, grid, image.naturalWidth, image.naturalHeight, previewSize);
  fit();
}
function fit() {
  if (!selected || !image.naturalWidth || !viewport.clientWidth || !viewport.clientHeight) return;
  const scale = Math.min(1, viewport.clientWidth / image.naturalWidth, viewport.clientHeight / image.naturalHeight);
  space.style.transform = `scale(${scale})`;
  space.style.left = `${(viewport.clientWidth - image.naturalWidth * scale) / 2}px`;
  space.style.top = `${(viewport.clientHeight - image.naturalHeight * scale) / 2}px`;
}
new ResizeObserver(fit).observe(viewport);
image.addEventListener('load', draw);
image.addEventListener('error', () => {
  if (!selected) return;
  image.hidden = true;
  grid.style.display = 'none';
  status.textContent = 'Obrázek mapy se nepodařilo načíst. Otevřete přípravu znovu.';
});

export async function openMapPreparation(mapId) {
  if (getCurrentUser()?.role !== 'leader') return;
  const request = ++generation;
  selected = null;
  saving = false;
  input.disabled = save.disabled = true;
  input.value = '';
  error.textContent = '';
  input.setAttribute('aria-invalid', 'false');
  image.hidden = true;
  grid.style.display = 'none';
  image.removeAttribute('src');
  document.querySelector('#prep-name').textContent = 'Příprava mapy';
  status.textContent = 'Načítám mapu…';
  list.hidden = true;
  panel.hidden = false;
  document.querySelector('main').classList.add('players-open');
  try {
    const rows = await loadMaps();
    if (request !== generation) return;
    const row = rows.find(item => item.map_id === mapId);
    if (!row || !valid(row.cell_size)) throw new Error('Missing or invalid map config');
    selected = row;
    previewSize = row.cell_size;
    input.value = previewSize;
    input.disabled = save.disabled = false;
    document.querySelector('#prep-name').textContent = row.name;
    image.alt = row.name;
    image.src = await resolveMapImage(row.image_path, row.map_id);
    status.textContent = '';
    draw();
  } catch (cause) {
    console.error('Načtení přípravy mapy selhalo:', cause);
    if (request === generation) status.textContent = 'Mapu se nepodařilo načíst. Zkuste to znovu; pokud přihlášení vypršelo, přihlaste se znovu.';
  }
}

input.addEventListener('input', () => {
  if (!selected || saving) return;
  const value = input.valueAsNumber;
  error.textContent = input.validity.badInput ? 'Zadej velikost pole jako číslo.'
    : input.value === '' ? 'Zadej velikost pole.'
    : !valid(value) ? `Zadej velikost pole od ${MIN} do ${MAX} px.` : '';
  input.setAttribute('aria-invalid', String(Boolean(error.textContent)));
  save.disabled = Boolean(error.textContent);
  status.textContent = '';
  if (error.textContent) return;
  previewSize = value;
  draw();
});

save.addEventListener('click', async () => {
  if (!selected || saving || error.textContent || !valid(input.valueAsNumber)) return;
  const request = generation;
  const mapId = selected.map_id;
  saving = true;
  input.disabled = save.disabled = true;
  status.textContent = 'Ukládám…';
  try {
    const value = await setMapCellSize(mapId, input.valueAsNumber);
    if (request !== generation) return;
    selected.cell_size = previewSize = value;
    input.value = value;
    draw();
    status.textContent = 'Velikost pole uložena.';
  } catch (cause) {
    console.error('Uložení velikosti pole selhalo:', cause);
    if (request === generation) status.textContent = 'Velikost pole se nepodařilo uložit. Zkuste to znovu; pokud přihlášení vypršelo, přihlaste se znovu.';
  } finally {
    if (request === generation) {
      saving = false;
      input.disabled = save.disabled = false;
    }
  }
});

document.querySelector('#prep-back').addEventListener('click', () => {
  generation++;
  selected = null;
  image.removeAttribute('src');
  panel.hidden = true;
  document.querySelector('main').classList.remove('players-open');
  document.querySelector('#leader-maps-link').click();
});
