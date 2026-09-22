import { loadCharacter, updateCharacterField } from './characters.js';
import { abilityValues, validHpDelta, adjustedHp } from './character-rules.js';

const $ = id => document.getElementById(id);
const toggle = $('game-character-name');
const panel = $('character-panel');
const diceToggle = $('dice-toggle');
const dicePanel = $('dice-panel');
const ids = new URLSearchParams(window.location.search).getAll('character_id');
const valid = ids.length === 1 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ids[0]);
const tabs = [$('overview-tab'), $('abilities-tab')];
function selectTab(index) {
  tabs.forEach((tab, i) => {
    tab.setAttribute('aria-selected', String(i === index));
    tab.tabIndex = i === index ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = i !== index;
  });
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(i));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
      (i + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectTab(index);
    tabs[index].focus();
  });
});
toggle.disabled = !valid;
diceToggle.disabled = !valid;
let openPanel = null;
function togglePanel(requested) {
  openPanel = openPanel === requested ? null : requested;
  panel.hidden = openPanel !== 'character';
  dicePanel.hidden = openPanel !== 'dice';
  toggle.title = panel.hidden ? 'Otevřít Studijní panel' : 'Zavřít Studijní panel';
  diceToggle.title = dicePanel.hidden ? 'Otevřít Kostky' : 'Zavřít Kostky';
  toggle.setAttribute('aria-expanded', String(!panel.hidden));
  diceToggle.setAttribute('aria-expanded', String(!dicePanel.hidden));
}
toggle.addEventListener('click', () => togglePanel('character'));
diceToggle.addEventListener('click', () => togglePanel('dice'));

if (valid) {
  const status = $('diary-status');
  try {
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import('./config.local.js');
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const character = await loadCharacter(db, ids[0].toLowerCase());
    $('game-character-name').textContent = character.name ?? 'Postava';
    const signed = value => value == null ? '—' : value > 0 ? `+${value}` : String(value);
    for (const key of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
      const { modifier, save } = abilityValues(character, key);
      $(`compact-${key}`).textContent = character[key] ?? '—';
      $(`compact-modifier-${key}`).textContent = signed(modifier);
      $(`compact-save-${key}`).textContent = signed(save);
    }
    const delta = $('compact-hp-delta');
    const error = $('compact-hp-error');
    let busy = false;
    function renderHp() {
      $('compact-current-hp').textContent = character.current_hp ?? '—';
      $('compact-max-hp').textContent = character.max_hp ?? '—';
      delta.disabled = busy || character.current_hp == null || character.max_hp == null;
      $('compact-hp-minus').disabled = delta.disabled;
      $('compact-hp-plus').disabled = delta.disabled;
      $('compact-hp-hint').textContent = character.max_hp == null ? 'Nejdřív nastav maximální HP ve Studentském průkazu.' : character.current_hp == null ? 'Nejdřív nastav aktuální HP ve Studentském průkazu.' : '';
    }
    delta.addEventListener('input', () => {
      if (validHpDelta(delta.value, delta.validity.badInput)) {
        delta.setAttribute('aria-invalid', 'false');
        error.textContent = '';
      }
    });
    async function changeHp(direction) {
      if (delta.disabled || busy) return;
      if (!validHpDelta(delta.value, delta.validity.badInput)) {
        error.textContent = 'Zadej kladný celý počet HP.';
        delta.setAttribute('aria-invalid', 'true');
        return;
      }
      error.textContent = '';
      delta.setAttribute('aria-invalid', 'false');
      const value = adjustedHp(character, direction, delta.value);
      if (value === character.current_hp) return;
      busy = true;
      renderHp();
      status.textContent = 'Ukládám…';
      try {
        const updated = await updateCharacterField(db, character.id, 'current_hp', value);
        character.current_hp = updated.current_hp;
        status.textContent = 'Uloženo';
      } catch {
        status.textContent = '';
        error.textContent = 'Nepodařilo se uložit. Zkuste změnu znovu.';
      } finally {
        busy = false;
        renderHp();
      }
    }
    $('compact-hp-minus').addEventListener('click', () => changeHp(-1));
    $('compact-hp-plus').addEventListener('click', () => changeHp(1));
    renderHp();
    status.textContent = '';
  } catch (error) {
    console.error('Načtení kompaktního deníku selhalo:', error);
    status.textContent = 'Postavu se nepodařilo načíst. Ověřte odkaz a přístup k postavě a zkuste stránku obnovit.';
    status.classList.add('error');
    $('game-character-name').textContent = 'Postava nedostupná';
  }
}
