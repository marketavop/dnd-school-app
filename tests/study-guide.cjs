// node tests/study-guide.cjs — local guide transitions; native dialog keyboard
// behavior and responsive layout still require a real browser check.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const html = readFileSync(resolve(__dirname, '../public/character.html'), 'utf8');
const css = readFileSync(resolve(__dirname, '../public/styles.css'), 'utf8');
const races = ['human', 'elf', 'halfling', 'dwarf', 'gnome', 'half-elf', 'half-orc', 'tiefling'];
const classes = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'];
const backgrounds = ['acolyte', 'charlatan', 'criminal', 'entertainer', 'folk-hero', 'guild-artisan', 'hermit', 'noble', 'outlander', 'sage', 'sailor', 'soldier', 'urchin'];
const classLabels = {
  barbarian: 'Barbar (Barbarian)', bard: 'Bard (Bard)', cleric: 'Klerik (Cleric)', druid: 'Druid (Druid)',
  fighter: 'Bojovník (Fighter)', monk: 'Mnich (Monk)', paladin: 'Paladin (Paladin)', ranger: 'Hraničář (Ranger)',
  rogue: 'Tulák (Rogue)', sorcerer: 'Čaroděj (Sorcerer)', warlock: 'Černokněžník (Warlock)', wizard: 'Kouzelník (Wizard)',
};
const backgroundLabels = {
  acolyte: 'Akolyta (Acolyte)', charlatan: 'Šarlatán (Charlatan)', criminal: 'Zločinec (Criminal)', entertainer: 'Umělec (Entertainer)',
  'folk-hero': 'Lidový hrdina (Folk Hero)', 'guild-artisan': 'Cechovní řemeslník (Guild Artisan)', hermit: 'Poustevník (Hermit)',
  noble: 'Šlechtic (Noble)', outlander: 'Poutník z divočiny (Outlander)', sage: 'Učenec (Sage)', sailor: 'Námořník (Sailor)',
  soldier: 'Voják (Soldier)', urchin: 'Dítě ulice (Urchin)',
};
const buttons = [...html.matchAll(/<button id="(study-guide-[^"]+)" type="button" data-study-guide-topic="([^"]+)"[^>]*aria-controls="([^"]+)">/g)];
assert.deepEqual(buttons.map(match => match[2]), [...races, ...classes, ...backgrounds, 'abilities', 'skills', 'features']);
for (const [, id, topic] of buttons.filter(match => races.includes(match[2]))) {
  const expected = {
    human: 'Člověk (Human)', elf: 'Elf (Elf)', halfling: 'Půlčík (Halfling)', dwarf: 'Trpaslík (Dwarf)',
    gnome: 'Gnóm (Gnome)', 'half-elf': 'Půlelf (Half-Elf)', 'half-orc': 'Půlork (Half-Orc)', tiefling: 'Tiefling (Tiefling)',
  }[topic];
  assert.match(html.match(new RegExp(`<button id="${id}"[^>]*>([\\s\\S]*?)</button>`))[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(), new RegExp(`^${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}→$`));
}
const articles = [...html.matchAll(/<article id="study-guide-race-([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)];
assert.deepEqual(articles.map(match => match[1]), races);
for (const [, id, body] of articles) {
  assert.equal((body.match(/<h4>/g) || []).length, ['elf', 'halfling', 'dwarf', 'gnome'].includes(id) ? 5 : 4, `${id}: expected guide sections`);
  assert.match(body, /<h4>Rasové vlastnosti<\/h4>/);
  assert.match(body, /<h4>Příklad<\/h4>/);
  if (['elf', 'halfling', 'dwarf', 'gnome'].includes(id)) assert.match(body, /<h4>Podrasy/);
}
const subraceCodes = [...html.matchAll(/data-subrace-code="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(subraceCodes, ['high_elf', 'wood_elf', 'drow', 'lightfoot_halfling', 'stout_halfling', 'hill_dwarf', 'mountain_dwarf', 'forest_gnome', 'rock_gnome']);
const elf = articles.find(match => match[1] === 'elf')[2];
assert.match(elf, /Citlivost na sluneční světlo/);
assert.match(elf, /Od 1\. úrovně.*Od 3\. úrovně.*Od 5\. úrovně/);
const rockGnome = articles.find(match => match[1] === 'gnome')[2];
assert.match(rockGnome, /nejvýše tři/);
assert.match(rockGnome, /24 hodin/);
assert.match(articles[3][2], /dvojnásobek zdatnostního bonusu/);
assert.match(articles[7][2], /Sesílací vlastností je Charisma/);
assert.match(articles[7][2], /Každé z těchto dvou kouzel.*jednou.*důkladném odpočinku/);
assert.match(articles.find(match => match[1] === 'halfling')[2], /<h3[^>]*>Půlčík \(Halfling\)<\/h3>/);
assert.doesNotMatch(articles.find(match => match[1] === 'halfling')[2], /Hobit/);
const backgroundArticles = [...html.matchAll(/<article id="study-guide-background-([^\"]+)"[^>]*>([\s\S]*?)<\/article>/g)];
assert.deepEqual(backgroundArticles.map(match => match[1]), backgrounds);
assert.equal((html.match(/Zdroj pravidel/g) || []).length, 1, 'one shared source note');
for (const [, id, body] of backgroundArticles) {
  assert.match(body, new RegExp(`<h3[^>]*>${backgroundLabels[id].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h3>`), `${id}: exact bilingual title`);
  assert.match(body, /<h3[^>]*>[^<]+ \([^<]+\)<\/h3>/, `${id}: bilingual title`);
  assert.match(body, /<details><summary>Podrobnosti<\/summary>/, `${id}: collapsible details`);
  assert.match(body, /<strong>Dovednosti:<\/strong>/, `${id}: skills`);
}
const classArticles = [...html.matchAll(/<article id="study-guide-class-([^\"]+)"[^>]*>([\s\S]*?)<\/article>/g)];
assert.deepEqual(classArticles.map(match => match[1]), classes);
for (const [, id, body] of classArticles) {
  assert.match(body, new RegExp(`<h3[^>]*>${classLabels[id].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h3>`), `${id}: exact bilingual title`);
  assert.match(body, /<h3[^>]*>[^<]+ \([^<]+\)<\/h3>/, `${id}: bilingual title`);
  assert.match(body, /<p><strong>Chceš|<p><strong>Chces/, `${id}: quick card`);
  assert.match(body, /<details><summary>Podrobnosti<\/summary>/, `${id}: collapsible details`);
  assert.match(body, /<strong>Důležité vlastnosti:<\/strong>/, `${id}: key abilities`);
}
const paladin = classArticles.find(match => match[1] === 'paladin')[2];
assert.match(paladin, /Léčivý dotek \(Lay on Hands\)/);
assert.match(paladin, /Kamarádovi zbývají jen 2 HP.*obnovíš mu 3 HP.*Teď má 5 HP/);
assert.match(paladin, /vyžaduje akci.*Nejde o bonusovou akci ani o seslání kouzla/);
const mechanicArticles = [...html.matchAll(/<article id="study-guide-mechanic-([^\"]+)"[^>]*>([\s\S]*?)<\/article>/g)];
assert.deepEqual(mechanicArticles.map(match => match[1]), ['abilities', 'skills', 'features']);
for (const [, id, body] of mechanicArticles) {
  assert.match(body, /<details><summary>Podrobnosti<\/summary>/, `${id}: collapsible details`);
}
assert.match(mechanicArticles.find(match => match[1] === 'skills')[2], /<details><summary>Co znamená 18 Dovedností\?<\/summary>/);
assert.equal((html.match(/data-study-guide-section=/g) || []).length, 3);
assert.match(css, /\[data-study-guide-category-panel="mechanics"\] \.study-guide-topics \{ grid-template-columns: minmax\(0, 1fr\); \}/);
const elements = new Map();
const documentHandlers = {};
let focused;
const document = { addEventListener(event, handler) { documentHandlers[event] = handler; }, dispatchEvent(event) { documentHandlers[event.type]?.(event); }, querySelector(selector) {
  if (!elements.has(selector)) elements.set(selector, {
    id: selector.startsWith('#') ? selector.slice(1) : selector,
    hidden: false, scrollTop: 100, handlers: {}, dataset: {},
    addEventListener(event, handler) { this.handlers[event] = handler; },
    setAttribute(name, value) { this[name] = value; },
    querySelector: selector => document.querySelector(selector),
    querySelectorAll: selector => selector.includes('[role="tab"]')
      ? ['study-guide-category-races', 'study-guide-category-classes', 'study-guide-category-backgrounds', 'study-guide-category-mechanics'].map(id => document.querySelector(`#${id}`))
      : selector.includes('[data-study-guide-category-panel]')
        ? ['study-guide-races-panel', 'study-guide-classes-panel', 'study-guide-backgrounds-panel', 'study-guide-mechanics-panel'].map(id => document.querySelector(`#${id}`))
        : buttons.map(match => document.querySelector(`#${match[1]}`)),
    focus() { focused = this; },
    showModal() { this.open = true; },
    close() { this.open = false; this.handlers.close(); },
  });
  return elements.get(selector);
} };
document.getElementById = id => document.querySelector(`#${id}`);
for (const [, id, race, target] of buttons) {
  const button = document.getElementById(id);
  button.dataset = { studyGuideTopic: race };
  if (['abilities', 'skills', 'features'].includes(race)) button.dataset.studyGuideSection = race;
  button.getAttribute = name => name === 'aria-controls' ? target : null;
  button.topicParent = { hidden: false };
  button.closest = () => button.topicParent;
}
document.querySelector('#study-guide-races-panel').dataset = { studyGuideCategoryPanel: 'races' };
document.querySelector('#study-guide-classes-panel').dataset = { studyGuideCategoryPanel: 'classes' };
document.querySelector('#study-guide-backgrounds-panel').dataset = { studyGuideCategoryPanel: 'backgrounds' };
document.querySelector('#study-guide-mechanics-panel').dataset = { studyGuideCategoryPanel: 'mechanics' };
vm.runInNewContext(readFileSync(resolve(__dirname, '../public/study-guide.js'), 'utf8'), { document });
const get = id => document.querySelector(`#${id}`);
const click = id => get(id).handlers.click();
click('supplementary-info');
assert.equal(get('study-guide').open, true);
assert.equal(get('study-guide-overview').hidden, false);
assert.equal(get('study-guide-detail').hidden, true);
assert.equal(get('study-guide-races-panel').hidden, false);
assert.equal(get('study-guide-classes-panel').hidden, true);
assert.equal(get('study-guide-backgrounds-panel').hidden, true);
click('study-guide-category-classes');
assert.equal(get('study-guide-races-panel').hidden, true);
assert.equal(get('study-guide-classes-panel').hidden, false);
assert.equal(get('study-guide-backgrounds-panel').hidden, true);
click('study-guide-category-backgrounds');
assert.equal(get('study-guide-races-panel').hidden, true);
assert.equal(get('study-guide-classes-panel').hidden, true);
assert.equal(get('study-guide-backgrounds-panel').hidden, false);
click('study-guide-acolyte');
assert.equal(get('study-guide-back').textContent, '← Zpět na zázemí');
assert.equal(get('study-guide-detail-category').textContent, 'Zázemí · D&D 5e (2014)');
click('study-guide-back');
assert.equal(get('study-guide-backgrounds-panel').hidden, false);
click('study-guide-category-races');
document.dispatchEvent({ type: 'study-guide-section-visibility', detail: [
  { section_id: 'abilities', is_visible: true }, { section_id: 'features', is_visible: true },
] });
assert.equal(get('study-guide-category-mechanics').hidden, false);
assert.equal(get('study-guide-mechanics-panel').hidden, false);
assert.equal(get('study-guide-abilities').closest().hidden, false);
assert.equal(get('study-guide-skills').closest().hidden, true);
assert.equal(get('study-guide-features').closest().hidden, false);
document.dispatchEvent({ type: 'study-guide-section-visibility', detail: [] });
assert.equal(get('study-guide-category-mechanics').hidden, true);
assert.equal(get('study-guide-mechanics-panel').hidden, true);
for (const topic of [...races, ...classes, ...backgrounds]) {
  click(`study-guide-${topic}`);
  assert.equal(focused, get(`study-guide-${topic}-title`));
  for (const other of races) assert.equal(get(`study-guide-race-${other}`).hidden, other !== topic);
  for (const other of backgrounds) assert.equal(get(`study-guide-background-${other}`).hidden, other !== topic);
  for (const other of classes) assert.equal(get(`study-guide-class-${other}`).hidden, other !== topic);
  if (classes.includes(topic)) {
    assert.equal(get('study-guide-back').textContent, '← Zpět na povolání');
    assert.equal(get('study-guide-detail-category').textContent, 'Povolání · D&D 5e (2014)');
  }
  click('study-guide-back');
  assert.equal(focused, get(`study-guide-${topic}`));
}
click('study-guide-human');
assert.equal(get('study-guide-overview').hidden, true);
assert.equal(get('study-guide-detail').hidden, false);
assert.equal(focused, get('study-guide-human-title'));
click('study-guide-back');
assert.equal(get('study-guide-overview').hidden, false);
assert.equal(get('study-guide-detail').hidden, true);
assert.equal(focused, get('study-guide-human'));
click('study-guide-human');
click('study-guide-close');
assert.equal(get('study-guide').open, false);
assert.equal(focused, get('supplementary-info'));
click('supplementary-info');
assert.equal(get('study-guide-detail').hidden, true);
// The guide may only access its own DOM and the existing trigger: no editor,
// tab, navigation or storage dependencies are supplied to its execution context.
assert.ok([...elements.keys()].every(key => key.includes('study-guide') || key === '#supplementary-info'));
console.log('PASS: eight races, twelve classes, thirteen backgrounds, all topic transitions, focus restoration and DOM isolation');
