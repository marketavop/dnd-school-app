const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/game-panel.js', 'utf8').replace(/^import .*;\r?\n/gm, '').split('\nif (valid) {')[0];
function check(user) {
  const elements = Object.fromEntries(['game-character-name','character-panel','dice-toggle','dice-panel','overview-tab','abilities-tab'].map(id => [id, {
    hidden: true, disabled: false, handlers: {}, setAttribute() {}, addEventListener(type, fn) { this.handlers[type] = fn; },
  }]));
  const context = vm.createContext({ gameUser: user, document: { getElementById: id => elements[id], querySelector: s => elements[s.slice(1)] } });
  vm.runInContext(source, context);
  return elements;
}
assert.equal(check({ role: 'leader', session_token: 'verified' })['dice-toggle'].disabled, false);
assert.equal(check({ role: 'player', session_token: 'verified', character_id: '12345678-1234-4321-9876-123456789abc' })['dice-toggle'].disabled, false);
assert.equal(check(null)['dice-toggle'].disabled, true);
console.log('PASS: leader and player dice panel availability is session-based; unauthenticated access remains disabled');
