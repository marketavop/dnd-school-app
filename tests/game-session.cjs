const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/leader-game.js', 'utf8').replace(/^import .*;\r?\n/gm, '');
for (const role of ['leader', 'player', null]) {
  const elements = Object.fromEntries(['leader-content', 'home-content', 'leader-game', 'leader-game-frame', 'main',
    'leader-game-link', 'game-link', 'leader-game-back'].map(id => [id, {
    hidden: false, handlers: {}, classList: { add() {}, remove() {} },
    addEventListener(type, fn) { this.handlers[type] = fn; },
    removeAttribute(key) { delete this[key]; },
  }]));
  const window = {};
  const mutate = () => {};
  const context = { window, document: { querySelector: s => elements[s.replace(/^#/, '')] },
    getCurrentUser: () => role ? { role, character_id: 'account-character', session_token: 'secret-session' } : null,
    loadMaps() {}, setActiveMap() {}, loadGameTokens() {}, loadNpcs() {}, loadNpcDefinitions() {}, mutateNpc() {}, mutateGameToken: mutate,
  };
  vm.runInNewContext(source, context);
  if (!role) {
    assert.throws(() => window.getGameIdentity());
    elements['game-link'].handlers.click({ preventDefault() {} });
    assert.equal(elements['leader-game-frame'].src, undefined);
    continue;
  }
  elements[role === 'leader' ? 'leader-game-link' : 'game-link'].handlers.click({ preventDefault() {} });
  assert.equal(elements['leader-game-frame'].src, `./game.html?mode=${role}`);
  assert.equal(window.getGameIdentity().role, role);
  assert.equal(window.getGameIdentity().character_id, 'account-character');
  assert.equal(window.getGameIdentity().session_token, undefined);
  assert.equal(window.mutateGameToken, mutate);
  elements['leader-game-back'].handlers.click();
  assert.equal(elements['leader-game-frame'].src, undefined);
  assert.equal(elements[role === 'leader' ? 'leader-content' : 'home-content'].hidden, false);
}
console.log('PASS: both game views retain homepage session without exposing token or changing login');
