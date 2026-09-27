const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/token-api.js', 'utf8')
  .replace("import { getCurrentUser } from './login.js';", '')
  .replace("import { handleSessionFailure } from './login.js';", '')
  .replace("await import('./config.local.js')", 'config')
  .replaceAll('export ', '');
function api(role, response = [{ x: 150, y: 250 }], ok = true) {
  const requests = [];
  const context = vm.createContext({
    handleSessionFailure: async () => {},
    getCurrentUser: () => role ? { role, session_token: 'session-only-in-body' } : null,
    config: { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' },
    fetch: async (url, options) => {
      requests.push({ url, ...options, payload: JSON.parse(options.body) });
      return { ok, status: 403, json: async () => response };
    },
  });
  vm.runInContext(source, context);
  return { requests, run: text => vm.runInContext(text, context) };
}
(async () => {
  for (const role of ['leader', 'player']) {
    const client = api(role);
    await client.run("loadGameTokens('test-map')");
    assert.ok(client.requests[0].url.endsWith(role === 'leader' ? '/leader_player_tokens' : '/player_token'));
    assert.deepEqual(client.requests[0].payload, { p_session_token: 'session-only-in-body', p_map_id: 'test-map' });
    for (const [action, name] of [['add', 'add_token'], ['move', 'set_token_position'], ['remove', 'remove_token']]) {
      await client.run(`mutateGameToken('${action}', 'character-a', 'test-map', {x:150,y:250})`);
      const request = client.requests.at(-1);
      assert.ok(request.url.endsWith(`/rpc/${name}`));
      assert.equal(request.method, 'POST');
      assert.equal(request.cache, 'no-store');
      assert.equal(request.credentials, 'omit');
      assert.equal(request.url.includes('session-only-in-body'), false);
      assert.deepEqual(request.payload, { p_character_id: 'character-a', p_map_id: 'test-map',
        ...(action === 'remove' ? {} : { p_x: 150, p_y: 250 }), p_session_token: 'session-only-in-body' });
    }
  }
  for (const role of [null, 'admin']) {
    const denied = api(role);
    await assert.rejects(denied.run("mutateGameToken('move','a','test-map',{x:1,y:2})"));
    assert.equal(denied.requests.length, 0);
  }
  for (const result of [[], {}, [{ x: '1', y: 2 }], [{ x: 1, y: null }]]) {
    await assert.rejects(api('leader', result).run("mutateGameToken('add','a','test-map',{x:1,y:2})"));
  }
  await assert.rejects(api('player', [], false).run("mutateGameToken('move','foreign','test-map',{x:1,y:2})"));
  for (const role of ['leader', 'player']) {
    const client = api(role, []);
    await client.run("loadNpcs('test-map')");
    assert.ok(client.requests[0].url.endsWith('/rpc/map_npcs'));
    assert.deepEqual(client.requests[0].payload, { p_map_id: 'test-map', p_session_token: 'session-only-in-body' });
    for (const [action, operation] of [['create', 'leader_create_npc'], ['delete', 'leader_delete_npc'],
      ['add', 'leader_add_npc_to_map'], ['move', 'leader_set_npc_position'],
      ['visibility', 'leader_set_npc_visibility'], ['remove', 'leader_remove_npc_from_map']]) {
      if (role === 'player') {
        assert.throws(() => client.run(`mutateNpc('${action}', {p_npc_id:'npc'})`));
        assert.equal(client.requests.length, 1);
      } else {
        await client.run(`mutateNpc('${action}', {p_npc_id:'npc'})`);
        assert.ok(client.requests.at(-1).url.endsWith(`/rpc/${operation}`));
        assert.equal(client.requests.at(-1).payload.p_session_token, 'session-only-in-body');
      }
    }
  }
  console.log('PASS: session RPC reads/writes, no token in URL, rejected responses and absent session');
})().catch(error => { console.error(error); process.exitCode = 1; });
