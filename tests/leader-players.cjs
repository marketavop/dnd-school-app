const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/leader-players.js', 'utf8')
  .replace("import { getCurrentUser } from './login.js';", '')
  .replace("import { handleSessionFailure } from './login.js';", '')
  .replace("await import('./config.local.js')", 'getConfig()')
  .replace('export function', 'function');
const id = '12345678-1234-4321-9876-123456789abc';
function element() {
  return { hidden: true, children: [], handlers: {}, textContent: '', attrs: {},
    classList: { add() {}, remove() {} },
    addEventListener(type, fn) { this.handlers[type] = fn; },
    append(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    removeAttribute(key) { delete this[key]; },
  };
}
function page(role = 'leader', responses = [[{ character_id: id, name: '<img src=x>' }]]) {
  const els = Object.fromEntries(['#leader-content', '#leader-players', '#players-list', '#players-status',
    '#leader-sheet', 'main', '#leader-players-link', '#players-back'].map(key => [key, element()]));
  const requests = [];
  const window = {};
  const context = vm.createContext({ window, encodeURIComponent,
    handleSessionFailure: async () => {},
    getCurrentUser: () => role ? { role, session_token: 'ab'.repeat(32) } : null,
    document: { querySelector: key => els[key], createElement: () => element() },
    getConfig: () => ({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }),
    fetch: async (url, options) => {
      requests.push({ url, ...options, payload: JSON.parse(options.body) });
      const result = responses.shift();
      if (result instanceof Error) throw result;
      return { ok: result !== false, json: async () => await result };
    },
  });
  vm.runInContext(source, context);
  return { els, requests, window,
    open: () => els['#leader-players-link'].handlers.click({ preventDefault() {} }),
    back: () => els['#players-back'].handlers.click() };
}
(async () => {
  const p = page('leader', [[{ character_id: id, name: '<img src=x>' }], [{ id, name: 'Test Postava' }]]);
  await p.open();
  assert.equal(p.els['#leader-content'].hidden, true);
  assert.equal(p.els['#leader-players'].hidden, false);
  assert.equal(p.requests.length, 1);
  assert.equal(p.requests[0].method, 'POST');
  assert.equal(p.requests[0].credentials, 'omit');
  assert.equal(p.requests[0].cache, 'no-store');
  assert.deepEqual(p.requests[0].payload, { p_session_token: 'ab'.repeat(32) });
  assert.ok(p.requests[0].url.endsWith('/rpc/leader_players'));
  const button = p.els['#players-list'].children[0].children[0];
  assert.equal(button.textContent, '<img src=x>', 'names rendered as text');
  button.handlers.click();
  assert.equal(p.els['#leader-sheet'].src, `./character.html?mode=leader&character_id=${id}`);
  assert.equal(p.els['#leader-sheet'].hidden, false);
  assert.equal((await p.window.loadLeaderCharacter(id)).name, 'Test Postava');
  assert.ok(p.requests[1].url.endsWith('/rpc/leader_character'));
  assert.deepEqual(p.requests[1].payload, { p_character_id: id, p_session_token: 'ab'.repeat(32) });
  p.back();
  assert.equal(p.els['#leader-players'].hidden, true);
  assert.equal(p.els['#leader-sheet'].src, undefined);
  await assert.rejects(p.window.loadLeaderCharacter(id));
  for (const role of ['player', null, 'admin']) {
    const denied = page(role);
    await denied.open();
    await assert.rejects(denied.window.loadLeaderCharacter(id));
    assert.equal(denied.requests.length, 0);
  }
  const empty = page('leader', [[]]); await empty.open();
  assert.match(empty.els['#players-status'].textContent, /žádné/);
  for (const response of [false, new Error('network'), {}, [{ character_id: 'invalid' }]]) {
    const failed = page('leader', [response]); await failed.open();
    assert.match(failed.els['#players-status'].textContent, /nepodařilo/);
    assert.equal(failed.els['#players-list'].children.length, 0);
    assert.equal(failed.els['#leader-sheet'].hidden, true);
  }
  let complete;
  const stale = page('leader', [new Promise(resolve => { complete = resolve; })]);
  const request = stale.open(); stale.back(); complete([{ character_id: id, name: 'late' }]);
  await request;
  assert.equal(stale.els['#players-list'].children.length, 0);
  assert.equal(stale.els['#leader-players'].hidden, true);
  const reload = page(null);
  await reload.open();
  assert.equal(reload.requests.length, 0);
  assert.equal(reload.els['#leader-sheet'].src, undefined);
  console.log('PASS: leader list/detail POSTs, existing sheet, text safety, no token in URL, denied roles, empty/error/stale states');
})().catch(error => { console.error(error); process.exitCode = 1; });
