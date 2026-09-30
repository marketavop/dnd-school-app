const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('node:fs').readFileSync('public/admin-view.js', 'utf8').replaceAll('export ', '');
const sections = Object.fromEntries(['leader-content', 'leader-players', 'leader-maps'].map(id => [id, { hidden: true }]));
const document = { querySelector: selector => sections[selector.slice(1)] };
const window = { location: { href: 'https://example.test/index.html?character_id=abc&view=players#leader-players' }, history: {
  pushState(_, __, href) { window.location.href = href; },
} };
const context = vm.createContext({ document, window, URL });
vm.runInContext(`${source}
showAdminView(document, 'players');
navigateAdminView(window, 'maps');
showAdminView(document, 'maps');`, context);
assert.equal(sections['leader-content'].hidden, true);
assert.equal(sections['leader-players'].hidden, true);
assert.equal(sections['leader-maps'].hidden, false);
assert.equal(new URL(window.location.href).searchParams.get('view'), 'maps');
assert.equal(new URL(window.location.href).hash, '');
assert.equal([sections['leader-content'], sections['leader-players'], sections['leader-maps']].filter(section => !section.hidden).length, 1);
vm.runInContext("navigateAdminView(window, 'players'); showAdminView(document, 'players');", context);
assert.equal(sections['leader-players'].hidden, false);
assert.equal(sections['leader-maps'].hidden, true);
vm.runInContext("navigateAdminView(window, 'home'); showAdminView(document, 'home');", context);
assert.equal(sections['leader-content'].hidden, false);
assert.equal(sections['leader-players'].hidden, true);
assert.equal(sections['leader-maps'].hidden, true);
assert.equal(new URL(window.location.href).searchParams.get('view'), null);
assert.equal(new URL(window.location.href).hash, '');
console.log('PASS: exclusive admin views, players/maps/home transitions and fragment removal');
