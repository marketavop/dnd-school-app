import { getCurrentUser } from './login.js';

import { loadMaps, setActiveMap } from './leader-map-api.js';
import { openMapPreparation } from './map-preparation.js';

const home = document.querySelector('#leader-content');
const panel = document.querySelector('#leader-maps');
const list = document.querySelector('#maps-list');
const status = document.querySelector('#maps-status');
let generation = 0;

document.querySelector('#leader-maps-link').addEventListener('click', async event => {
  event.preventDefault();
  if (getCurrentUser()?.role !== 'leader') return;
  const request = ++generation;
  home.hidden = true;
  panel.hidden = false;
  list.replaceChildren();
  status.textContent = 'Načítám mapy…';
  try {
    const rows = await loadMaps();
    if (request !== generation) return;
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row.map_id !== 'string'
      || typeof row.name !== 'string' || typeof row.is_active !== 'boolean')) throw new Error('Invalid map list');
    for (const row of rows) {
      const item = document.createElement('li');
      item.textContent = `${row.is_active ? '●' : '○'} ${row.name}${row.is_active ? ' — Aktivní' : ''}`;
      if (!row.is_active) {
        const button = document.createElement('button');
        button.textContent = 'Aktivovat';
        button.type = 'button';
        button.addEventListener('click', async () => {
          if (panel.dataset.saving === 'true') return;
          panel.dataset.saving = 'true';
          button.disabled = true;
          try {
            await setActiveMap(row.map_id);
            if (request === generation) document.querySelector('#leader-maps-link').click();
          } catch (error) {
            console.error('Aktivace mapy selhala:', error);
            if (request === generation) status.textContent = 'Mapu se nepodařilo aktivovat. Zkuste to znovu; pokud přihlášení vypršelo, přihlaste se znovu.';
          } finally {
            panel.dataset.saving = 'false';
            button.disabled = false;
          }
        });
        item.append(button);
      }
      const prepare = document.createElement('button');
      prepare.type = 'button';
      prepare.textContent = 'Připravit';
      prepare.addEventListener('click', () => openMapPreparation(row.map_id));
      item.append(prepare);
      list.append(item);
    }
    status.textContent = rows.length ? '' : 'Zatím nejsou připravené žádné mapy.';
  } catch (error) {
    if (request !== generation) return;
    console.error('Načtení seznamu map selhalo:', error);
    list.replaceChildren();
    status.textContent = 'Mapy se nepodařilo načíst. Zkuste to znovu; pokud přihlášení vypršelo, obnovte stránku a přihlaste se.';
  }
});

document.querySelector('#maps-back').addEventListener('click', () => {
  generation++;
  list.replaceChildren();
  status.textContent = '';
  panel.hidden = true;
  home.hidden = false;
});

