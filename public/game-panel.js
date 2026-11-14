import { loadCharacter, updateCharacterField } from './characters.js';
import { SKILLS, abilityValues, skillValues, validHpDelta, adjustedHp } from './character-rules.js';
import { gameUser } from './navigation.js';
import { renderBasicMarkdown } from './markdown.js';

const $ = id => document.getElementById(id);
const toggle = $('game-character-name');
const panel = $('character-panel');
const diceToggle = $('dice-toggle');
const dicePanel = $('dice-panel');
const sceneToggle = $('scene-toggle');
const scenePanel = $('scene-panel');
const leader = gameUser?.role === 'leader' && Boolean(gameUser?.session_token);
const ids = gameUser?.role === 'player' ? [gameUser.character_id] : [];
const valid = ids.length === 1 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ids[0]);
const diceAvailable = ['player', 'leader'].includes(gameUser?.role) && Boolean(gameUser?.session_token);
const tabs = [$('overview-tab'), $('inventory-tab')];
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
toggle.hidden = leader;
sceneToggle.hidden = !leader;
sceneToggle.disabled = !leader;
diceToggle.disabled = !diceAvailable;
const signed = value => value == null ? '—' : value > 0 ? `+${value}` : String(value);
function renderSkills(character) {
  const list = $('game-skills-list');
  list.replaceChildren();
  for (const skill of SKILLS) {
    const { proficient, bonus } = skillValues(character, skill);
    const row = document.createElement('div');
    row.className = 'game-skill-row';
    const proficiency = document.createElement('span');
    proficiency.className = 'game-skill-proficiency';
    proficiency.textContent = proficient ? '●' : '○';
    proficiency.setAttribute('role', 'img');
    proficiency.setAttribute('aria-label', proficient ? 'Zdatnost' : 'Bez zdatnosti');
    const name = document.createElement('span');
    name.className = 'game-skill-name';
    name.textContent = skill.czechName;
    const english = document.createElement('span');
    english.className = 'term-english';
    english.textContent = ` (${skill.englishName})`;
    name.append(english);
    const bonusElement = document.createElement('output');
    bonusElement.className = 'game-skill-bonus';
    bonusElement.textContent = signed(bonus);
    bonusElement.setAttribute('aria-label', `Bonus ${skill.czechName}`);
    row.append(proficiency, name, bonusElement);
    list.append(row);
  }
}
function featureList(character) {
  return Array.isArray(character.features)
    ? character.features
      .filter(feature => feature && typeof feature.name === 'string')
      .map(feature => ({ name: feature.name, note: typeof feature.note === 'string' ? feature.note : '' }))
    : [];
}
function renderFeatures(character) {
  const list = $('game-features-list');
  list.replaceChildren();
  const features = featureList(character);
  if (!features.length) {
    list.textContent = 'Zatím nemáš zapsané žádné schopnosti.';
    return;
  }
  for (const feature of features) {
    const item = document.createElement('article');
    item.className = 'game-feature';
    const name = document.createElement('h3');
    name.textContent = feature.name;
    item.append(name);
    if (feature.note) {
      const note = document.createElement('p');
      note.textContent = feature.note;
      item.append(note);
    }
    list.append(item);
  }
}
let openPanel = null;
function togglePanel(requested) {
  if (requested === 'scene' && !leader) return;
  openPanel = openPanel === requested ? null : requested;
  panel.hidden = openPanel !== 'character';
  dicePanel.hidden = openPanel !== 'dice';
  scenePanel.hidden = openPanel !== 'scene';
  sceneToggle.title = scenePanel.hidden ? 'Otevřít Scénu' : 'Zavřít Scénu';
  sceneToggle.setAttribute('aria-expanded', String(!scenePanel.hidden));
  toggle.title = panel.hidden ? 'Otevřít Studijní panel' : 'Zavřít Studijní panel';
  diceToggle.title = dicePanel.hidden ? 'Otevřít Kostky' : 'Zavřít Kostky';
  toggle.setAttribute('aria-expanded', String(!panel.hidden));
  diceToggle.setAttribute('aria-expanded', String(!dicePanel.hidden));
}
toggle.addEventListener('click', () => togglePanel('character'));
diceToggle.addEventListener('click', () => togglePanel('dice'));
sceneToggle.addEventListener('click', () => togglePanel('scene'));

if (valid) {
  const status = $('diary-status');
  try {
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import('./config.local.js');
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
    const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const abilitiesBlock = $('compact-str')?.closest('table');
    if (abilitiesBlock) abilitiesBlock.hidden = true;
    try {
      const visibility = await db.rpc('character_section_visibility', { p_session_token: gameUser.session_token });
      const setting = Array.isArray(visibility.data)
        ? visibility.data.find(row => row.section_id === 'abilities') : null;
      const skillsSetting = Array.isArray(visibility.data)
        ? visibility.data.find(row => row.section_id === 'skills') : null;
      const featuresSetting = Array.isArray(visibility.data)
        ? visibility.data.find(row => row.section_id === 'features') : null;
      if (!visibility.error && setting?.is_visible === true && abilitiesBlock) abilitiesBlock.hidden = false;
      if (!visibility.error && skillsSetting?.is_visible === true) $('game-skills').hidden = false;
      if (!visibility.error && featuresSetting?.is_visible === true) $('game-features').hidden = false;
    } catch { /* Keep abilities hidden if visibility cannot be loaded. */ }
    const character = await loadCharacter(db, ids[0].toLowerCase(), gameUser.session_token);
    if (!$('game-skills').hidden) renderSkills(character);
    if (!$('game-features').hidden) renderFeatures(character);
    $('game-character-name').textContent = character.name ?? 'Postava';
    $('compact-ac').textContent = character.ac ?? '—';
    $('compact-level').textContent = character.level ?? '—';
    if (character.inventory?.trim()) renderBasicMarkdown($('game-inventory'), character.inventory);
    else $('game-inventory').textContent = 'Inventář je zatím prázdný.';
    $('inventory-edit-link').href = `./character.html?character_id=${encodeURIComponent(character.id)}&tab=inventory`;
    $('inventory-edit-link').hidden = false;
    for (const key of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
      const { modifier, save } = abilityValues(character, key);
      if (key === 'dex') $('compact-initiative').textContent = signed(modifier);
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
        const updated = await updateCharacterField(db, character.id, 'current_hp', value, gameUser.session_token);
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
