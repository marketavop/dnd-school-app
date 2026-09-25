const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const login = readFileSync('public/login.js', 'utf8').replaceAll('export ', '');
const roleHome = readFileSync('public/role-home.js', 'utf8')
  .replace("import { getCurrentUser } from './login.js';", '').replaceAll('export ', '');
const id = '12345678-1234-4321-9876-123456789abc';
function page(role, character = id) {
  const elements = Object.fromEntries(['login-form', 'username', 'password', 'login-submit', 'login-status',
    'home-content', 'leader-content', 'role-error', 'diary-link', 'game-link', 'navigation-status',
    'signed-in-status', 'leader-game-link', 'leader-status'].map(name => [name, {
    hidden: ['home-content', 'leader-content', 'role-error'].includes(name), value: '', textContent: '', attrs: {},
    addEventListener(_, callback) { this.submit = callback; },
    set href(value) { this.attrs.href = value; }, get href() { return this.attrs.href; },
    getAttribute(key) { return this.attrs[key] ?? null; },
    setAttribute(key, value) { this.attrs[key] = value; }, removeAttribute(key) { delete this.attrs[key]; },
  }]));
  const document = { querySelector: s => elements[s.slice(1)] };
  const context = vm.createContext({ document, encodeURIComponent,
    authenticate: async () => [{ user_id: id, role, character_id: character, session_token: 'ab'.repeat(32) }] });
  vm.runInContext(`${login}\n${roleHome}\nmountLogin({ document, authenticate, onSuccess: () => showRoleHome(document) });`, context);
  return { elements, context, submit: () => elements['login-form'].submit({ preventDefault() {} }) };
}
(async () => {
  for (const role of ['player', 'leader']) {
    const p = page(role);
    assert.equal(p.elements['home-content'].hidden, true);
    assert.equal(p.elements['leader-content'].hidden, true);
    await p.submit();
    assert.equal(p.elements['login-form'].hidden, true);
    assert.equal(p.elements['home-content'].hidden, role !== 'player');
    assert.equal(p.elements['leader-content'].hidden, role !== 'leader');
    assert.equal(p.elements['role-error'].hidden, true);
    const link = role === 'player' ? 'game-link' : 'leader-game-link';
    assert.equal(p.elements[link].href, role === 'leader' ? '#leader-game' : `./game.html?character_id=${id}`);
    const reload = page(role);
    assert.equal(reload.elements['login-form'].hidden, false);
    assert.equal(reload.elements['home-content'].hidden, true);
    assert.equal(reload.elements['leader-content'].hidden, true);
    assert.equal(vm.runInContext('getCurrentUser()', reload.context), null);
  }
  const noCharacter = page('leader', null);
  await noCharacter.submit();
  assert.equal(noCharacter.elements['leader-game-link'].href, '#leader-game');
  assert.notEqual(noCharacter.elements['leader-game-link'].getAttribute('aria-disabled'), 'true');
  assert.equal(noCharacter.elements['leader-status'].textContent, '');
  const legacy = page('leader', null);
  legacy.elements['game-link'].href = `./game.html?character_id=${id}`;
  await legacy.submit();
  assert.equal(legacy.elements['leader-game-link'].href, '#leader-game');
  const invalid = page('admin');
  await invalid.submit();
  assert.equal(invalid.elements['login-form'].hidden, false);
  assert.equal(invalid.elements['home-content'].hidden, true);
  assert.equal(invalid.elements['leader-content'].hidden, true);
  assert.ok(invalid.elements['login-status'].textContent);
  // Defense in depth: renderer must hide an already-visible view for invalid identity.
  for (const value of ['null', "{ role: 'admin' }", '{ role: undefined }']) {
    invalid.elements['home-content'].hidden = false;
    invalid.elements['leader-content'].hidden = false;
    vm.runInContext(`currentUser = ${value}; showRoleHome(document);`, invalid.context);
    assert.equal(invalid.elements['home-content'].hidden, true);
    assert.equal(invalid.elements['leader-content'].hidden, true);
    assert.equal(invalid.elements['role-error'].hidden, false);
  }
  const html = readFileSync('public/index.html', 'utf8');
  const playerHtml = html.split('<section id="home-content" hidden>')[1].split('</section>')[0];
  const leaderHtml = html.split('<section id="leader-content" hidden>')[1].split('</section>')[0];
  assert.ok(playerHtml.includes('Můj deník'));
  assert.ok(!playerHtml.includes('Hráči') && !playerHtml.includes('Mapy'));
  assert.ok(!leaderHtml.includes('Můj deník'));
  assert.ok(leaderHtml.includes('Hráči') && leaderHtml.includes('Mapy'));
  console.log('PASS: login-to-role UI, isolation, account/legacy character links, missing character, reload and invalid roles');
})().catch(error => { console.error(error); process.exitCode = 1; });

