// node tests/character-page.cjs — samostatný skript stránky s náhradou DOM a SDK.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { resolve } = require('node:path');
const dataSource = readFileSync(resolve(__dirname, '../public/characters.js'), 'utf8').replaceAll('export async', 'async');
const pageSource = readFileSync(resolve(__dirname, '../public/character.js'), 'utf8')
  .replace("import { loadCharacter, updateCharacterField, lowerCharacterHp } from './characters.js';", dataSource)
  .replace("await import('./config.local.js')", 'getConfig()')
  .replace("await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm')", 'sdk');
const id = '12345678-1234-1234-1234-123456789abc';
const abilityKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const base = { id, name: 'Eliška', race_code: null, class_code: null, level: null, portrait_path: null, xp: null, current_hp: null, max_hp: null,
  ...Object.fromEntries(abilityKeys.map(key => [key, null])) };

async function page(query, row = base, error = null) {
  const elements = Object.fromEntries(['load-status', 'student-card', 'character-name', 'character-race',
    'character-class', 'character-level', 'portrait', 'portrait-placeholder', 'edit-toggle', 'save-status',
    'edit-name', 'edit-race', 'edit-class', 'edit-level', 'error-name', 'error-race', 'error-class', 'error-level',
    'edit-icon', 'close-icon', 'abilities', 'hp-minus', 'hp-plus', 'hp-delta', 'hp-error', 'hp-hint', 'xp-next', ...['xp', 'current_hp', 'max_hp'].flatMap(key => ['edit-' + key, 'error-' + key, 'character-' + key]), ...abilityKeys.flatMap(key => [`edit-${key}`, `error-${key}`, `modifier-${key}`, `save-${key}`, `save-proficiency-${key}`])].map(key => [key, {
    textContent: '', hidden: ['student-card', 'portrait', 'edit-name', 'edit-race', 'edit-class', 'edit-level', 'close-icon'].includes(key), dataset: {}, handlers: {},
    value: '', disabled: false, validity: { badInput: false }, children: [], attributes: {},
    append(option) { this.children.push(option); },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(event, handler) { this.handlers[event] = handler; },
  }]));
  let configs = 0, clients = 0, reads = 0;
  const logs = [];
  const writes = [];
  const control = { error: null, wait: null };
  const db = { from(table) {
    assert.equal(table, 'characters');
    let patch;
    return {
      update(value) { patch = value; writes.push({ ...value }); return this; },
      select(fields) { assert.equal(fields.split(',').length, 16); return this; },
      eq(key, value) { assert.equal(key, 'id'); assert.equal(value.toLowerCase(), id); return this; },
      async single() {
        if (patch) {
          if (control.wait) await control.wait;
          if (control.error) return { data: null, error: control.error };
          Object.assign(row, patch);
        } else reads++;
        return { data: row && { ...row }, error };
      },
    };
  } };
  const context = vm.createContext({
    URL, URLSearchParams,
    window: { location: { search: query, href: `https://example.test/character.html${query}`, origin: 'https://example.test' } },
    document: { createElement: () => ({}), querySelector: selector => { assert.ok(elements[selector.slice(1)], selector); return elements[selector.slice(1)]; } },
    console: { error: (...args) => logs.push(args) },
    getConfig() { configs++; return { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }; },
    sdk: { createClient(url, key, options) {
      clients++;
      assert.equal(options.auth.persistSession, false);
      return db;
    } },
  });
  await vm.runInContext(`(async () => { ${pageSource}\n })()`, context);
  return { elements, configs, clients, reads, logs, writes, control };
}

(async () => {
  for (const query of ['', '?character_id=', '?character_id=invalid', `?character_id=${id}&character_id=${id}`,
    '?character_id=%3Cscript%3E', `?character_id=${id}x`]) {
    const result = await page(query);
    assert.equal(result.configs, 0);
    assert.equal(result.clients, 0);
    assert.equal(result.reads, 0);
    assert.equal(result.elements['student-card'].hidden, true);
    assert.equal(result.elements['load-status'].dataset.error, 'true');
  }
  const empty = await page(`?character_id=${id}`);
  assert.equal(empty.reads, 1);
  assert.equal(empty.elements['student-card'].hidden, false);
  assert.equal(empty.elements['character-name'].textContent, 'Eliška');
  for (const field of ['race', 'class', 'level']) assert.equal(empty.elements[`character-${field}`].textContent, '—');
  assert.equal(empty.elements.portrait.hidden, true);
  assert.equal(empty.elements['portrait-placeholder'].hidden, false);
  const filled = await page(`?character_id=${id.toUpperCase()}`, {
    ...base, name: '<img src=x onerror=alert(1)>', race_code: 'elf', class_code: 'wizard', level: 1, portrait_path: '/portraits/a.png',
  });
  assert.equal(filled.elements['character-name'].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(filled.elements['character-race'].textContent, 'Elf');
  assert.equal(filled.elements['character-class'].textContent, 'Kouzelník');
  assert.equal(filled.elements['character-level'].textContent, 1);
  assert.equal(filled.elements.portrait.src, 'https://example.test/portraits/a.png');
  filled.elements.portrait.handlers.load();
  assert.equal(filled.elements['portrait-placeholder'].hidden, true);
  filled.elements.portrait.handlers.error();
  assert.equal(filled.elements['portrait-placeholder'].hidden, false);
  assert.equal(filled.elements.portrait.hidden, true);
  const unknown = await page(`?character_id=${id}`, { ...base, race_code: 'unknown', class_code: '__proto__', portrait_path: 'javascript:alert(1)' });
  assert.equal(unknown.elements['character-race'].textContent, 'Neznámá rasa');
  assert.equal(unknown.elements['character-class'].textContent, 'Neznámé povolání');
  assert.equal(unknown.elements.portrait.src, undefined);
  for (const error of [{ code: '42501', message: 'Denied' }, { code: 'PGRST116', message: 'No row' }]) {
    const failed = await page(`?character_id=${id}`, null, error);
    assert.equal(failed.elements['student-card'].hidden, true);
    assert.match(failed.elements['load-status'].textContent, /Postavu se nepodařilo načíst/);
    assert.ok(failed.logs.length);
  }
  const stored = { ...base, name: 'Test postava' };
  const edit = await page(`?character_id=${id}`, stored);
  const el = edit.elements;
  assert.equal(el['edit-name'].hidden, true);
  for (const key of abilityKeys) {
    assert.equal(el[`edit-${key}`].readOnly, true);
    assert.equal(el[`edit-${key}`].tabIndex, -1);
  }
  el['edit-toggle'].handlers.click();
  for (const key of abilityKeys) {
    assert.equal(el[`edit-${key}`].readOnly, false);
    assert.equal(el[`edit-${key}`].tabIndex, 0);
  }
  assert.equal(el['edit-name'].hidden, false);
  assert.equal(el['character-name'].hidden, true);
  assert.equal(el['close-icon'].hidden, false);
  assert.deepEqual(el['edit-race'].children.map(o => o.value), ['', 'human', 'elf', 'halfling', 'dwarf', 'gnome', 'half_elf', 'half_orc', 'tiefling']);
  assert.equal(el['edit-race'].children.find(o => o.value === 'halfling').textContent, 'Půlčík');
  assert.equal(el['edit-class'].children.length, 13);
  async function change(slot, value) {
    el[`edit-${slot}`].value = value;
    await el[`edit-${slot}`].handlers.blur();
  }
  for (const [slot, value, key, saved] of [
    ['name', 'Eliška', 'name', 'Eliška'], ['race', 'elf', 'race_code', 'elf'],
    ['race', '', 'race_code', null], ['class', 'wizard', 'class_code', 'wizard'],
    ['class', '', 'class_code', null], ['level', '1', 'level', 1], ['level', '20', 'level', 20],
    ['level', '', 'level', null], ['level', '1', 'level', 1],
  ]) {
    await change(slot, value);
    assert.deepEqual(edit.writes.at(-1), { [key]: saved });
    assert.equal(stored[key], saved);
    const reload = await page(`?character_id=${id}`, stored);
    assert.equal(reload.elements[`edit-${slot}`].value, saved ?? '');
    assert.equal(el['save-status'].textContent, 'Uloženo');
  }
  const count = edit.writes.length;
  await change('name', 'Eliška');
  for (const value of ['', '   ']) {
    await change('name', value);
    assert.match(el['error-name'].textContent, /nemůže být prázdné/);
    assert.equal(el['edit-name'].value, 'Eliška');
  }
  for (const value of ['0', '21', '1.5', 'abc']) {
    await change('level', value);
    assert.match(el['error-level'].textContent, /celé číslo/);
    assert.equal(el['edit-level'].value, 1);
  }
  // Prohlížeč může neplatné číslo vrátit jako prázdný string + badInput.
  el['edit-level'].validity.badInput = true;
  await change('level', '');
  el['edit-level'].validity.badInput = false;
  assert.equal(edit.writes.length, count);
  // Opravený vstup smaže validaci okamžitě, ještě před blur, bez zápisu.
  el['edit-name'].value = 'Eliška';
  el['edit-name'].handlers.input();
  assert.equal(el['error-name'].textContent, '');
  assert.equal(el['edit-name'].attributes['aria-invalid'], 'false');
  el['edit-level'].value = '21';
  el['edit-level'].handlers.input();
  assert.match(el['error-level'].textContent, /celé číslo/);
  el['edit-level'].value = '1';
  el['edit-level'].handlers.input();
  assert.equal(el['error-level'].textContent, '');
  await change('name', '');
  await change('level', '21');
  el['edit-toggle'].handlers.click();
  for (const slot of ['name', 'level']) {
    assert.equal(el[`error-${slot}`].textContent, '');
    assert.equal(el[`edit-${slot}`].attributes['aria-invalid'], 'false');
  }
  el['edit-toggle'].handlers.click();
  assert.equal(el['error-name'].textContent, '');
  assert.equal(el['error-level'].textContent, '');
  assert.equal(edit.writes.length, count);
  edit.control.error = { code: '42501', message: 'Denied' };
  await change('name', 'Neuložené jméno');
  assert.equal(el['save-status'].textContent, 'Nepodařilo se uložit');
  assert.equal(el['edit-name'].value, 'Eliška');
  assert.equal(el['character-name'].textContent, 'Eliška');
  assert.ok(edit.logs.length);
  el['edit-name'].handlers.input();
  el['edit-toggle'].handlers.click();
  assert.match(el['error-name'].textContent, /Nepodařilo se uložit/);
  assert.equal(el['save-status'].textContent, 'Nepodařilo se uložit');
  el['edit-toggle'].handlers.click();
  edit.control.error = null;
  let release;
  edit.control.wait = new Promise(resolve => { release = resolve; });
  const saving = change('name', 'Nové jméno');
  assert.equal(el['edit-name'].disabled, true);
  assert.equal(el['save-status'].textContent, 'Ukládám…');
  el['edit-toggle'].handlers.click();
  assert.equal(el['edit-name'].hidden, true);
  release(); await saving;
  assert.equal(el['character-name'].textContent, 'Nové jméno');
  assert.equal(el['edit-name'].disabled, false);
  assert.equal(el['save-status'].textContent, 'Uloženo');
  assert.equal(el['edit-toggle'].attributes['aria-pressed'], 'false');
  edit.control.wait = null;
  el['edit-toggle'].handlers.click();
  let finishFirst;
  edit.control.wait = new Promise(resolve => { finishFirst = resolve; });
  const first = change('race', 'elf');
  edit.control.wait = null;
  await change('class', 'wizard');
  assert.equal(el['save-status'].textContent, 'Ukládám…');
  finishFirst(); await first;
  assert.equal(el['character-race'].textContent, 'Elf');
  assert.equal(el['character-class'].textContent, 'Kouzelník');
  assert.equal(el['save-status'].textContent, 'Uloženo');
  // Úspěch jiného pole nesmí zamaskovat předchozí selhání.
  edit.control.error = { code: '23514', message: 'Rejected' };
  await change('level', '2');
  edit.control.error = null;
  await change('race', 'human');
  assert.equal(el['save-status'].textContent, 'Nepodařilo se uložit');
  assert.equal(el['edit-level'].value, 1);
  const scores = { ...base };
  const abilityPage = await page(`?character_id=${id}`, scores);
  const ae = abilityPage.elements;
  assert.equal(ae.abilities.hidden, false);
  for (const key of abilityKeys) {
    assert.equal(ae[`edit-${key}`].hidden, false);
    assert.equal(ae[`edit-${key}`].value, '');
    assert.equal(ae[`modifier-${key}`].textContent, '');
    for (const [value, modifier] of [[1, '-5'], [8, '-1'], [9, '-1'], [10, '0'], [11, '0'], [12, '+1'], [15, '+2'], [20, '+5']]) {
      ae[`edit-${key}`].value = String(value);
      ae[`edit-${key}`].handlers.input();
      assert.equal(ae[`modifier-${key}`].textContent, modifier);
      await ae[`edit-${key}`].handlers.blur();
      assert.deepEqual(abilityPage.writes.at(-1), { [key]: value });
      const reloaded = await page(`?character_id=${id}`, scores);
      assert.equal(reloaded.elements[`modifier-${key}`].textContent, modifier);
    }
    const writesBefore = abilityPage.writes.length;
    await ae[`edit-${key}`].handlers.blur();
    assert.equal(abilityPage.writes.length, writesBefore);
    for (const invalid of ['0', '21', '-5', '12.5', 'abc']) {
      ae[`edit-${key}`].value = invalid;
      await ae[`edit-${key}`].handlers.blur();
      assert.equal(ae[`edit-${key}`].value, 20);
      assert.equal(ae[`modifier-${key}`].textContent, '+5');
      assert.match(ae[`error-${key}`].textContent, /celé číslo/);
      ae[`edit-${key}`].handlers.input();
      assert.equal(ae[`error-${key}`].textContent, '');
    }
    assert.equal(abilityPage.writes.length, writesBefore);
    ae[`edit-${key}`].value = '';
    ae[`edit-${key}`].validity.badInput = true;
    await ae[`edit-${key}`].handlers.blur();
    assert.equal(abilityPage.writes.length, writesBefore);
    ae[`edit-${key}`].validity.badInput = false;
    ae[`edit-${key}`].value = '';
    ae[`edit-${key}`].handlers.input();
    await ae[`edit-${key}`].handlers.blur();
    assert.equal(scores[key], null);
    assert.equal(ae[`modifier-${key}`].textContent, '');
    assert.equal((await page(`?character_id=${id}`, scores)).elements[`edit-${key}`].value, '');
  }
  scores.str = 15;
  const failedAbility = await page(`?character_id=${id}`, scores);
  failedAbility.control.error = { code: '42501', message: 'Denied' };
  failedAbility.elements['edit-str'].value = '16';
  failedAbility.elements['edit-str'].handlers.input();
  assert.equal(failedAbility.elements['modifier-str'].textContent, '+3');
  await failedAbility.elements['edit-str'].handlers.blur();
  assert.equal(failedAbility.elements['edit-str'].value, 15);
  assert.equal(failedAbility.elements['modifier-str'].textContent, '+2');
  assert.equal(failedAbility.elements['save-status'].textContent, 'Nepodařilo se uložit');
  assert.ok(failedAbility.logs.length);
  ae['edit-toggle'].handlers.click();
  ae['edit-str'].value = '21';
  await ae['edit-str'].handlers.blur();
  assert.match(ae['error-str'].textContent, /celé číslo/);
  const writesBeforeClosing = abilityPage.writes.length;
  ae['edit-toggle'].handlers.click();
  assert.equal(ae['edit-str'].hidden, false);
  assert.equal(ae['edit-str'].readOnly, true);
  assert.equal(ae['error-str'].textContent, '');
  assert.equal(ae['edit-str'].attributes['aria-invalid'], 'false');
  assert.equal(abilityPage.writes.length, writesBeforeClosing);
  const resourceRow = { ...base, level: 1, xp: 100, current_hp: 8, max_hp: 12 };
  const resources = await page(`?character_id=${id}`, resourceRow);
  const re = resources.elements;
  assert.equal(re['xp-next'].textContent, 'Do další úrovně: 200');
  async function deltaHp(value) {
    re['hp-delta'].value = value.replace(/^[+-]/, '');
    await re[value.startsWith('-') ? 'hp-minus' : 'hp-plus'].handlers.click();
  }
  await deltaHp('-5'); assert.equal(resourceRow.current_hp, 3);
  await deltaHp('+3'); assert.equal(resourceRow.current_hp, 6);
  await deltaHp('-50'); assert.equal(resourceRow.current_hp, 0);
  await deltaHp('+50'); assert.equal(resourceRow.current_hp, 12);
  let resourceWrites = resources.writes.length;
  await deltaHp('+1'); assert.equal(resources.writes.length, resourceWrites);
  for (const value of ['abc', '2.5', '+2.5', '0', '']) await deltaHp(value);
  assert.equal(resources.writes.length, resourceWrites);
  re['hp-delta'].value = '1'; re['hp-delta'].handlers.input();
  assert.equal(re['hp-error'].textContent, '');
  re['edit-toggle'].handlers.click();
  async function resourceChange(key, value) {
    re[`edit-${key}`].value = value;
    await re[`edit-${key}`].handlers.blur();
  }
  await resourceChange('xp', '350');
  assert.equal(resourceRow.level, 1);
  assert.match(re['xp-next'].textContent, /dost XP/);
  await resourceChange('xp', ''); assert.equal(resourceRow.xp, null);
  assert.equal(re['xp-next'].textContent, '');
  await resourceChange('xp', '0'); assert.equal(resourceRow.xp, 0);
  resourceWrites = resources.writes.length;
  for (const value of ['-1', '1.5', 'abc']) await resourceChange('xp', value);
  assert.equal(resources.writes.length, resourceWrites);
  await resourceChange('max_hp', '10');
  assert.deepEqual(resources.writes.at(-1), { max_hp: 10, current_hp: 10 });
  assert.equal(resourceRow.current_hp, 10);
  resources.control.error = { code: '42501', message: 'Denied' };
  await resourceChange('max_hp', '5');
  assert.equal(re['edit-max_hp'].value, 10);
  assert.equal(re['character-current_hp'].textContent, 10);
  assert.equal(resourceRow.max_hp, 10);
  assert.equal(re['save-status'].textContent, 'Nepodařilo se uložit');
  await deltaHp('-3'); assert.equal(resourceRow.current_hp, 10);
  resources.control.error = null;
  resourceWrites = resources.writes.length;
  for (const [key, value] of [['max_hp', '0'], ['max_hp', '-1'], ['current_hp', '-1'], ['current_hp', '11']]) await resourceChange(key, value);
  assert.equal(resources.writes.length, resourceWrites);
  re['edit-current_hp'].value = '8'; re['edit-current_hp'].handlers.input();
  assert.equal(re['error-current_hp'].textContent, '');
  await resourceChange('current_hp', '');
  assert.equal(re['hp-delta'].disabled, true);
  assert.match(re['hp-hint'].textContent, /aktuální HP/);
  await resourceChange('max_hp', '');
  assert.match(re['hp-hint'].textContent, /maximální HP/);
  resourceWrites = resources.writes.length;
  await resourceChange('current_hp', '1'); await deltaHp('+1');
  assert.equal(resources.writes.length, resourceWrites);
  await resourceChange('max_hp', '12');
  assert.equal(resourceRow.current_hp, null);
  await resourceChange('current_hp', '8');
  assert.equal(re['hp-delta'].disabled, false);
  let finishHp;
  resources.control.wait = new Promise(resolve => { finishHp = resolve; });
  const pendingHp = resourceChange('max_hp', '6');
  assert.equal(re['edit-current_hp'].disabled, true);
  resourceWrites = resources.writes.length;
  await deltaHp('-5');
  assert.equal(resources.writes.length, resourceWrites);
  finishHp(); await pendingHp;
  assert.equal(resourceRow.current_hp, 6);
  const reloadResources = await page(`?character_id=${id}`, resourceRow);
  assert.equal(reloadResources.elements['character-max_hp'].textContent, 6);
  assert.equal(reloadResources.elements['character-current_hp'].textContent, 6);
  for (const [level, threshold] of [[1,300],[2,900],[3,2700],[4,6500],[5,14000],[6,23000],[7,34000],[8,48000],[9,64000],[10,85000],[11,100000],[12,120000],[13,140000],[14,165000],[15,195000],[16,225000],[17,265000],[18,305000],[19,355000]]) {
    const thresholdPage = await page(`?character_id=${id}`, { ...base, level, xp: 0 });
    assert.equal(thresholdPage.elements['xp-next'].textContent, `Do další úrovně: ${threshold}`);
  }
  for (const level of [null, 20]) assert.equal((await page(`?character_id=${id}`, { ...base, level, xp: 500 })).elements['xp-next'].textContent, '');
  const pairs = { barbarian: ['str','con'], bard: ['dex','cha'], fighter: ['str','con'], sorcerer: ['con','cha'], warlock: ['wis','cha'], druid: ['int','wis'], ranger: ['str','dex'], cleric: ['wis','cha'], wizard: ['int','wis'], monk: ['str','dex'], paladin: ['wis','cha'], rogue: ['dex','int'] };
  for (const [class_code, proficient] of Object.entries(pairs)) {
    for (const [level, pb] of [[null,0],[1,2],[4,2],[5,3],[8,3],[9,4],[12,4],[13,5],[16,5],[17,6],[20,6]]) {
      const saves = await page(`?character_id=${id}`, { ...base, class_code, level, ...Object.fromEntries(abilityKeys.map(key => [key,16])) });
      for (const key of abilityKeys) {
        assert.equal(saves.elements[`save-${key}`].textContent, `+${3 + (proficient.includes(key) ? pb : 0)}`);
        assert.equal(saves.elements[`save-proficiency-${key}`].hidden, !proficient.includes(key));
      }
      assert.equal(saves.writes.length, 0);
    }
  }
  for (const class_code of [null, 'unknown']) {
    const saves = await page(`?character_id=${id}`, { ...base, class_code, level: 3, str:16, dex:8, con:10 });
    assert.equal(saves.elements['save-str'].textContent, '+3');
    assert.equal(saves.elements['save-dex'].textContent, '-1');
    assert.equal(saves.elements['save-con'].textContent, '0');
    assert.equal(saves.elements['save-wis'].textContent, '');
    assert.equal(saves.elements['save-proficiency-str'].hidden, true);
  }
  const saveRow = { ...base, class_code: 'barbarian', level: 1, str: 16, con: 14, dex:12 };
  const saves = await page(`?character_id=${id}`, saveRow);
  const se = saves.elements;
  assert.equal(se['save-str'].textContent, '+5');
  assert.equal(se['save-con'].textContent, '+4');
  assert.equal(se['save-dex'].textContent, '+1');
  se['edit-toggle'].handlers.click();
  se['edit-str'].value = '18'; se['edit-str'].handlers.input();
  assert.equal(se['save-str'].textContent, '+6');
  assert.equal(saves.writes.length, 0);
  saves.control.error = { code: '42501', message: 'Denied' };
  await se['edit-str'].handlers.blur();
  assert.equal(se['save-str'].textContent, '+5');
  saves.control.error = null;
  se['edit-level'].value = '5';
  se['edit-level'].handlers.input();
  assert.equal(se['save-str'].textContent, '+5');
  await se['edit-level'].handlers.blur();
  assert.equal(se['save-str'].textContent, '+6');
  se['edit-class'].value = 'bard'; await se['edit-class'].handlers.blur();
  assert.equal(se['save-str'].textContent, '+3');
  assert.equal(se['save-proficiency-str'].hidden, true);
  assert.equal(se['save-dex'].textContent, '+4');
  saves.control.error = { code: '42501', message: 'Denied' };
  se['edit-class'].value = 'fighter'; await se['edit-class'].handlers.blur();
  assert.equal(se['save-proficiency-dex'].hidden, false);
  assert.ok(saves.writes.every(patch => Object.keys(patch).every(key => ['str','level','class_code'].includes(key))));
  const html = readFileSync(resolve(__dirname, '../public/character.html'), 'utf8');
  assert.ok(!html.includes('<h1>Deník postavy</h1>'));
  console.log('PASS: character page loading, UUID, portraits, edit toggle, exact choices, blur saves/reload, NULL, validation, unchanged values, failed/pending saves');
})().catch(error => { console.error(error); process.exitCode = 1; });
