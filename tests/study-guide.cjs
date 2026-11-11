// node tests/study-guide.cjs — local guide transitions; native dialog keyboard
// behavior and responsive layout still require a real browser check.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const html = readFileSync(resolve(__dirname, '../public/character.html'), 'utf8');
const races = ['human', 'elf', 'halfling', 'dwarf', 'gnome', 'half-elf', 'half-orc', 'tiefling'];
const buttons = [...html.matchAll(/<button id="(study-guide-[^"]+)" type="button" data-study-guide-topic="([^"]+)" aria-controls="([^"]+)">/g)];
assert.deepEqual(buttons.map(match => match[2]), races);
const articles = [...html.matchAll(/<article id="study-guide-race-([^"]+)"[^>]*>([\s\S]*?)<\/article>/g)];
assert.deepEqual(articles.map(match => match[1]), races);
for (const [, id, body] of articles) {
  assert.equal((body.match(/<h4>/g) || []).length, 4, `${id}: four sections`);
  assert.match(body, /<h4>Rasové vlastnosti<\/h4>/);
  assert.match(body, /<h4>Příklad<\/h4>/);
  if (['elf', 'halfling', 'dwarf', 'gnome'].includes(id)) assert.match(body, /Další vlastnosti závisí.*Vypravěč/);
}
assert.match(articles[3][2], /dvojnásobek zdatnostního bonusu/);
assert.match(articles[7][2], /Sesílací vlastností je Charisma/);
assert.match(articles[7][2], /Každé z těchto dvou kouzel.*jednou.*důkladném odpočinku/);
const elements = new Map();
let focused;
const document = { querySelector(selector) {
  if (!elements.has(selector)) elements.set(selector, {
    hidden: false, scrollTop: 100, handlers: {},
    addEventListener(event, handler) { this.handlers[event] = handler; },
    querySelector: selector => document.querySelector(selector),
    querySelectorAll: () => buttons.map(match => document.querySelector(`#${match[1]}`)),
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
  button.getAttribute = name => name === 'aria-controls' ? target : null;
}
vm.runInNewContext(readFileSync(resolve(__dirname, '../public/study-guide.js'), 'utf8'), { document });
const get = id => document.querySelector(`#${id}`);
const click = id => get(id).handlers.click();
click('supplementary-info');
assert.equal(get('study-guide').open, true);
assert.equal(get('study-guide-overview').hidden, false);
assert.equal(get('study-guide-detail').hidden, true);
for (const race of races) {
  click(`study-guide-${race}`);
  assert.equal(focused, get(`study-guide-${race}-title`));
  for (const other of races) assert.equal(get(`study-guide-race-${other}`).hidden, other !== race);
  click('study-guide-back');
  assert.equal(focused, get(`study-guide-${race}`));
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
console.log('PASS: eight races, four sections, subrace notes, all topic transitions, focus restoration and DOM isolation');
