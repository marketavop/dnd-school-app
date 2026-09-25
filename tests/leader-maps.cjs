const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = (fs.readFileSync('public/leader-map-api.js', 'utf8').replace('export const', 'const').replaceAll('export async function', 'async function') + fs.readFileSync('public/leader-maps.js', 'utf8').replace("import { loadMaps, setActiveMap } from './leader-map-api.js';", '').replace("import { openMapPreparation } from './map-preparation.js';", '').replace("import { getCurrentUser } from './login.js';", ''))
  .replace("import { getCurrentUser } from './login.js';", '')
  .replace("import { handleSessionFailure } from './login.js';", '')
  .replace("await import('./config.local.js')", 'config')
  .replaceAll('export function', 'function');
function page(role = 'leader', result = [
  { map_id: 'test-map', name: '<Test map>', is_active: false },
  { map_id: 'mapa-akademie', name: 'Mapa akademie', is_active: true },
]) {
  const element = () => ({ hidden: true, children: [], handlers: {}, dataset: {},
    addEventListener(type, fn) { this.handlers[type] = fn; },
    click() { return this.handlers.click({ preventDefault() {} }); },
    replaceChildren() { this.children = []; }, append(item) { this.children.push(item); } });
  const els = Object.fromEntries(['leader-content', 'leader-maps', 'maps-list', 'maps-status',
    'leader-maps-link', 'maps-back'].map(id => [id, element()]));
  const requests = [];
  vm.runInNewContext(source, {
    handleSessionFailure: async () => {},
    openMapPreparation() {},
    getCurrentUser: () => role ? { role, session_token: 'test-session' } : null,
    config: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' },
    document: { querySelector: s => els[s.slice(1)], createElement: element },
    console: { error() {} },
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      if (url.endsWith('/leader_set_active_map') && Array.isArray(result)) {
        const id = JSON.parse(options.body).p_map_id;
        result = result.map(row => ({ ...row, is_active: row.map_id === id }));
        return { ok: true, json: async () => [{ active_map_id: id }] };
      }
      if (result instanceof Error) throw result;
      return { ok: result !== false, status: 403, json: async () => result };
    },
  });
  return { els, requests, open: () => els['leader-maps-link'].handlers.click({ preventDefault() {} }),
    back: () => els['maps-back'].handlers.click() };
}
(async () => {
  const p = page(); await p.open();
  assert.equal(p.els['leader-content'].hidden, true);
  assert.equal(p.els['leader-maps'].hidden, false);
  assert.deepEqual(p.els['maps-list'].children.map(x => x.textContent), ['○ <Test map>', '● Mapa akademie — Aktivní']);
  assert.equal(p.requests[0].url, 'https://example.supabase.co/rest/v1/rpc/leader_maps');
  assert.equal(p.requests[0].method, 'POST');
  assert.deepEqual(JSON.parse(p.requests[0].body), { p_session_token: 'test-session' });
  await p.els['maps-list'].children[0].children[0].click();
  assert.equal(p.requests[1].url, 'https://example.supabase.co/rest/v1/rpc/leader_set_active_map');
  assert.deepEqual(JSON.parse(p.requests[1].body), { p_session_token: 'test-session', p_map_id: 'test-map' });
  p.back(); assert.equal(p.els['leader-maps'].hidden, true);
  assert.equal(p.els['maps-list'].children.length, 0);
  for (const role of ['player', null, 'admin']) {
    const denied = page(role); await denied.open(); assert.equal(denied.requests.length, 0);
  }
  for (const response of [false, new Error('network'), {}, [null]]) {
    const failed = page('leader', response); await failed.open();
    assert.match(failed.els['maps-status'].textContent, /nepodařilo/);
    assert.equal(failed.els['maps-list'].children.length, 0);
  }
  const empty = page('leader', []); await empty.open();
  assert.match(empty.els['maps-status'].textContent, /žádné/);
  let resolve;
  const late = page('leader', new Promise(done => { resolve = done; }));
  const pending = late.open(); late.back(); resolve([]); await pending;
  assert.equal(late.els['leader-maps'].hidden, true);
  assert.equal(late.els['maps-status'].textContent, '');
  console.log('PASS: leader maps RPC, active marker, text safety, role guard, errors, empty list, stale response');
})().catch(error => { console.error(error); process.exitCode = 1; });


