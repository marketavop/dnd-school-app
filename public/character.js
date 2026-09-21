import { loadCharacter, updateCharacterField, lowerCharacterHp } from './characters.js';

const RACES = new Map([
  ['human', 'Člověk'], ['elf', 'Elf'], ['halfling', 'Půlčík'], ['dwarf', 'Trpaslík'],
  ['gnome', 'Gnóm'], ['half_elf', 'Půlelf'], ['half_orc', 'Půlork'], ['tiefling', 'Tiefling'],
]);
const CLASSES = new Map([
  ['barbarian', 'Barbar'], ['bard', 'Bard'], ['cleric', 'Klerik'], ['druid', 'Druid'],
  ['fighter', 'Bojovník'], ['monk', 'Mnich'], ['paladin', 'Paladin'], ['ranger', 'Hraničář'],
  ['rogue', 'Tulák'], ['sorcerer', 'Čaroděj'], ['warlock', 'Černokněžník'], ['wizard', 'Kouzelník'],
]);
const status = document.querySelector('#load-status');
const card = document.querySelector('#student-card');
const ids = new URLSearchParams(window.location.search).getAll('character_id');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function showError(message) {
  status.textContent = message;
  status.dataset.error = 'true';
}

function showValue(selector, value) {
  const element = document.querySelector(selector);
  element.textContent = value ?? '—';
  element.dataset.empty = String(value == null);
}

function label(code, labels, fallback) {
  return code == null ? null : labels.get(code) ?? fallback;
}

function showPortrait(path) {
  if (!path) return;
  // Storage bucket není definovaný; přijímáme pouze webovou cestu/HTTPS URL.
  const url = new URL(path, window.location.href);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.origin === window.location.origin)) return;
  const portrait = document.querySelector('#portrait');
  const placeholder = document.querySelector('#portrait-placeholder');
  portrait.addEventListener('load', () => { portrait.hidden = false; placeholder.hidden = true; });
  portrait.addEventListener('error', () => { portrait.hidden = true; placeholder.hidden = false; });
  portrait.src = url.href;
}

function enableEditing(db, character) {
  const toggle = document.querySelector('#edit-toggle');
  const saveStatus = document.querySelector('#save-status');
  const fields = [
    { key: 'name', slot: 'name' },
    { key: 'race_code', slot: 'race', choices: RACES },
    { key: 'class_code', slot: 'class', choices: CLASSES },
    { key: 'level', slot: 'level' },
    { key: 'xp', slot: 'xp', resource: true },
    { key: 'current_hp', slot: 'current_hp', resource: true, hp: true },
    { key: 'max_hp', slot: 'max_hp', resource: true, hp: true },
    ...['str', 'dex', 'con', 'int', 'wis', 'cha'].map(key => ({ key, slot: key, ability: true })),
  ];
  let editing = false;
  let pending = 0;
  const failures = new Set();
  let hpBusy = false;
  const delta = document.querySelector('#hp-delta');
  const hpMinus = document.querySelector('#hp-minus');
  const hpPlus = document.querySelector('#hp-plus');
  delta.value = '1';
  const hpError = document.querySelector('#hp-error');
  const thresholds = [null, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
  function refreshResources() {
    for (const key of ['xp', 'current_hp', 'max_hp']) showValue(`#character-${key}`, character[key]);
    const threshold = thresholds[character.level];
    document.querySelector('#xp-next').textContent = character.xp == null || !threshold ? '' :
      character.xp >= threshold ? 'Máš dost XP na další úroveň.' : `Do další úrovně: ${threshold - character.xp}`;
    delta.disabled = hpBusy || character.max_hp == null || character.current_hp == null;
    hpMinus.disabled = delta.disabled;
    hpPlus.disabled = delta.disabled;
    document.querySelector('#hp-hint').textContent = character.max_hp == null ? 'Nejdřív nastav maximální HP.' :
      character.current_hp == null ? 'Nejdřív nastav aktuální HP přes tužku.' : '';
    for (const key of ['current_hp', 'max_hp']) document.querySelector(`#edit-${key}`).disabled = hpBusy;
  }
  refreshResources();
  delta.addEventListener('input', () => {
    if (validHpAmount()) {
      hpError.textContent = failures.has('hp-delta') ? 'Nepodařilo se uložit. Zkuste změnu znovu.' : '';
      delta.setAttribute('aria-invalid', 'false');
    }
  });
  function validHpAmount() {
    return !delta.validity.badInput && /^\d+$/.test(delta.value) && Number.isSafeInteger(Number(delta.value)) && Number(delta.value) > 0;
  }
  async function changeHp(direction) {
    if (delta.disabled || hpBusy) return;
    if (!validHpAmount()) {
      hpError.textContent = 'Zadej kladný celý počet HP.';
      delta.setAttribute('aria-invalid', 'true');
      return;
    }
    const value = Math.max(0, Math.min(character.max_hp, character.current_hp + direction * Number(delta.value)));
    hpError.textContent = '';
    delta.setAttribute('aria-invalid', 'false');
    if (value === character.current_hp) return;
    hpBusy = true; pending++; failures.delete('hp-delta'); refreshResources(); updateStatus();
    try {
      const updated = await updateCharacterField(db, character.id, 'current_hp', value);
      character.current_hp = updated.current_hp;
      document.querySelector('#edit-current_hp').value = character.current_hp ?? '';
    } catch {
      failures.add('hp-delta');
      hpError.textContent = 'Nepodařilo se uložit. Zkuste změnu znovu.';
    } finally {
      hpBusy = false; pending--; refreshResources(); updateStatus();
    }
  }
  hpMinus.addEventListener('click', () => changeHp(-1));
  hpPlus.addEventListener('click', () => changeHp(1));
  function updateStatus() {
    saveStatus.textContent = failures.size ? 'Nepodařilo se uložit' : pending ? 'Ukládám…' : 'Uloženo';
    saveStatus.dataset.error = String(failures.size > 0);
  }
  for (const field of fields) {
    const input = field.input = document.querySelector(`#edit-${field.slot}`);
    const error = document.querySelector(`#error-${field.slot}`);
    if (field.choices) {
      for (const [value, text] of [['', '— nevybráno —'], ...field.choices]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        input.append(option);
      }
      // Neznámý uložený kód nesmí pouhým blur zmizet nebo se změnit na NULL.
      if (character[field.key] != null && !field.choices.has(character[field.key])) {
        const option = document.createElement('option');
        option.value = character[field.key];
        option.textContent = 'Neznámá uložená hodnota';
        option.disabled = true;
        input.append(option);
      }
    }
    input.value = character[field.key] ?? '';
    function showModifier(value) {
      if (!field.ability) return;
      const modifier = value == null ? null : Math.floor((value - 10) / 2);
      document.querySelector(`#modifier-${field.key}`).textContent = modifier == null ? '' : modifier > 0 ? `+${modifier}` : String(modifier);
    }
    showModifier(character[field.key]);
    function validate() {
      let value = input.value;
      let message = '';
      if (field.key === 'name') {
        if (!value.trim()) message = 'Jméno nemůže být prázdné.';
      } else if (field.resource) {
        value = value === '' ? null : Number(value);
        const minimum = field.key === 'max_hp' ? 1 : 0;
        if (input.validity.badInput || (value !== null && (!Number.isSafeInteger(value) || value < minimum))) {
          message = `Zadej celé číslo od ${minimum}, nebo pole vyprázdni.`;
        } else if (field.key === 'current_hp' && value !== null && value > (character.max_hp ?? 0)) {
          message = character.max_hp == null ? 'Nejdřív nastav maximální HP.' : 'Aktuální HP nesmí přesáhnout maximum.';
        }
      } else if (field.key === 'level' || field.ability) {
        value = value === '' ? null : Number(value);
        if (input.validity.badInput || (value !== null && (!Number.isInteger(value) || value < 1 || value > 20))) {
          message = field.ability ? 'Zadej celé číslo od 1 do 20.' : 'Level musí být celé číslo od 1 do 20, nebo prázdný.';
        }
      } else {
        value = value === '' ? null : value;
        if (value !== null && !field.choices.has(value) && value !== character[field.key]) message = 'Vyberte hodnotu ze seznamu.';
      }
      return { value, message };
    }
    field.clearValidation = () => {
      if (!field.validationError) return;
      field.validationError = false;
      error.textContent = failures.has(field.key) ? 'Nepodařilo se uložit. Zkuste změnu znovu.' : '';
      input.setAttribute('aria-invalid', 'false');
    };
    input.addEventListener('input', () => {
      const { value, message } = validate();
      if (!message) field.clearValidation();
      showModifier(message ? null : value);
    });
    input.addEventListener('blur', async () => {
      if ((!editing && !field.ability) || input.disabled) return;
      const { value, message } = validate();
      field.validationError = Boolean(message);
      error.textContent = message || (failures.has(field.key) ? 'Nepodařilo se uložit. Zkuste změnu znovu.' : '');
      input.setAttribute('aria-invalid', String(Boolean(message)));
      if (message) {
        input.value = character[field.key] ?? '';
        showModifier(character[field.key]);
        return;
      }
      if (value === character[field.key]) return;
      input.disabled = true;
      if (field.hp) { hpBusy = true; refreshResources(); }
      pending++;
      failures.delete(field.key);
      error.textContent = '';
      updateStatus();
      try {
        const lowerHp = field.key === 'max_hp' && value !== null && character.current_hp > value;
        const updated = lowerHp ? await lowerCharacterHp(db, character.id, value) : await updateCharacterField(db, character.id, field.key, value);
        if (lowerHp) {
          character.current_hp = updated.current_hp;
          document.querySelector('#edit-current_hp').value = updated.current_hp;
        }
        // Jiný souběžný zápis mohl vrátit starší hodnoty ostatních polí.
        character[field.key] = updated[field.key];
        const display = field.choices ? label(updated[field.key], field.choices, 'Neznámá hodnota') : updated[field.key];
        if (!field.ability) showValue(`#character-${field.slot}`, display);
      } catch {
        // Technický detail loguje datová vrstva.
        failures.add(field.key);
        error.textContent = 'Nepodařilo se uložit. Zkuste změnu znovu.';
      } finally {
        input.value = character[field.key] ?? '';
        showModifier(character[field.key]);
        input.disabled = false;
        if (field.hp) hpBusy = false;
        refreshResources();
        pending--;
        updateStatus();
      }
    });
  }
  toggle.addEventListener('click', () => {
    // I klávesové/programové zavření vyvolá běžný blur před skrytím pole.
    if (editing && fields.some(field => field.input === document.activeElement)) document.activeElement.blur();
    editing = !editing;
    for (const field of fields) {
      if (field.ability) continue;
      if (!editing) field.clearValidation();
      field.input.hidden = !editing;
      document.querySelector(`#character-${field.slot}`).hidden = editing;
    }
    document.querySelector('#edit-icon').hidden = editing;
    document.querySelector('#close-icon').hidden = !editing;
    toggle.setAttribute('aria-pressed', String(editing));
    toggle.setAttribute('aria-label', editing ? 'Ukončit editaci' : 'Upravit průkaz');
    toggle.title = editing ? 'Ukončit editaci' : 'Upravit průkaz';
  });
}

if (!ids.length) {
  showError('Chybí odkaz na postavu. Otevřete deník pomocí odkazu s parametrem character_id.');
} else if (ids.length !== 1 || !uuid.test(ids[0])) {
  showError('Odkaz na postavu není platný. Parametr character_id musí obsahovat jedno platné UUID.');
} else {
  try {
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import('./config.local.js');
    if (!SUPABASE_URL?.startsWith('https://') || SUPABASE_URL.includes('YOUR_PROJECT') ||
        !SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_') || SUPABASE_PUBLISHABLE_KEY.includes('REPLACE_ME')) {
      throw new Error('Neplatná konfigurace Supabase.');
    }
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const character = await loadCharacter(db, ids[0]);
    showValue('#character-name', character.name);
    showValue('#character-race', label(character.race_code, RACES, 'Neznámá rasa'));
    showValue('#character-class', label(character.class_code, CLASSES, 'Neznámé povolání'));
    showValue('#character-level', character.level);
    enableEditing(db, character);
    try { showPortrait(character.portrait_path); }
    catch (error) { console.error('Zobrazení portrétu selhalo:', error); }
    card.hidden = false;
    document.querySelector('#abilities').hidden = false;
    status.textContent = '';
  } catch (error) {
    console.error('Načtení deníku selhalo:', error);
    showError('Postavu se nepodařilo načíst. Ověřte odkaz a přístup k postavě a zkuste stránku obnovit.');
  }
}
