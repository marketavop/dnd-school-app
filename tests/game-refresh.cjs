const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const hostSource = fs.readFileSync('public/leader-game.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');
const loginSource = fs.readFileSync('public/login-page.js', 'utf8').replace(/^import .*;\r?\n/gm, '');
const navigationSource = fs.readFileSync('public/navigation.js', 'utf8').replace('export let', 'let');
function page(role, href, waitForSession = Promise.resolve()) {
  const elements = {};
  const document = { querySelector(selector) {
    return elements[selector] ||= { hidden: true, handlers: {}, classList: { add() {} },
      addEventListener(type, fn) { this.handlers[type] = fn; } };
  } };
  let user = null;
  let loginOptions;
  const window = { location: { href }, history: {
    replaceState(state, title, url) { window.location.href = url; },
  } };
  const context = vm.createContext({ window, document, URL,
    getCurrentUser: () => user,
    loadMaps() {}, setActiveMap() {}, loadGameTokens() {}, loadNpcs() {}, loadNpcDefinitions() {}, mutateNpc() {}, mutateGameToken() {},
    mountLogin(options) { loginOptions = options; },
    async restoreSession() {
      await waitForSession;
      user = role ? { role, session_token: 'verified-token', character_id: 'character' } : null;
      return user;
    },
    continueAfterLogin: () => false,
    showRoleHome() { document.querySelector(role === 'leader' ? '#leader-content' : '#home-content').hidden = false; },
    showLogout() {}, showSessionError() { throw new Error('Unexpected session error'); },
  });
  const ready = vm.runInContext(`(async () => { ${hostSource}\n${loginSource} })()`, context);
  return { window, elements, ready, login: () => loginOptions.onSuccess() };
}
(async () => {
  for (const role of ['player', 'leader']) {
    const original = 'https://example.test/index.html?character_id=character&extra=keep&mode=attacker#anchor';
    const first = page(role, original); await first.ready;
    assert.equal(first.elements['#leader-game-frame'].src, undefined);
    first.elements[role === 'player' ? '#game-link' : '#leader-game-link'].handlers.click({ preventDefault() {} });
    const gameUrl = new URL(first.window.location.href);
    assert.equal(gameUrl.searchParams.get('view'), 'game');
    assert.equal(gameUrl.searchParams.get('character_id'), 'character');
    assert.equal(gameUrl.searchParams.get('extra'), 'keep');
    assert.equal(gameUrl.hash, '#anchor');
    assert.equal(first.elements['#leader-game-frame'].src, `./game.html?mode=${role}`);
    let verify;
    const refreshed = page(role, gameUrl.href, new Promise(resolve => { verify = resolve; }));
    assert.equal(refreshed.elements['#leader-game-frame'].src, undefined, 'Wait for session validation');
    verify(); await refreshed.ready;
    assert.equal(refreshed.elements['#leader-game-frame'].src, `./game.html?mode=${role}`);
    assert.equal(refreshed.elements['#leader-game'].hidden, false);
    assert.equal(refreshed.elements['#home-content'].hidden, true);
    assert.equal(refreshed.elements['#leader-content'].hidden, true);
    // Execute the actual iframe home-link initialization.
    const home = {};
    const frameContext = vm.createContext({ URLSearchParams, window: {
      parent: refreshed.window, location: { search: `?mode=${role}` },
    }, document: { querySelector: selector => selector === '#home-link' ? home : null } });
    await vm.runInContext(`(async () => { ${navigationSource} })()`, frameContext);
    const homeUrl = new URL(home.href);
    assert.equal(homeUrl.searchParams.has('view'), false);
    assert.equal(homeUrl.searchParams.get('extra'), 'keep');
    assert.equal(homeUrl.searchParams.get('character_id'), 'character');
    const returned = page(role, home.href); await returned.ready;
    const homeRefresh = page(role, returned.window.location.href); await homeRefresh.ready;
    assert.equal(homeRefresh.elements['#leader-game-frame'].src, undefined);
  }
  const denied = page(null, 'https://example.test/index.html?view=game&mode=leader');
  await denied.ready;
  assert.equal(denied.elements['#leader-game-frame'].src, undefined);
  assert.equal(denied.elements['#login-form'].hidden, false);
  denied.elements['#leader-game-link'].handlers.click({ preventDefault() {} });
  assert.equal(denied.elements['#leader-game-frame'].src, undefined);
  console.log('PASS: player/leader F5 restore after validation, role from session, URL preservation, home/F5 and missing session guard');
})().catch(error => { console.error(error); process.exitCode = 1; });
