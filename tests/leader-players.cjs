const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/leader-players.js', 'utf8')
  .replace("import { getCurrentUser } from './login.js';", '')
  .replace("import { handleSessionFailure } from './login.js';", '')
  .replace("import { showAdminView, navigateAdminView } from './admin-view.js';", `function showAdminView(document, view) { document.querySelector('#leader-content').hidden = view !== 'home'; document.querySelector('#leader-players').hidden = view !== 'players'; document.querySelector('#leader-maps').hidden = view !== 'maps'; } function navigateAdminView(window, view) { const url = new URL(window.location.href); if (view === 'home') url.searchParams.delete('view'); else url.searchParams.set('view', view); url.hash = ''; window.history.pushState(null, '', url.href); }`)
  .replace("import { CHARACTER_SECTIONS } from './character-sections.js';", fs.readFileSync('public/character-sections.js', 'utf8').replace('export const', 'const'))
  .replace("await import('./config.local.js')", 'getConfig()')
  .replace('export function', 'function');
const id = '12345678-1234-4321-9876-123456789abc';
function element() {
  return { hidden: true, children: [], handlers: {}, textContent: '', attrs: {}, style: {}, dataset: {},
    getBoundingClientRect() { return { height: Number.parseFloat(this.style.height) || 1 }; },
    classList: { add() {}, remove() {} },
    addEventListener(type, fn) { this.handlers[type] = fn; },
    append(...children) { this.children.push(...children); },
    replaceChildren() { this.children = []; },
    setAttribute(key, value) { this.attrs[key] = value; this[key] = value; },
    removeAttribute(key) { delete this[key]; },
  };
}
function page(role = 'leader', responses = [[{ character_id: id, name: '<img src=x>' }]]) {
  const els = Object.fromEntries(['#leader-content', '#leader-players', '#leader-maps', '#players-list', '#players-status',
    '#character-visibility-controls', '#character-visibility-status', '#leader-sheet', 'main', '#leader-players-link', '#players-back'].map(key => [key, element()]));
  responses = [[{ section_id: 'abilities', is_visible: true }, { section_id: 'skills', is_visible: false }, { section_id: 'features', is_visible: false }], ...responses];
  const requests = [];
  const window = { location: { href: 'https://example.test/index.html', origin: 'https://example.test' }, history: { pushState(_, __, href) { window.location.href = href; } } };
  const observers = [];
  const context = vm.createContext({ window, URL, encodeURIComponent,
    ResizeObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe(target) { this.target = target; } disconnect() {} },
    handleSessionFailure: async () => {},
    getCurrentUser: () => role ? { role, session_token: 'ab'.repeat(32) } : null,
    document: { querySelector: key => els[key], createElement: () => element(), createTextNode: text => ({ textContent: text }) },
    getConfig: () => ({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }),
    fetch: async (url, options) => {
      requests.push({ url, ...options, payload: JSON.parse(options.body) });
      const result = responses.shift();
      if (result instanceof Error) throw result;
      return { ok: result !== false, json: async () => await result };
    },
  });
  vm.runInContext(source, context);
  return { els, requests, window, observers,
    open: () => els['#leader-players-link'].handlers.click({ preventDefault() {} }),
    back: () => els['#players-back'].handlers.click() };
}
function setSheetDocument(p, url, height = 240) {
  const content = { getBoundingClientRect: () => ({ bottom: height }) };
  p.els['#leader-sheet'].contentDocument = {
    URL: url,
    body: {},
    documentElement: { scrollHeight: height },
    querySelector: selector => selector === 'main' ? content : null,
  };
  p.els['#leader-sheet'].contentWindow = { scrollY: 0, getComputedStyle: () => ({ marginBottom: '0px' }) };
}
(async () => {
  for (const [parentPath, loadedPath, accepted] of [
    ['/public/index.html', '/public/character.html', true],
    ['/index.html', '/character.html', true],
    ['/index.html', '/character', true],
    ['/public/index.html', '/character', false],
  ]) {
    const local = page();
    local.window.location.href = 'https://example.test' + parentPath;
    await local.open();
    local.els['#players-list'].children[0].children[0].handlers.click();
    setSheetDocument(local, `https://example.test${loadedPath}?mode=leader&character_id=${id}`);
    local.els['#leader-sheet'].handlers.load();
    assert.equal(local.els['#leader-sheet'].hidden, !accepted, `${parentPath} -> ${loadedPath}`);
    if (accepted) assert.equal(local.els['#leader-sheet'].style.height, '240px');
    else assert.equal(local.observers.length, 0, 'rejected document is not measured');
  }
  const p = page('leader', [[{ character_id: id, name: '<img src=x>', username: 'alice' }], [{ id, name: 'Test Postava' }]]);
  await p.open();
  assert.equal(new URL(p.window.location.href).searchParams.get('view'), 'players');
  assert.equal(p.els['#leader-content'].hidden, true);
  assert.equal(p.els['#leader-players'].hidden, false);
  assert.equal(p.requests.length, 2);
  assert.equal(p.requests[1].method, 'POST');
  assert.equal(p.requests[1].credentials, 'omit');
  assert.equal(p.requests[1].cache, 'no-store');
  assert.deepEqual(p.requests[1].payload, { p_session_token: 'ab'.repeat(32) });
  assert.ok(p.requests[1].url.endsWith('/rpc/leader_players'));
  assert.equal(p.els['#character-visibility-controls'].children.length, 4);
  const button = p.els['#players-list'].children[0].children[0];
  assert.equal(button.children[0].textContent, '<img src=x>', 'names rendered as text');
  assert.equal(button.children[1].textContent, ' (alice)', 'owner username rendered separately');
  button.handlers.click();
  assert.equal(p.els['#leader-sheet'].src, `./character.html?mode=leader&character_id=${id}`);
  assert.equal(p.els['#leader-sheet'].hidden, true);
  setSheetDocument(p, new URL(p.els['#leader-sheet'].src, p.window.location.href).href);
  p.els['#leader-sheet'].handlers.load();
  assert.equal(p.els['#leader-sheet'].hidden, false);
  assert.equal(p.els['#leader-sheet'].style.height, '240px');
  p.els['#leader-sheet'].contentDocument.querySelector('main').getBoundingClientRect = () => ({ bottom: 375 });
  p.observers.at(-1).callback();
  assert.equal(p.els['#leader-sheet'].style.height, '375px', 'height follows content changes');
  assert.equal((await p.window.loadLeaderCharacter(id)).name, 'Test Postava');
  assert.ok(p.requests[2].url.endsWith('/rpc/leader_character'));
  assert.deepEqual(p.requests[2].payload, { p_character_id: id, p_session_token: 'ab'.repeat(32) });
  p.back();
  assert.equal(new URL(p.window.location.href).searchParams.get('view'), null);
  assert.equal(p.els['#leader-players'].hidden, true);
  assert.equal(p.els['#leader-sheet'].src, undefined);
  await assert.rejects(p.window.loadLeaderCharacter(id));

  const idB = '22345678-1234-4321-9876-123456789abc';
  const switched = page('leader', [[
    { character_id: id, name: 'A' }, { character_id: idB, name: 'B' },
  ]]);
  await switched.open();
  const [buttonA, buttonB] = switched.els['#players-list'].children.map(item => item.children[0]);
  buttonA.handlers.click();
  const urlA = new URL(switched.els['#leader-sheet'].src, switched.window.location.href);
  setSheetDocument(switched, `https://example.test/character?${urlA.searchParams}`);
  switched.els['#leader-sheet'].handlers.load();
  assert.equal(switched.els['#leader-sheet'].hidden, false, 'Cloudflare path normalization is accepted');
  switched.els['#leader-sheet'].hidden = true;
  buttonB.handlers.click();
  switched.els['#leader-sheet'].handlers.load();
  assert.equal(switched.els['#leader-sheet'].hidden, true, 'late document for previous character is rejected');
  const urlB = new URL(switched.els['#leader-sheet'].src, switched.window.location.href);
  for (const badUrl of [
    `https://other.test/character?${urlB.searchParams}`,
    `https://example.test/other?${urlB.searchParams}`,
    `https://example.test/character?mode=player&character_id=${idB}`,
    `https://example.test/character?mode=leader&character_id=${id}`,
  ]) {
    setSheetDocument(switched, badUrl);
    switched.els['#leader-sheet'].handlers.load();
    assert.equal(switched.els['#leader-sheet'].hidden, true, `rejects unexpected document ${badUrl}`);
  }
  setSheetDocument(switched, `https://example.test/character?${urlB.searchParams}`, 310);
  switched.els['#leader-sheet'].handlers.load();
  assert.equal(switched.els['#leader-sheet'].hidden, false, 'newly selected character is revealed');
  assert.equal(switched.els['#leader-sheet'].style.height, '310px');
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
