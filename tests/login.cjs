const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/login.js', 'utf8').replaceAll('export ', '');
const id = '12345678-1234-4321-9876-123456789abc';
const token = 'a1'.repeat(32);
function page(authenticate) {
  const elements = Object.fromEntries(['login-form', 'username', 'password', 'login-submit', 'login-status']
    .map(name => [name, { value: '', textContent: '', hidden: false, addEventListener(_, fn) { this.submit = fn; } }]));
  let accepted;
  const context = vm.createContext({ document: { querySelector: s => elements[s.slice(1)] }, authenticate,
    onSuccess: user => { accepted = user; } });
  vm.runInContext(`${source}\nmountLogin({ document, authenticate, onSuccess });`, context);
  return { elements, user: () => vm.runInContext('getCurrentUser()', context), accepted: () => accepted,
    submit: () => elements['login-form'].submit({ preventDefault() {} }) };
}
(async () => {
  for (const role of ['player', 'leader']) {
    const p = page(async (username, password) => {
      assert.equal(username, 'alice'); assert.equal(password, 'secret');
      return [{ user_id: id, role, character_id: role === 'player' ? id : null, session_token: token, ignored: 'not retained' }];
    });
    assert.equal(p.user(), null);
    p.elements.username.value = 'alice'; p.elements.password.value = 'secret';
    await p.submit();
    assert.equal(p.user().role, role);
    assert.deepEqual(Object.keys(p.user()), ['user_id', 'role', 'character_id', 'session_token']);
    assert.equal(p.user().session_token, token);
    assert.equal(p.elements.password.value, '');
    assert.equal(p.elements['login-form'].hidden, true);
    assert.equal(p.accepted(), p.user());
    assert.equal(page(async () => []).user(), null, 'reload starts without identity');
  }
  for (const username of ['existing-user', 'missing-user']) {
    const p = page(async () => []);
    p.elements.username.value = username; p.elements.password.value = 'wrong';
    await p.submit();
    assert.equal(p.user(), null);
    assert.equal(p.elements['login-status'].textContent, 'Nesprávné přihlašovací údaje');
    assert.equal(p.elements.password.value, '');
    assert.equal(p.elements['login-form'].hidden, false);
  }
  const invalid = page(async () => [{ user_id: id, role: 'admin', character_id: null }]);
  await invalid.submit(); assert.equal(invalid.user(), null);
  for (const session_token of [undefined, null, '', 'bad', 'a'.repeat(63), 'g'.repeat(64), 123]) {
    const p = page(async () => [{ user_id: id, role: 'player', character_id: null, session_token }]);
    await p.submit();
    assert.equal(p.user(), null, 'missing or malformed session fails closed');
    assert.equal(p.elements['login-form'].hidden, false);
  }
  let finish; let calls = 0;
  const pending = page(() => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const first = pending.submit(); await pending.submit();
  assert.equal(calls, 1); assert.equal(pending.elements['login-submit'].disabled, true);
  finish([]); await first;
  const failed = page(async () => { throw new Error('backend detail'); });
  failed.elements.password.value = 'secret'; await failed.submit();
  assert.equal(failed.user(), null); assert.equal(failed.elements.password.value, '');
  assert.equal(failed.elements['login-submit'].disabled, false);
  assert.ok(!failed.elements['login-status'].textContent.includes('backend detail'));
  console.log('PASS: roles, rejection, response allowlist, reload, cleared passwords, duplicate submit and network failure');
})().catch(error => { console.error(error); process.exitCode = 1; });
