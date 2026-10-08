import { abilityValues, validHpDelta, adjustedHp } from './character-rules.js';
import { loadCharacter, updateCharacterField, lowerCharacterHp } from './characters.js';
import { getCurrentUser } from './login.js';
import { portraitImageUrl, uploadPortrait, removePortrait } from './portrait-api.js';

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
const readOnly = new URLSearchParams(window.location.search).has('mode')
  || Boolean(window.parent && window.parent !== window);
const playerSessionToken = readOnly ? null : getCurrentUser()?.session_token;
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

async function setupPortrait(character, reload) {
  const portrait = document.querySelector('#portrait');
  const placeholder = document.querySelector('#portrait-placeholder');
  const message = document.querySelector('#portrait-status');
  const report = (text, error = false) => {
    message.textContent = text;
    message.setAttribute('class', error ? 'portrait-error' : '');
  };
  const controls = document.querySelector('#portrait-controls');
  const upload = document.querySelector('#portrait-upload');
  const remove = document.querySelector('#portrait-remove');
  const file = document.querySelector('#portrait-file');
  let hasImage = character.portrait_path != null;
  let busy = false, uncertain = false;
  const reset = () => {
    portrait.hidden = true;
    portrait.removeAttribute('src');
    placeholder.removeAttribute('hidden');
  };
  const buttons = () => {
    upload.textContent = hasImage ? 'Změnit obrázek' : 'Nahrát obrázek';
    remove.hidden = !hasImage;
    upload.disabled = remove.disabled = file.disabled = busy || uncertain;
  };
  portrait.addEventListener('load', () => {
    if (!portrait.getAttribute('src')) return;
    portrait.hidden = false;
    // SVG does not reflect the HTML hidden property; use the attribute for CSS.
    placeholder.setAttribute('hidden', '');
  });
  portrait.addEventListener('error', () => {
    reset(); report('Obrázek se nepodařilo zobrazit.', true);
  });
  const refresh = async () => {
    reset();
    if (!hasImage) return;
    const url = await portraitImageUrl(character.id);
    hasImage = url !== null;
    if (url) portrait.src = url;
  };
  try { await refresh(); }
  catch { report('Portrét se nepodařilo načíst. Zkuste obnovit stránku.', true); }
  buttons();
  if (readOnly || getCurrentUser()?.role !== 'player') return;
  controls.hidden = false;
  const change = async (action, selectedFile) => {
    if (busy || uncertain) return;
    busy = true; buttons();
    report('Ukládám portrét…');
    try {
      const result = action === 'upload'
        ? await uploadPortrait(character.id, selectedFile) : await removePortrait(character.id);
      hasImage = result.object_path !== null;
      report(result.cleanup_pending
        ? 'Portrét uložen; úklid starého souboru čeká na dokončení.' : 'Portrét uložen.');
      try { await refresh(); }
      catch { report('Změna byla uložena, ale portrét se nepodařilo načíst. Obnovte stránku.', true); }
    } catch (error) {
      report(error.code === 'FILE_TOO_LARGE' ? error.message : 'Změna portrétu se nezdařila.', true);
      if (error.status === 409 || error.outcome_unknown) {
        uncertain = true;
        try {
          const current = await reload();
          hasImage = current.portrait_path != null;
          await refresh();
          uncertain = false;
          report('Výsledek požadavku nebyl potvrzen. Zobrazen je aktuální stav; můžete zkusit akci znovu.', true);
        } catch {
          reset();
          report('Aktuální stav nelze ověřit. Před další změnou obnovte stránku.', true);
        }
      }
    } finally { busy = false; file.value = ''; buttons(); }
  };
  upload.addEventListener('click', () => { if (!busy && !uncertain) file.click(); });
  file.addEventListener('change', () => {
    const selected = file.files?.[0];
    if (selected) return change('upload', selected);
  });
  remove.addEventListener('click', () => change('remove'));
}

function setupInventory(db, character) {
  const section = document.querySelector('#inventory');
  const display = document.querySelector('#character-inventory');
  const input = document.querySelector('#edit-inventory');
  const toggle = document.querySelector('#inventory-toggle');
  const message = document.querySelector('#inventory-status');
  const error = document.querySelector('#error-inventory');
  const hint = document.querySelector('#inventory-hint');
  const counter = document.querySelector('#inventory-count');
  function updateCounter() {
    const count = [...input.value].length;
    counter.textContent = count.toLocaleString('cs-CZ') + ' / 5 000';
    counter.dataset.error = String(count > 5000);
  }
  let editing = false, busy = false, failed = false;
  let savedTimer = null;
  function clearSavedTimer() {
    clearTimeout(savedTimer);
    savedTimer = null;
  }
  function render() {
    display.textContent = character.inventory || 'Inventář zatím není vyplněný.';
    display.dataset.empty = String(!character.inventory);
    display.hidden = editing || failed;
    input.hidden = !(editing || failed);
    hint.hidden = counter.hidden = input.hidden;
    updateCounter();
    input.disabled = busy || readOnly;
    toggle.disabled = readOnly;
    toggle.textContent = editing ? 'Ukončit editaci' : 'Upravit inventář';
    toggle.setAttribute('aria-pressed', String(editing));
  }
  input.value = character.inventory ?? '';
  render();
  section.hidden = false;
  if (readOnly) {
    toggle.hidden = true;
    input.readOnly = true;
    message.textContent = 'Pouze pro čtení';
    return;
  }
  function validate() {
    // Match the server's character count, rather than UTF-16 code units.
    return [...input.value].length <= 5000;
  }
  input.addEventListener('input', () => {
    updateCounter();
    if (validate()) {
      error.textContent = '';
      input.setAttribute('aria-invalid', 'false');
    } else {
      error.textContent = 'Inventář může mít nejvýše 5 000 znaků.';
      input.setAttribute('aria-invalid', 'true');
    }
  });
  async function save() {
    if (busy || (!editing && !failed)) return;
    if (!validate()) {
      clearSavedTimer();
      failed = true;
      error.textContent = 'Inventář může mít nejvýše 5 000 znaků.';
      input.setAttribute('aria-invalid', 'true');
      message.textContent = 'Nepodařilo se uložit';
      message.dataset.error = 'true';
      render();
      return;
    }
    const value = input.value === '' ? null : input.value;
    if (value === character.inventory && !failed) return;
    clearSavedTimer();
    busy = true;
    error.textContent = '';
    input.setAttribute('aria-invalid', 'false');
    message.textContent = 'Ukládám…';
    message.dataset.error = 'false';
    render();
    try {
      const updated = await updateCharacterField(db, character.id, 'inventory', value, playerSessionToken);
      character.inventory = updated.inventory;
      input.value = character.inventory ?? '';
      failed = false;
      message.textContent = 'Uloženo';
      savedTimer = setTimeout(() => {
        message.textContent = '';
        savedTimer = null;
      }, 2000);
    } catch {
      failed = true;
      error.textContent = 'Nepodařilo se uložit. Pro opakování klikni do pole a znovu jej opusť.';
      message.textContent = 'Nepodařilo se uložit';
      message.dataset.error = 'true';
    } finally {
      busy = false;
      render();
    }
  }
  input.addEventListener('blur', save);
  toggle.addEventListener('click', async () => {
    const saving = editing ? save() : null;
    editing = !editing;
    render();
    if (editing) input.focus();
    await saving;
  });
}

function setupNotes(db, character) {
  const section = document.querySelector('#notes');
  const display = document.querySelector('#character-notes');
  const input = document.querySelector('#edit-notes');
  const toggle = document.querySelector('#notes-toggle');
  const message = document.querySelector('#notes-status');
  const error = document.querySelector('#error-notes');
  const hint = document.querySelector('#notes-hint');
  const counter = document.querySelector('#notes-count');
  function updateCounter() {
    const count = [...input.value].length;
    counter.textContent = count.toLocaleString('cs-CZ') + ' / 20 000';
    counter.dataset.error = String(count > 20000);
  }
  let editing = false, busy = false, failed = false;
  let savedTimer = null;
  function clearSavedTimer() {
    clearTimeout(savedTimer);
    savedTimer = null;
  }
  function render() {
    display.textContent = character.notes || 'Studentský sešit zatím není vyplněný.';
    display.dataset.empty = String(!character.notes);
    display.hidden = editing || failed;
    input.hidden = !(editing || failed);
    hint.hidden = counter.hidden = input.hidden;
    updateCounter();
    input.disabled = busy || readOnly;
    toggle.disabled = readOnly;
    toggle.textContent = editing ? 'Ukončit editaci' : '✎ Upravit sešit';
    toggle.setAttribute('aria-pressed', String(editing));
  }
  input.value = character.notes ?? '';
  render();
  section.hidden = false;
  if (readOnly) {
    toggle.hidden = true;
    input.readOnly = true;
    message.textContent = 'Pouze pro čtení';
    return;
  }
  function validate() {
    // Match the server's character count, rather than UTF-16 code units.
    return [...input.value].length <= 20000;
  }
  input.addEventListener('input', () => {
    updateCounter();
    if (validate()) {
      error.textContent = '';
      input.setAttribute('aria-invalid', 'false');
    } else {
      error.textContent = 'Studentský sešit může mít nejvýše 20 000 znaků.';
      input.setAttribute('aria-invalid', 'true');
    }
  });
  async function save() {
    if (busy || (!editing && !failed)) return;
    if (!validate()) {
      clearSavedTimer();
      failed = true;
      error.textContent = 'Studentský sešit může mít nejvýše 20 000 znaků.';
      input.setAttribute('aria-invalid', 'true');
      message.textContent = 'Nepodařilo se uložit';
      message.dataset.error = 'true';
      render();
      return;
    }
    const value = input.value === '' ? null : input.value;
    if (value === character.notes && !failed) return;
    clearSavedTimer();
    busy = true;
    error.textContent = '';
    input.setAttribute('aria-invalid', 'false');
    message.textContent = 'Ukládám…';
    message.dataset.error = 'false';
    render();
    try {
      const updated = await updateCharacterField(db, character.id, 'notes', value, playerSessionToken);
      character.notes = updated.notes;
      input.value = character.notes ?? '';
      failed = false;
      message.textContent = 'Uloženo';
      savedTimer = setTimeout(() => {
        message.textContent = '';
        savedTimer = null;
      }, 2000);
    } catch {
      failed = true;
      error.textContent = 'Nepodařilo se uložit. Pro opakování klikni do pole a znovu jej opusť.';
      message.textContent = 'Nepodařilo se uložit';
      message.dataset.error = 'true';
    } finally {
      busy = false;
      render();
    }
  }
  input.addEventListener('blur', save);
  toggle.addEventListener('click', async () => {
    const saving = editing ? save() : null;
    editing = !editing;
    render();
    if (editing) input.focus();
    await saving;
  });
}

function enableEditing(db, character) {
  const toggle = document.querySelector('#edit-toggle');
  const saveStatus = document.querySelector('#save-status');
  const fields = [
    { key: 'name', slot: 'name' },
    { key: 'race_code', slot: 'race', choices: RACES },
    { key: 'class_code', slot: 'class', choices: CLASSES },
    { key: 'background', slot: 'background', text: true },
    { key: 'level', slot: 'level' },
    { key: 'xp', slot: 'xp', resource: true },
    { key: 'ac', slot: 'ac', resource: true },
    { key: 'ac_note', slot: 'ac_note', text: true },
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
  if (!readOnly) delta.addEventListener('input', () => {
    if (validHpAmount()) {
      hpError.textContent = failures.has('hp-delta') ? 'Nepodařilo se uložit. Zkuste změnu znovu.' : '';
      delta.setAttribute('aria-invalid', 'false');
    }
  });
  function validHpAmount() {
    return validHpDelta(delta.value, delta.validity.badInput);
  }
  // character obsahuje potvrzená data; hodnoty inputů jsou lokální drafty.
  function confirmCurrentHp(value) {
    const input = document.querySelector('#edit-current_hp');
    const hasDraft = failures.has('current_hp') || String(input.value) !== String(character.current_hp ?? '');
    character.current_hp = value;
    if (!hasDraft) input.value = value ?? '';
  }
  async function changeHp(direction) {
    if (readOnly || delta.disabled || hpBusy) return;
    if (!validHpAmount()) {
      hpError.textContent = 'Zadej kladný celý počet HP.';
      delta.setAttribute('aria-invalid', 'true');
      return;
    }
    const value = adjustedHp(character, direction, delta.value);
    hpError.textContent = '';
    delta.setAttribute('aria-invalid', 'false');
    if (value === character.current_hp) return;
    hpBusy = true; pending++; failures.delete('hp-delta'); refreshResources(); updateStatus();
    try {
      const updated = await updateCharacterField(db, character.id, 'current_hp', value, playerSessionToken);
      confirmCurrentHp(updated.current_hp);
    } catch {
      failures.add('hp-delta');
      hpError.textContent = 'Nepodařilo se uložit. Zkuste změnu znovu.';
    } finally {
      hpBusy = false; pending--; refreshResources(); updateStatus();
    }
  }
  if (!readOnly) {
    hpMinus.addEventListener('click', () => changeHp(-1));
    hpPlus.addEventListener('click', () => changeHp(1));
  }
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
    if (field.ability) {
      input.readOnly = true;
      input.tabIndex = -1;
    }
    let displayedScore = character[field.key];
    function showModifier(value) {
      if (!field.ability) return;
      displayedScore = value;
      const { modifier, proficient, save } = abilityValues(character, field.key, value);
      document.querySelector(`#modifier-${field.key}`).textContent = modifier == null ? '' : modifier > 0 ? `+${modifier}` : String(modifier);
      document.querySelector(`#save-${field.key}`).textContent = save == null ? '' : save > 0 ? `+${save}` : String(save);
      document.querySelector(`#save-proficiency-${field.key}`).hidden = !proficient;
    }
    if (field.ability) field.refreshSave = () => showModifier(displayedScore);
    showModifier(character[field.key]);
    if (readOnly) {
      input.disabled = true;
      input.readOnly = true;
      input.tabIndex = -1;
      continue;
    }
    function validate() {
      let value = input.value;
      let message = '';
      if (field.key === 'name') {
        if (!value.trim()) message = 'Jméno nemůže být prázdné.';
      } else if (field.text) {
        // Count Unicode code points like PostgreSQL char_length, including emoji.
        if (field.key === 'background' && [...value].length > 100) message = 'Zázemí může mít nejvýše 100 znaků.';
        value = value === '' ? null : value;
      } else if (field.resource) {
        value = value === '' ? null : Number(value);
        const minimum = 0;
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
      } else if (field.text) {
        value = value === '' ? null : value;
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
      if ((!editing && !field.ability && !failures.has(field.key)) || input.disabled) return;
      const { value, message } = validate();
      field.validationError = Boolean(message);
      error.textContent = message || (failures.has(field.key) ? 'Nepodařilo se uložit. Zkuste změnu znovu.' : '');
      input.setAttribute('aria-invalid', String(Boolean(message)));
      if (message) {
        if (field.key === 'background') {
          // Keep the draft editable even after closing the pencil editor.
          failures.add(field.key);
          updateStatus();
          return;
        }
        input.value = character[field.key] ?? '';
        showModifier(character[field.key]);
        return;
      }
      if (value === character[field.key] && !failures.has(field.key)) return;
      input.disabled = true;
      if (field.hp) { hpBusy = true; refreshResources(); }
      pending++;
      failures.delete(field.key);
      error.textContent = '';
      updateStatus();
      try {
        const lowerHp = field.key === 'max_hp' && value !== null && character.current_hp > value;
        const updated = lowerHp ? await lowerCharacterHp(db, character.id, value, playerSessionToken) : await updateCharacterField(db, character.id, field.key, value, playerSessionToken);
        if (field.key === 'max_hp') {
          confirmCurrentHp(updated.current_hp);
        }
        // Jiný souběžný zápis mohl vrátit starší hodnoty ostatních polí.
        character[field.key] = updated[field.key];
        input.value = character[field.key] ?? '';
        showModifier(character[field.key]);
        if (field.key === 'level' || field.key === 'class_code') {
          for (const ability of fields) ability.refreshSave?.();
        }
        const display = field.choices ? label(updated[field.key], field.choices, 'Neznámá hodnota') : updated[field.key];
        if (!field.ability) showValue(`#character-${field.slot}`, display);
      } catch {
        // Technický detail loguje datová vrstva.
        failures.add(field.key);
        error.textContent = 'Nepodařilo se uložit. Pro opakování klikni do pole a znovu jej opusť.';
      } finally {
        input.disabled = false;
        if (field.hp) hpBusy = false;
        refreshResources();
        pending--;
        updateStatus();
        renderEditing();
      }
    });
  }
  if (readOnly) {
    toggle.hidden = true;
    toggle.disabled = true;
    for (const control of [delta, hpMinus, hpPlus]) {
      control.disabled = true;
      control.hidden = true;
    }
    document.querySelector('#hp-hint').textContent = '';
    saveStatus.textContent = 'Pouze pro čtení';
    return;
  }
  function renderEditing() {
    for (const field of fields) {
      if (!editing && field.key !== 'background') field.clearValidation();
      const editable = editing || failures.has(field.key);
      if (field.ability) {
        field.input.readOnly = !editable;
        field.input.tabIndex = editable ? 0 : -1;
        continue;
      }
      field.input.hidden = !editable;
      document.querySelector(`#character-${field.slot}`).hidden = editable;
    }
    document.querySelector('#edit-icon').hidden = editing;
    document.querySelector('#close-icon').hidden = !editing;
    toggle.setAttribute('aria-pressed', String(editing));
    toggle.setAttribute('aria-label', editing ? 'Ukončit editaci' : 'Upravit průkaz');
    toggle.title = editing ? 'Ukončit editaci' : 'Upravit průkaz';
  }
  toggle.addEventListener('click', () => {
    // I klávesové/programové zavření vyvolá běžný blur před skrytím pole.
    if (editing && fields.some(field => field.input === document.activeElement)) document.activeElement.blur();
    editing = !editing;
    renderEditing();
  });
}

if (!ids.length) {
  showError('Chybí odkaz na postavu. Otevřete deník pomocí odkazu s parametrem character_id.');
} else if (ids.length !== 1 || !uuid.test(ids[0])) {
  showError('Odkaz na postavu není platný. Parametr character_id musí obsahovat jedno platné UUID.');
} else {
  try {
    let db, character;
    if (readOnly) {
      const modes = new URLSearchParams(window.location.search).getAll('mode');
      if (modes.length !== 1 || modes[0] !== 'leader' || window.parent === window
          || window.parent.location.origin !== window.location.origin
          || typeof window.parent.loadLeaderCharacter !== 'function') {
        throw new Error('Leader session required');
      }
      document.querySelector('#home-link').hidden = true;
      character = await window.parent.loadLeaderCharacter(ids[0]);
    } else {
      const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import('./config.local.js');
      if (!SUPABASE_URL?.startsWith('https://') || SUPABASE_URL.includes('YOUR_PROJECT') ||
          !SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_') || SUPABASE_PUBLISHABLE_KEY.includes('REPLACE_ME')) {
        throw new Error('Neplatná konfigurace Supabase.');
      }
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
      db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      character = await loadCharacter(db, ids[0], playerSessionToken);
    }
    showValue('#character-name', character.name);
    showValue('#character-race', label(character.race_code, RACES, 'Neznámá rasa'));
    showValue('#character-class', label(character.class_code, CLASSES, 'Neznámé povolání'));
    showValue('#character-background', character.background);
    showValue('#character-level', character.level);
    showValue('#character-ac', character.ac);
    showValue('#character-ac_note', character.ac_note);
    enableEditing(db, character);
    setupInventory(db, character);
    setupNotes(db, character);
    card.hidden = false;
    document.querySelector('#abilities').hidden = false;
    status.textContent = '';
    await setupPortrait(character, () => loadCharacter(db, character.id, playerSessionToken));
  } catch (error) {
    console.error('Načtení deníku selhalo:', error);
    showError('Postavu se nepodařilo načíst. Ověřte odkaz a přístup k postavě a zkuste stránku obnovit.');
  }
}
