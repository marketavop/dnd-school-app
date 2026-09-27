const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/session-page.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replaceAll('export ', '');
function guard(path, restoreSession) {
  const redirects = [], nodes = [], events = {};
  let reloads = 0;
  const window = { location: { href: `https://example.test/public/${path}`, replace: url => redirects.push(url), reload: () => reloads++ },
    addEventListener: (name, fn) => { events[name] = fn; } };
  window.parent = window; window.top = window;
  const ctx = vm.createContext({ URL, window, restoreSession, logout() {},
    document: { body: { prepend: node => nodes.unshift(node) }, querySelector: () => null,
      createElement: () => ({ setAttribute() {}, append() {}, addEventListener() {} }) } });
  vm.runInContext(source, ctx);
  return { redirects, nodes, events, reloads: () => reloads, run: code => vm.runInContext(code, ctx) };
}
(async () => {
  for (const path of ['character.html?character_id=existing', 'game.html?mode=leader']) {
    const denied = guard(path, async () => null);
    assert.equal(await denied.run('requireSession()'), null);
    const target = new URL(denied.redirects[0]);
    assert.equal(target.pathname, '/public/index.html');
    assert.equal(target.searchParams.get('next'), path);
    const offline = guard(path, async () => { throw new Error('offline'); });
    assert.equal(await offline.run('requireSession()'), null);
    assert.equal(offline.redirects.length, 0);
    assert.match(offline.nodes[0].textContent, /nepodařilo ověřit/);
  }
  let complete;
  const pending = guard('game.html', () => new Promise(resolve => { complete = resolve; }));
  const result = pending.run('requireSession()');
  assert.equal(pending.nodes.length, 0); assert.equal(pending.redirects.length, 0);
  complete({ role: 'player' }); assert.equal((await result).role, 'player');
  assert.equal(pending.nodes[0].id, 'session-logout');
  pending.events.pageshow({ persisted: true }); assert.equal(pending.reloads(), 1);
  for (const next of ['https://evil.test/game.html', '//evil.test/game.html', '../game.html', 'javascript:alert(1)', 'index.html']) {
    const unsafe = guard('index.html?next=' + encodeURIComponent(next), async () => null);
    assert.equal(unsafe.run('continueAfterLogin()'), false);
    assert.equal(unsafe.redirects.length, 0);
  }
  const good = guard('index.html?next=' + encodeURIComponent('character.html?character_id=existing'), async () => null);
  assert.equal(good.run('continueAfterLogin()'), true);
  assert.equal(good.redirects[0], 'https://example.test/public/character.html?character_id=existing');
  const bootstrap = fs.readFileSync('public/character-page.js', 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace("await import('./character.js')", 'loadCharacter()');
  for (const authorized of [true, false]) {
    let loads = 0;
    await vm.runInNewContext(`(async () => { ${bootstrap} })()`, {
      requireSession: async () => authorized ? { role: 'player' } : null, loadCharacter: () => loads++,
    });
    assert.equal(loads, Number(authorized), 'no diary initialization before guard succeeds');
  }
  const html = fs.readFileSync('public/character.html', 'utf8');
  assert.ok(html.includes('src="./character-page.js"'));
  assert.ok(!html.includes('src="./character.js"'));
  assert.ok(fs.readFileSync('public/index.html', 'utf8').includes('<form id="login-form" method="post" hidden>'));
  console.log('PASS: guards wait, offline retry, safe return URL, logout control, bfcache and protected diary bootstrap');
})().catch(error => { console.error(error); process.exitCode = 1; });
