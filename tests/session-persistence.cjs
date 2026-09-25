const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/login.js', 'utf8').replaceAll('export ', '')
  .replace("await import('./config.local.js')", 'config');
const id = '12345678-1234-4321-9876-123456789abc';
const session = { user_id: id, role: 'player', character_id: id, session_token: 'ab'.repeat(32) };
const key = 'dnd-school.session.v1';
function storage() {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
}
function page(store, reply = async () => ({ ok: true, status: 200, json: async () => [{ user_id: id, role: 'player' }] }), path = 'index.html') {
  const elements = Object.fromEntries(['login-form', 'username', 'password', 'login-submit', 'login-status'].map(k => [k, {
    value: '', textContent: '', hidden: false, addEventListener(_, fn) { this.submit = fn; },
  }]));
  const calls = [], redirects = [];
  const win = { location: { href: `https://example.test/public/${path}`, replace: url => redirects.push(url) } };
  win.top = win;
  const context = vm.createContext({ sessionStorage: store, URL, window: win,
    config: { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' },
    fetch: async (url, options) => { calls.push({ url, ...options }); return reply(); },
    document: { querySelector: s => elements[s.slice(1)] },
    authenticate: async () => [{ ...session, password_hash: 'must not persist' }],
    onSuccess() {},
  });
  vm.runInContext(`${source}\nmountLogin({ document, authenticate, onSuccess });`, context);
  return { calls, redirects, elements, run: code => vm.runInContext(code, context),
    login: async () => {
      elements.username.value = 'testplayer'; elements.password.value = 'test-password';
      await elements['login-form'].submit({ preventDefault() {} });
    } };
}
(async () => {
  const store = storage();
  const original = page(store);
  await original.login();
  assert.deepEqual(JSON.parse(store.getItem(key)), session);
  assert.equal(original.elements.password.value, '');
  for (const path of ['index.html', 'character.html?character_id=' + id, 'index.html', 'game.html', 'game.html']) {
    const restored = page(store, undefined, path);
    assert.equal(restored.run('getCurrentUser()'), null, 'fresh module trusts no cached identity');
    assert.equal((await restored.run('restoreSession()')).session_token, session.session_token);
    assert.equal(restored.calls.length, 1);
    const request = restored.calls[0];
    assert.ok(request.url.endsWith('/rpc/validate_session'));
    assert.equal(request.method, 'POST');
    assert.equal(request.cache, 'no-store');
    assert.equal(request.credentials, 'omit');
    assert.deepEqual(JSON.parse(request.body), { p_session_token: session.session_token });
    await restored.run('restoreSession()');
    assert.equal(restored.calls.length, 1, 'deduplicates initialization');
  }
  let complete;
  const waiting = page(store, () => new Promise(resolve => { complete = resolve; }));
  const a = waiting.run('restoreSession()'), b = waiting.run('restoreSession()');
  assert.equal(waiting.run('getCurrentUser()'), null);
  assert.equal(waiting.calls.length, 1);
  waiting.run('logout()');
  complete({ ok: true, json: async () => [{ user_id: id, role: 'player' }] });
  assert.equal(await a, null); assert.equal(await b, null);
  assert.equal(store.getItem(key), null);
  assert.equal(waiting.run('getCurrentUser()'), null);
  assert.deepEqual(waiting.redirects, ['https://example.test/public/index.html']);
  const signedOut = page(store); assert.equal(await signedOut.run('restoreSession()'), null);
  assert.equal(signedOut.calls.length, 0);
  for (const cached of ['bad json', '{}', JSON.stringify({ ...session, session_token: 'bad' })]) {
    store.setItem(key, cached);
    const invalid = page(store);
    assert.equal(await invalid.run('restoreSession()'), null);
    assert.equal(store.getItem(key), null); assert.equal(invalid.calls.length, 0);
  }
  for (const response of [
    { ok: false, status: 401, json: async () => ({ code: '42501' }) },
    { ok: false, status: 403, json: async () => ({ code: '42501' }) },
    { ok: true, json: async () => [] },
    { ok: true, json: async () => [{ user_id: 'different-user', role: 'player' }] },
  ]) {
    store.setItem(key, JSON.stringify(session));
    const expired = page(store, async () => response);
    assert.equal(await expired.run('restoreSession()'), null);
    assert.equal(expired.run('getCurrentUser()'), null);
    assert.equal(store.getItem(key), null);
  }
  for (const reply of [
    async () => { throw new Error('offline'); },
    async () => ({ ok: false, status: 500, json: async () => ({ code: 'server' }) }),
    async () => ({ ok: false, status: 401, json: async () => ({ code: 'invalid_api_key' }) }),
    async () => ({ ok: true, json: async () => ({ malformed: true }) }),
  ]) {
    store.setItem(key, JSON.stringify(session));
    const offline = page(store, reply);
    await assert.rejects(offline.run('restoreSession()'));
    assert.equal(offline.run('getCurrentUser()'), null);
    assert.deepEqual(JSON.parse(store.getItem(key)), session, 'transient failure preserves stored token');
  }
  store.setItem(key, JSON.stringify({ ...session, role: 'leader' }));
  const tampered = page(store);
  assert.equal((await tampered.run('restoreSession()')).role, 'player', 'role comes from server');
  await tampered.run('handleSessionFailure({ status: 403 })');
  assert.equal(tampered.redirects.length, 0, 'operation denied does not imply expired session');
  const expiredOperation = page(store, async () => ({ ok: false, status: 401, json: async () => ({ code: '42501' }) }));
  await expiredOperation.run('handleSessionFailure({ status: 403 })');
  assert.equal(store.getItem(key), null); assert.equal(expiredOperation.redirects.length, 1);
  console.log('PASS: storage allowlist, refresh/navigation, server validation, expiry, logout race, malformed storage and transient failures');
})().catch(error => { console.error(error); process.exitCode = 1; });
