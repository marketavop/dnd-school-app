const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const handler = import(pathToFileURL(path.resolve('supabase/functions/portrait-image-url/handler.mjs')));
const id = '71000000-0000-0000-0000-000000000001';
const token = 'a'.repeat(64);
const characterPath = `characters/${id}/71000000-0000-0000-0000-000000000031.png`;
const npcPath = `npcs/${id}/71000000-0000-0000-0000-000000000031.webp`;
const signedUrl = 'https://example.test/storage/v1/object/sign/portraits/image?token=signed-test';
function request(body = { entity_type: 'character', entity_id: id }, options = {}) {
  const headers = { 'content-type': 'application/json', ...options.headers };
  if (options.session !== null) headers['x-session-token'] = options.session ?? token;
  return new Request('https://example.test/portrait-image-url', {
    method: 'POST', headers, body: options.raw ?? JSON.stringify(body),
  });
}
function backend(options = {}) {
  const calls = [];
  // No table access, upload, remove or other RPCs exist on this test client.
  const db = {
    rpc: async (name, args) => {
      calls.push(['rpc', name, args]); assert.equal(name, 'portrait_reference');
      if (options.rpcThrows) throw Error(`private detail ${token}`);
      if (options.rpcError) return { error: { code: options.rpcError, message: token, details: signedUrl } };
      return { data: Object.hasOwn(options, 'rows') ? options.rows : [{ object_path: characterPath }] };
    },
    storage: { from: bucket => {
      calls.push(['bucket', bucket]);
      return { createSignedUrl: async (objectPath, ttl) => {
        calls.push(['sign', objectPath, ttl]);
        if (options.storageThrows) throw Error(`private detail ${token}`);
        if (options.storageError) return { error: { message: token, details: signedUrl } };
        return { data: Object.hasOwn(options, 'signed') ? options.signed : { signedUrl } };
      } };
    } },
  };
  return { calls, run: async req => (await handler).handlePortraitImageUrl(req, async () => {
    calls.push(['client']);
    if (options.clientThrows) throw Error('private client config');
    return options.noConfig ? null : db;
  }) };
}
async function responseIs(response, status, body) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  const result = await response.json();
  if (body) assert.deepEqual(result, body);
  return result;
}

test('OPTIONS allows only the established POST/OPTIONS and browser headers', async () => {
  const b = backend(), r = await b.run(new Request('https://example.test', { method: 'OPTIONS' }));
  assert.equal(r.status, 204); assert.equal(await r.text(), '');
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.equal(r.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assert.equal(r.headers.get('access-control-allow-headers'), 'authorization, x-client-info, apikey, content-type, x-session-token');
  assert.equal(r.headers.get('cache-control'), 'no-store'); assert.deepEqual(b.calls, []);
});
test('other methods rejected before client creation', async () => {
  for (const method of ['GET','PUT','PATCH','DELETE']) {
    const b = backend(); await responseIs(await b.run(new Request('https://example.test', { method })),405);
    assert.deepEqual(b.calls,[]);
  }
});
test('malformed JSON returns 400', async () => {
  const b=backend(); await responseIs(await b.run(request(undefined,{raw:'{'})),400); assert.deepEqual(b.calls,[]);
});
test('invalid/missing entity and map parameters rejected', async () => {
  for (const body of [null,[],1,{}, {entity_type:'npc'}, {entity_id:id},
    {entity_type:'other',entity_id:id}, {entity_type:'character',entity_id:'invalid'},
    {entity_type:'character',entity_id:id+'\n'}, {entity_type:'character',entity_id:1},
    ...['', ' ', 1, [], {}].map(map_id=>({entity_type:'character',entity_id:id,map_id}))]) {
    const b=backend(); await responseIs(await b.run(request(body)),400); assert.deepEqual(b.calls,[]);
  }
});
test('only x-session-token accepted, not body or Authorization', async () => {
  for (const session of [null,'','invalid']) {
    const b=backend();
    await responseIs(await b.run(request({entity_type:'character',entity_id:id,session_token:token},
      {session,headers:{authorization:`Bearer ${token}`}})),403);
    assert.deepEqual(b.calls,[]);
  }
});
test('RPC 42501 maps to 403 and cannot reach Storage', async () => {
  const b=backend({rpcError:'42501'}); await responseIs(await b.run(request()),403,{error:'Unauthorized'});
  assert.deepEqual(b.calls.map(c=>c[0]),['client','rpc']);
});
test('RPC 22023 maps to 400 and cannot reach Storage', async () => {
  const b=backend({rpcError:'22023'}); await responseIs(await b.run(request()),400,{error:'Invalid portrait request'});
  assert.deepEqual(b.calls.map(c=>c[0]),['client','rpc']);
});
test('exact RPC arguments; omitted, null and explicit map_id', async () => {
  for (const extra of [{},{map_id:null},{map_id:'test-map'}]) {
    const b=backend(); await responseIs(await b.run(request({entity_type:'character',entity_id:id,...extra})),200);
    assert.deepEqual(b.calls[1],['rpc','portrait_reference',{
      p_session_token:token,p_entity_type:'character',p_entity_id:id,p_for_write:false,p_map_id:extra.map_id??null,
    }]);
  }
});
test('NULL reference returns 200 without even selecting Storage bucket', async () => {
  const b=backend({rows:[{object_path:null}]}); await responseIs(await b.run(request()),200,{signed_url:null});
  assert.deepEqual(b.calls.map(c=>c[0]),['client','rpc']);
});
test('character path is signed unchanged in portraits for exactly 3600 seconds', async () => {
  const b=backend(); await responseIs(await b.run(request()),200,{signed_url:signedUrl});
  assert.deepEqual(b.calls.slice(2),[['bucket','portraits'],['sign',characterPath,3600]]);
});
test('NPC definition path is signed unchanged', async () => {
  const b=backend({rows:[{object_path:npcPath}]});
  await responseIs(await b.run(request({entity_type:'npc',entity_id:id,map_id:'test-map'})),200,{signed_url:signedUrl});
  assert.equal(b.calls[1][2].p_entity_type,'npc');
  assert.deepEqual(b.calls.slice(2),[['bucket','portraits'],['sign',npcPath,3600]]);
});
test('client cannot override path, bucket, TTL, session or read-only RPC flag', async () => {
  const b=backend(); await responseIs(await b.run(request({entity_type:'character',entity_id:id,
    object_path:'attacker.png',bucket:'maps',ttl:999999,expiresIn:999999,p_for_write:true,for_write:true,
    p_session_token:'attacker',p_entity_id:'attacker',p_map_id:'attacker'})),200,{signed_url:signedUrl});
  assert.deepEqual(b.calls[1][2],{p_session_token:token,p_entity_type:'character',p_entity_id:id,p_for_write:false,p_map_id:null});
  assert.deepEqual(b.calls.slice(2),[['bucket','portraits'],['sign',characterPath,3600]]);
});
test('missing server configuration returns 503', async () => {
  const b=backend({noConfig:true}); await responseIs(await b.run(request()),503,{error:'Portrait service unavailable'});
  assert.deepEqual(b.calls,[['client']]);
});
test('unexpected RPC failures are safe 502 responses with no Storage call', async () => {
  for (const options of [{rpcError:'XX000'},{rpcThrows:true},{clientThrows:true}]) {
    const b=backend(options); await responseIs(await b.run(request()),502,{error:'Portrait image unavailable'});
    assert.ok(b.calls.every(c=>['client','rpc'].includes(c[0])));
  }
});
test('unexpected RPC row count or malformed reference fails closed', async () => {
  for (const rows of [undefined,null,{},[],[{object_path:null},{object_path:null}],[null],[{}],
    [{object_path:4}],[{object_path:''}],[{object_path:' '}]]) {
    const b=backend({rows}); await responseIs(await b.run(request()),502,{error:'Portrait image unavailable'});
    assert.deepEqual(b.calls.map(c=>c[0]),['client','rpc']);
  }
});
test('Storage signing errors do not expose backend details', async () => {
  for (const options of [{storageError:true},{storageThrows:true}]) {
    const b=backend(options); await responseIs(await b.run(request()),502,{error:'Portrait image unavailable'});
    assert.equal(b.calls.at(-1)[0],'sign');
  }
});
test('missing/invalid signedUrl produces safe 502', async () => {
  for (const signed of [undefined,null,{}, {signedUrl:null},{signedUrl:1},{signedUrl:''},{signedUrl:' '}]) {
    const b=backend({signed}); await responseIs(await b.run(request()),502,{error:'Portrait image unavailable'});
  }
});
