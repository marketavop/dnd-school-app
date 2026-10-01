const assert = require('node:assert/strict');
(async () => {
  const { handleMapDelete } = await import('../supabase/functions/leader-map-delete/handler.mjs');
  const uuid = '12345678-1234-1234-1234-123456789abc';
  async function run({ path = `maps/${uuid}.png`, error, cleanupError, throws, token = 'leader', method = 'POST', body = { map_id: uuid, image_path: 'maps/attacker.png' } } = {}) {
    const calls = [];
    const response = await handleMapDelete(new Request('https://example.test', {
      method, headers: token ? { 'x-session-token': token } : {},
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
    }), async () => ({
      rpc: async (name, args) => { calls.push({ name, args }); return { data: [{ image_path: path }], error }; },
      storage: { from: bucket => ({ remove: async paths => {
        calls.push({ bucket, paths }); if (throws) throw new Error('timeout'); return { error: cleanupError };
      } }) },
    }));
    return { status: response.status, data: response.status === 204 ? null : await response.json(), calls };
  }
  const ok = await run();
  assert.equal(ok.data.storage_cleanup, 'removed');
  assert.deepEqual(ok.calls, [
    { name: 'leader_delete_map', args: { p_session_token: 'leader', p_map_id: uuid } },
    { bucket: 'maps', paths: [`${uuid}.png`] },
  ]);
  for (const path of ['./assets/maps/test-map.png', 'https://evil.test/image.png', `maps/../${uuid}.png`, `maps/sub/${uuid}.png`, 'other/file.png']) {
    const r = await run({ path }); assert.equal(r.data.storage_cleanup, 'skipped'); assert.equal(r.calls.length, 1);
  }
  for (const [code, status, expected] of [['PT409', 409, 'MAP_ACTIVE'], ['42501', 403, 'UNAUTHORIZED'], ['P0002', 404, 'MAP_NOT_FOUND'], ['XX000', 500, 'DELETE_FAILED']]) {
    const r = await run({ error: { code } }); assert.equal(r.status, status); assert.equal(r.data.code, expected); assert.equal(r.calls.length, 1);
  }
  for (const failure of [{ cleanupError: { message: 'failed' } }, { throws: true }]) {
    const r = await run(failure); assert.equal(r.data.deleted, true); assert.equal(r.data.warning, 'STORAGE_CLEANUP_FAILED');
  }
  assert.equal((await run({ token: '' })).calls.length, 0);
  assert.equal((await run({ body: { map_id: '../bad' } })).status, 400);
  assert.equal((await run({ method: 'GET' })).status, 405);
  assert.equal((await run({ method: 'OPTIONS' })).status, 204);
  console.log('PASS: map delete handler authorization errors, conflict, exact Storage path, local assets, cleanup failures, CORS');
})().catch(error => { console.error(error); process.exitCode = 1; });
