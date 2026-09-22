import { loadCharacter } from './characters.js';
import { connectRolls } from './rolls.js';

const status = document.querySelector('#dice-status');
const buttons = [...document.querySelectorAll('[data-die]')];
const ids = new URLSearchParams(window.location.search).getAll('character_id');
const valid = ids.length === 1 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ids[0]);
function showFailure(message) {
  status.textContent = message;
  status.dataset.error = 'true';
}
if (valid) {
  try {
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import('./config.local.js');
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const character = await loadCharacter(db, ids[0].toLowerCase());
    const session = connectRolls(db, character, rolls => {
      const latest = rolls[0];
      document.querySelector('#last-roll').textContent = latest ? `${latest.name}: k${latest.sides} → ${latest.result}` : 'Zatím žádný hod';
      const entries = rolls.slice(0, 10).map(roll => {
        const item = document.createElement('li');
        item.textContent = `${roll.name} · k${roll.sides} → ${roll.result}`;
        return item;
      });
      document.querySelector('#roll-log').replaceChildren(...entries);
    }, connected => {
      for (const button of buttons) button.disabled = !connected;
      status.dataset.error = String(!connected);
      status.textContent = connected ? '' : 'Kostky jsou odpojené. Čekám na obnovení spojení…';
    }, showFailure);
    for (const button of buttons) button.addEventListener('click', () => session.roll(Number(button.dataset.die)));
    window.addEventListener('pagehide', event => { if (!event.persisted) void session.close(); });
  } catch (error) {
    console.error('Spuštění kostek selhalo:', error);
    showFailure('Kostky se nepodařilo načíst. Zkuste obnovit stránku.');
  }
}
