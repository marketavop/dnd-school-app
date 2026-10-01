const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/portrait-api.js', 'utf8')
  .replace(/^import .*;$/gm, '').replaceAll('export ', '');
let user = { session_token: 'session-one' }, result = { signed_url: 'https://example.test/signed' };
let status = 200, networkError = false;
const calls = [], failures = [];
const context = vm.createContext({
  FormData, getCurrentUser: () => user,
  handleSessionFailure: async response => failures.push(response.status),
  SUPABASE_URL: 'https://project.test', SUPABASE_PUBLISHABLE_KEY: 'publishable',
  fetch: async (url, options) => {
    calls.push({ url, ...options });
    if (networkError) throw new Error('secret backend detail');
    return { ok: status === 200, status, json: async () => result };
  },
});
vm.runInContext(source, context);
(async () => {
  assert.equal(await context.portraitImageUrl('id'), result.signed_url);
  let call = calls.at(-1);
  assert.equal(call.url, 'https://project.test/functions/v1/portrait-image-url');
  assert.deepEqual(JSON.parse(call.body), { entity_type: 'character', entity_id: 'id' });
  assert.equal(call.headers.apikey, 'publishable');
  assert.equal(call.headers['x-session-token'], 'session-one');
  assert.equal(call.headers['Content-Type'], 'application/json');
  assert.equal(call.method, 'POST');
  assert.equal(call.credentials, 'omit');
  assert.equal(call.cache, 'no-store');
  result = { signed_url: null };
  assert.equal(await context.portraitImageUrl('id'), null);
  for (const signed_url of [undefined, 'javascript:alert(1)', '/path']) {
    result = { signed_url };
    await assert.rejects(context.portraitImageUrl('id'));
  }
  user = { session_token: 'session-two' };
  result = { object_path: 'characters/id/new.png', cleanup_pending: true };
  const file = new File(['png'], 'test.png', { type: 'image/png' });
  assert.equal((await context.uploadPortrait('id', file)).cleanup_pending, true);
  call = calls.at(-1);
  assert.equal(call.url, 'https://project.test/functions/v1/portrait-write');
  assert.equal(call.headers['x-session-token'], 'session-two');
  assert.equal(call.headers['Content-Type'], undefined);
  assert.deepEqual([...call.body.keys()], ['action', 'entity_type', 'entity_id', 'file']);
  assert.equal(call.body.get('action'), 'upload');
  assert.equal(call.body.get('entity_type'), 'character');
  assert.equal(call.body.get('entity_id'), 'id');
  assert.equal(call.body.get('file').name, 'test.png');
  const limit = 5 * 1024 * 1024;
  for (const options of [undefined, { entityType: 'npc' }]) {
    const before = calls.length;
    const boundary = new File([new Uint8Array(limit)], 'boundary.png', { type: 'image/png' });
    await context.uploadPortrait('id', boundary, options);
    assert.equal(calls.length, before + 1, 'Exactly 5 MiB passes client size preflight');
    assert.equal(calls.at(-1).body.get('file').size, limit);
    const oversized = new File([new Uint8Array(limit + 1)], 'oversized.png', { type: 'image/png' });
    await assert.rejects(context.uploadPortrait('id', oversized, options), error =>
      error.code === 'FILE_TOO_LARGE' && error.message === 'Obrázek je příliš velký. Maximum je 5 MiB.');
    assert.equal(calls.length, before + 1, 'Oversized file must never fetch');
  }
  result = { object_path: null };
  await context.removePortrait('id');
  assert.deepEqual([...calls.at(-1).body.keys()], ['action', 'entity_type', 'entity_id']);
  assert.equal(calls.at(-1).body.get('action'), 'remove');
  result = { signed_url: 'https://project.test/signed-npc' };
  assert.equal(await context.portraitImageUrl('npc-definition', { entityType: 'npc', mapId: 'mapa-akademie' }), result.signed_url);
  assert.deepEqual(JSON.parse(calls.at(-1).body), {
    entity_type: 'npc', entity_id: 'npc-definition', map_id: 'mapa-akademie',
  });
  await context.portraitImageUrl('npc-definition', { entityType: 'npc' });
  assert.deepEqual(JSON.parse(calls.at(-1).body), { entity_type: 'npc', entity_id: 'npc-definition' });
  result = { object_path: 'npcs/npc-definition/new.png', cleanup_pending: true };
  await context.uploadPortrait('npc-definition', file, { entityType: 'npc' });
  assert.equal(calls.at(-1).body.get('entity_type'), 'npc');
  assert.equal(calls.at(-1).body.get('entity_id'), 'npc-definition');
  assert.equal(calls.at(-1).body.get('action'), 'upload');
  assert.equal(calls.at(-1).body.get('file').name, 'test.png');
  result = { object_path: null };
  await context.removePortrait('npc-definition', { entityType: 'npc' });
  assert.equal(calls.at(-1).body.get('entity_type'), 'npc');
  assert.equal(calls.at(-1).body.get('entity_id'), 'npc-definition');
  assert.equal(calls.at(-1).body.get('action'), 'remove');
  assert.equal(calls.at(-1).body.has('file'), false);
  for (const code of [403, 409, 503]) {
    status = code; result = { error: 'secret', outcome_unknown: code === 503 };
    await assert.rejects(context.removePortrait('id'), e => e.status === code && !e.message.includes('secret') && e.outcome_unknown === (code === 503));
  }
  networkError = true;
  await assert.rejects(context.uploadPortrait('id', file), e => e.outcome_unknown === true);
  networkError = false; status = 200; result = {};
  await assert.rejects(context.removePortrait('id'), e => e.outcome_unknown === true);
  user = null;
  const count = calls.length;
  await assert.rejects(context.portraitImageUrl('id'), e => e.status === 403);
  assert.equal(calls.length, count);
  assert.ok(calls.every(c => c.url.includes('/functions/v1/portrait-')));
  console.log('PASS: portrait API session, signed URL, multipart upload/remove, safe errors and uncertain outcomes');
})().catch(error => { console.error(error); process.exitCode = 1; });
