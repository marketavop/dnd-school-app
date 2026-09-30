const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { test } = require('node:test');
const modules = Promise.all(['handler', 'image'].map(name => import(pathToFileURL(path.resolve(`supabase/functions/portrait-write/${name}.mjs`)))));
const id = '71000000-0000-0000-0000-000000000001';
const token = 'a'.repeat(64);
const oldPath = `characters/${id}/71000000-0000-0000-0000-000000000031.png`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
// Real 1px JPEG encoded with System.Drawing and a tiny VP8 WebP sample.
const realJpeg = Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8qqKKKAP/2Q==', 'base64');
const realWebp = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
// Header fixtures deliberately isolate container/dimension parsing, not pixel decoding.
function jpeg(w = 1, h = 1) {
  const b = Buffer.from([255,216,255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,8,1,1,0,0,63,0,1,255,217]);
  b.writeUInt16BE(h, 7); b.writeUInt16BE(w, 9); return b;
}
function chunk(kind, data) {
  const b = Buffer.alloc(8 + data.length + data.length % 2); b.write(kind); b.writeUInt32LE(data.length, 4); data.copy(b, 8); return b;
}
function riff(parts) { const b = Buffer.concat([Buffer.from('RIFF0000WEBP'), ...parts]); b.writeUInt32LE(b.length - 8, 4); return b; }
function webp(kind = 'VP8L', w = 1, h = 1, extended = false) {
  const payload = Buffer.alloc(kind === 'VP8L' ? 6 : 11);
  if (kind === 'VP8L') { payload[0] = 47; payload.writeUInt32LE(((h - 1) * 16384 + w - 1) >>> 0, 1); }
  else { Buffer.from([157,1,42]).copy(payload, 3); payload.writeUInt16LE(w, 6); payload.writeUInt16LE(h, 8); }
  const parts = [];
  if (extended) { const x = Buffer.alloc(10); x.writeUIntLE(w - 1, 4, 3); x.writeUIntLE(h - 1, 7, 3); parts.push(chunk('VP8X', x)); }
  parts.push(chunk(kind, payload)); return riff(parts);
}
function request({ action = 'upload', type = 'character', entity = id, bytes = png, mime = 'image/png', name = 'portrait.png', session = token } = {}) {
  const form = new FormData(); form.set('action', action); form.set('entity_type', type); form.set('entity_id', entity);
  if (action === 'upload') form.set('file', new File([bytes], name, { type: mime }));
  return new Request('https://example.test/portrait-write', { method: 'POST', headers: { 'x-session-token': session }, body: form });
}
function backend(options = {}) {
  const events = [], logs = [], state = { path: options.old === undefined ? oldPath : options.old };
  const db = {
    rpc: async (name, args) => {
      events.push([name, args]);
      assert.equal(args.p_session_token, token);
      if (name === 'portrait_reference') {
        assert.equal(args.p_for_write, true);
        if (options.denied) return { error: { code: '42501' } };
        return { data: [{ object_path: state.path }] };
      }
      assert.equal(name, 'portrait_change_reference');
      if (options.conflict) state.path = options.conflict;
      if (options.dbError) return { error: { code: options.dbError } };
      if (state.path !== args.p_expected_path) return { error: { code: '40001' } };
      const previous = state.path; state.path = args.p_new_path;
      if (options.lostReply) throw new Error('Connection lost after commit');
      if (options.malformedReply) return { data: [] };
      return { data: [{ old_path: previous, new_path: state.path }] };
    },
    storage: { from: bucket => {
      assert.equal(bucket, 'portraits');
      return {
        upload: async (p, bytes, config) => { events.push(['upload', p, config]); assert.equal(config.upsert, false); return { error: options.uploadError ? {} : null }; },
        remove: async paths => { events.push(['remove', paths[0]]); if (options.cleanupThrows) throw Error('offline'); return { error: options.cleanupError ? {} : null }; },
      };
    } },
  };
  return { db, events, logs, state, run: async req => (await modules)[0].handlePortraitWrite(req, async () => db, { error: (...args) => logs.push(args) }) };
}

test('CORS and request guards do not touch DB', async () => {
  const b = backend();
  const r = await b.run(new Request('https://example.test', { method: 'OPTIONS' }));
  assert.equal(r.status, 204); assert.match(r.headers.get('access-control-allow-headers'), /x-session-token/);
  assert.equal((await b.run(new Request('https://example.test'))).status, 405);
  assert.equal((await b.run(request({ session: '' }))).status, 403);
  assert.equal((await b.run(request({ entity: '../bad' }))).status, 400);
  assert.equal(b.events.length, 0);
});
test('valid PNG/JPEG/WebP variants upload as unique objects; replace order', async () => {
  const paths = new Set();
  for (const [bytes, mime, name] of [[png,'image/png','p.png'],[jpeg(),'image/jpeg','p.jpeg'],[webp(),'image/webp','p.webp'],[webp('VP8 '),'image/webp','p.webp'],[webp('VP8L',1,1,true),'image/webp','p.webp']]) {
    const b = backend(); const response = await b.run(request({ bytes, mime, name }));
    assert.equal(response.status, 200); const body = await response.json();
    assert.match(body.object_path, new RegExp(`^characters/${id}/[0-9a-f-]{36}\\.(jpg|png|webp)$`));
    assert.notEqual(body.object_path, oldPath); assert.equal(body.cleanup_pending, false); paths.add(body.object_path);
    assert.deepEqual(b.events.map(e => e[0]), ['portrait_reference','upload','portrait_change_reference','remove']);
    assert.equal(b.events[3][1], oldPath); assert.equal(b.state.path, body.object_path);
  }
  assert.equal(paths.size, 5);
});
test('new NPC upload uses NPC path and has no old cleanup', async () => {
  const b = backend({ old: null }); const r = await b.run(request({ type: 'npc' }));
  assert.equal(r.status, 200); assert.ok((await r.json()).object_path.startsWith(`npcs/${id}/`));
  assert.equal(b.events.filter(e => e[0] === 'remove').length, 0);
});
test('real JPEG and WebP samples accepted', async () => {
  for (const [bytes,mime,name] of [[realJpeg,'image/jpeg','p.jpg'],[realWebp,'image/webp','p.webp']]) {
    const b=backend(); assert.equal((await b.run(request({bytes,mime,name}))).status,200);
  }
});
test('exactly 5 MiB accepted with bounded multipart overhead', async () => {
  // A large ancillary chunk exercises the byte boundary without changing dimensions.
  const extra=Buffer.alloc(5*1024*1024-png.length); extra.writeUInt32BE(extra.length-12,0); extra.write('tEXt',4);
  const bytes=Buffer.concat([png.subarray(0,33),extra,png.subarray(33)]);
  const b=backend(); assert.equal((await b.run(request({bytes}))).status,200);
});
test('animated WebP frame bounds checked against canvas', async () => {
  const {inspectImage}=(await modules)[1];
  const x=Buffer.alloc(10); x[0]=2;
  const frame=Buffer.concat([Buffer.alloc(16),webp().subarray(12)]);
  const valid=riff([chunk('VP8X',x),chunk('ANIM',Buffer.alloc(6)),chunk('ANMF',frame)]);
  assert.equal(inspectImage(valid).width,1);
  frame.writeUIntLE(1,0,3);
  assert.throws(()=>inspectImage(riff([chunk('VP8X',x),chunk('ANIM',Buffer.alloc(6)),chunk('ANMF',frame)])));
});
test('signature, MIME, extension, truncation and file limit rejected before Storage', async () => {
  for (const [opts, status] of [
    [{ bytes: Buffer.from('<svg/>') },415], [{ mime:'image/jpeg' },415], [{ name:'p.jpg' },415],
    [{ bytes:png.subarray(0,24) },415], [{ bytes:Buffer.alloc(5*1024*1024+1) },413], [{ bytes:Buffer.alloc(0) },400],
    [{ bytes:Buffer.alloc(6*1024*1024) },413],
  ]) {
    const b = backend(); assert.equal((await b.run(request(opts))).status, status); assert.ok(b.events.every(e => e[0] === 'portrait_reference'));
  }
});
test('dimension limit checks both axes in JPEG, PNG and WebP; 2048 allowed', async () => {
  for (const [w,h,status] of [[2048,2048,200],[2049,1,413],[1,2049,413],[0,1,415]]) {
    const p = Buffer.from(png); p.writeUInt32BE(w,16); p.writeUInt32BE(h,20);
    for (const [bytes,mime,name] of [[p,'image/png','p.png'],[jpeg(w,h),'image/jpeg','p.jpg'], ...(w ? [[webp('VP8L',w,h,true),'image/webp','p.webp']] : [])]) {
      const b=backend(); assert.equal((await b.run(request({bytes,mime,name}))).status,status);
    }
  }
});
test('authorization denial is propagated for character and NPC upload/remove', async () => {
  for (const type of ['character','npc']) for (const action of ['upload','remove']) {
    const b=backend({denied:true}); assert.equal((await b.run(request({type,action}))).status,403);
    assert.deepEqual(b.events.map(e=>e[0]),['portrait_reference']);
  }
});
test('Storage failure never changes DB reference', async () => {
  const b=backend({uploadError:true}); assert.equal((await b.run(request())).status,502);
  assert.equal(b.state.path,oldPath); assert.deepEqual(b.events.map(e=>e[0]),['portrait_reference','upload']);
});
test('conflict retains winning path and removes only the new orphan', async () => {
  for (const action of ['upload','remove']) {
    const winner = oldPath.replace('0031','0032'); const b=backend({conflict:winner});
    assert.equal((await b.run(request({action}))).status,409); assert.equal(b.state.path,winner);
    const removed=b.events.filter(e=>e[0]==='remove');
    assert.equal(removed.length,action==='upload'?1:0);
    if (removed.length) assert.equal(removed[0][1],b.events.find(e=>e[0]==='upload')[1]);
  }
});
test('definitive DB rejection cleans new object; cleanup error is nonfatal', async () => {
  for (const cleanupError of [false,true]) {
    const b=backend({dbError:'23514',cleanupError}); const r=await b.run(request());
    assert.equal(r.status,422); assert.equal((await r.json()).cleanup_pending,cleanupError);
    assert.equal(b.state.path,oldPath); assert.notEqual(b.events.at(-1)[1],oldPath);
  }
});
test('replace/remove cleanup failure does not undo committed reference', async () => {
  for (const action of ['upload','remove']) for (const opts of [{cleanupError:true},{cleanupThrows:true},{}]) {
    const b=backend(opts), r=await b.run(request({action})); assert.equal(r.status,200);
    const body=await r.json(); assert.equal(body.cleanup_pending,Boolean(opts.cleanupError||opts.cleanupThrows));
    assert.equal(body.object_path,b.state.path); if(action==='remove') assert.equal(b.state.path,null);
    assert.equal(b.events.filter(e=>e[0]==='portrait_change_reference').length,1);
    assert.equal(b.events.at(-1)[0],'remove');
  }
});
test('unknown DB result never deletes a possibly committed image', async () => {
  for (const opts of [{lostReply:true},{malformedReply:true},{dbError:'PGRST000'}]) {
    const b=backend(opts), r=await b.run(request()); assert.equal(r.status,503); assert.equal((await r.json()).outcome_unknown,true);
    assert.equal(b.events.filter(e=>e[0]==='remove').length,0); assert.equal(b.logs.length,1);
  }
});
test('unknown remove outcome never deletes the old Storage object', async () => {
  for (const opts of [{lostReply:true},{malformedReply:true},{dbError:'PGRST000'}]) {
    const b=backend(opts), r=await b.run(request({action:'remove'}));
    assert.equal(r.status,503); assert.equal((await r.json()).outcome_unknown,true);
    assert.deepEqual(b.events.map(e=>e[0]),['portrait_reference','portrait_change_reference']);
    assert.equal(b.events[1][1].p_expected_path,oldPath);
    assert.equal(b.events[1][1].p_new_path,null);
    assert.equal(b.state.path,opts.dbError ? oldPath : null);
  }
});
test('PNG rejects a second IHDR, including conflicting dimensions', async () => {
  for (const width of [1,4096]) {
    const ihdr=Buffer.from(png.subarray(8,33)); ihdr.writeUInt32BE(width,8);
    const bytes=Buffer.concat([png.subarray(0,33),ihdr,png.subarray(33)]);
    const b=backend(); assert.equal((await b.run(request({bytes}))).status,415);
    assert.deepEqual(b.events.map(e=>e[0]),['portrait_reference']);
  }
});
test('JPEG rejects conflicting SOF after SOS before any Storage write', async () => {
  const bytes=Buffer.concat([jpeg().subarray(0,-2),jpeg(4096,4096).subarray(2,15),Buffer.from([255,217])]);
  const b=backend(); assert.equal((await b.run(request({bytes,mime:'image/jpeg',name:'p.jpg'}))).status,415);
  assert.deepEqual(b.events.map(e=>e[0]),['portrait_reference']);
});
test('JPEG walks multiple scans, stuffed bytes, restart and fill markers through EOI', async () => {
  const {inspectImage}=(await modules)[1];
  const first=jpeg();
  const bytes=Buffer.concat([
    first.subarray(0,-2), Buffer.from([255,0,255,208,1,255,255,196,0,2]),
    first.subarray(15,-2), Buffer.from([255,0,2,255,215,3,255,255,217]),
  ]);
  assert.equal(inspectImage(bytes).width,1);
  // Same structural traversal for progressive SOF2 with multiple SOS segments.
  const progressive=Buffer.from(bytes); progressive[3]=0xc2;
  assert.equal(inspectImage(progressive).height,1);
});
test('JPEG rejects truncated scans, bad post-scan lengths and premature EOI', async () => {
  const {inspectImage}=(await modules)[1];
  const first=jpeg();
  for (const bytes of [
    first.subarray(0,-1),
    Buffer.concat([first.subarray(0,-2),Buffer.from([255,255,255])]),
    Buffer.concat([first.subarray(0,-2),Buffer.from([255,196,0,1,255,217])]),
    Buffer.concat([first.subarray(0,-2),Buffer.from([255,196,0,20,255,217])]),
    Buffer.concat([first.subarray(0,15),Buffer.from([255,217])]),
    Buffer.concat([first,Buffer.from([0,255,217])]),
    Buffer.concat([first.subarray(0,25),Buffer.from([255,217])]),
  ]) assert.throws(()=>inspectImage(bytes));
});
test('malformed WebP container and misleading extended dimensions rejected', async () => {
  const {inspectImage}= (await modules)[1];
  const mismatch=webp('VP8L',1,1,true); mismatch.writeUIntLE(5,24,3);
  const truncated=webp().subarray(0,22);
  const badSize=webp(); badSize.writeUInt32LE(100,16);
  for (const b of [mismatch,truncated,badSize,Buffer.from('RIFF0000NOTP')]) assert.throws(()=>inspectImage(b));
});
