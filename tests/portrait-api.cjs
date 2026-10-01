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
  result = { object_path: null };
  await context.removePortrait('id');
  assert.deepEqual([...calls.at(-1).body.keys()], ['action', 'entity_type', 'entity_id']);
  assert.equal(calls.at(-1).body.get('action'), 'remove');
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
