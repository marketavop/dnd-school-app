const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const { stripTypeScriptTypes } = require('node:module');

// Real 3x2 images encoded by Pillow/libwebp; no image library needed to run tests.
const fixtures = {
  VP8: 'UklGRjgAAABXRUJQVlA4ICwAAADQAQCdASoDAAIAAUAmJaACdLoB+AADsAD+9Ykf/lnz+Gzj3/8guWF1xGAAAA==',
  VP8L: 'UklGRh4AAABXRUJQVlA4TBEAAAAvAkAAAAdQqFKUsf+BiOh/AAA=',
  VP8X: 'UklGRloAAABXRUJQVlA4WAoAAAAQAAAAAgAAAQAAQUxQSAcAAAAAgICAgICAAFZQOCAsAAAA0AEAnQEqAwACAAFAJiWgAnS6AfgAA7AA/vWJH/5Z8/hs49//ILlhdcRgAAA=',
  animated: 'UklGRtwAAABXRUJQVlA4WAoAAAASAAAAAgAAAQAAQU5JTQYAAAAAAAAAAABBTk1GVAAAAAAAAAAAAAIAAAEAAGQAAAJBTFBIBwAAAACAgICAgIAAVlA4ICwAAAAwAQCdASoDAAIAAUAmJaAAA3AA/vWJH//5Z//st/2W7Tv//kGP9DX+Cu7AAEFOTUZUAAAAAAAAAAAAAgAAAQAAZAAAAkFMUEgHAAAAAICAgICAgABWUDggLAAAADABAJ0BKgMAAgABQCYloAADcAD+8Bvf//zBP/f7/v93yf//G8f5Lv7d9lAA',
};
for (const key of Object.keys(fixtures)) fixtures[key] = Buffer.from(fixtures[key], 'base64');
const original = fs.readFileSync('supabase/functions/leader-map-upload/index.ts', 'utf8');
const source = stripTypeScriptTypes(original).replace(
  "await import('https://esm.sh/@supabase/supabase-js@2.57.4')", 'testSdk');

function server() {
  let handler;
  const uploads = [], registrations = [];
  const context = vm.createContext({
    Deno: { serve(fn) { handler = fn; }, env: { get() { return 'test'; } } },
    Response, File, Uint8Array, DataView, TextDecoder, crypto,
    testSdk: { createClient() { return {
      async rpc(name, args) {
        if (name === 'validate_session') return { data: [{ role: 'leader' }] };
        registrations.push(args); return { data: [{ map_id: args.p_map_id }] };
      },
      storage: { from() { return {
        async upload(...args) { uploads.push(args); return {}; }, async remove() {},
      }; } },
    }; } },
  });
  vm.runInContext(source, context);
  return { uploads, registrations,
    dimensions(bytes, type = 'image/webp') { return context.dimensions(bytes, type); },
    async upload(bytes, type = 'image/webp', size) {
      const file = new File([bytes], 'map.webp', { type });
      if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
      const form = new Map([['name', 'Mapa'], ['file', file]]);
      return handler({ method: 'POST', headers: new Headers({ 'x-session-token': 'test' }),
        async formData() { return form; } });
    },
  };
}
function riff(...chunks) {
  const result = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP', 'binary'), ...chunks]);
  result.writeUInt32LE(result.length - 8, 4); return result;
}
function chunk(kind, payload) {
  const header = Buffer.alloc(8); header.write(kind); header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload, Buffer.alloc(payload.length % 2)]);
}
function resized(kind, width, height) {
  const bytes = Buffer.from(fixtures[kind]);
  if (kind === 'VP8') { bytes.writeUInt16LE(width, 26); bytes.writeUInt16LE(height, 28); }
  else if (kind === 'VP8L') bytes.writeUInt32LE((width - 1) + (height - 1) * 16384, 21);
  else {
    bytes.writeUIntLE(width - 1, 24, 3); bytes.writeUIntLE(height - 1, 27, 3);
    const p = bytes.indexOf('VP8 ') + 8;
    bytes.writeUInt16LE(width, p + 6); bytes.writeUInt16LE(height, p + 8);
  }
  return bytes;
}

for (const [kind, bytes] of Object.entries(fixtures)) {
  test(`${kind}: actual server handler accepts WebP and keeps storage/registration flow`, async () => {
    const s = server();
    assert.deepEqual(Array.from(s.dimensions(bytes)), [3, 2]);
    assert.equal((await s.upload(bytes)).status, 201);
    assert.equal(s.uploads.length, 1); assert.equal(s.registrations.length, 1);
    assert.deepEqual(Buffer.from(s.uploads[0][1]), bytes);
    assert.equal(s.uploads[0][2].contentType, 'image/webp');
  });
  test(`${kind}: every truncated prefix is rejected without throwing`, () => {
    const s = server();
    for (let i = 0; i < bytes.length; i++) assert.equal(s.dimensions(bytes.subarray(0, i)), null, `prefix ${i}`);
  });
}
for (const kind of ['VP8', 'VP8L', 'VP8X']) {
  test(`${kind}: dimension limits remain 6144 on both axes`, async () => {
    const s = server();
    assert.equal((await s.upload(resized(kind, 6144, 6144))).status, 201);
    for (const [w, h] of [[6145, 2], [3, 6145]]) {
      assert.equal((await s.upload(resized(kind, w, h))).status, 413);
    }
    assert.equal(s.uploads.length, 1);
  });
}
test('malformed containers and headers are rejected before storage', async () => {
  const cases = [];
  const change = (kind, edit) => { const bytes = Buffer.from(fixtures[kind]); edit(bytes); cases.push(bytes); };
  change('VP8', b => b.write('NOPE', 0));
  change('VP8', b => b.write('NOPE', 8));
  change('VP8', b => b.writeUInt32LE(0xffffffff, 16));
  change('VP8', b => b[23] = 0); // Key-frame start code.
  change('VP8', b => b[20] |= 1); // Inter frame is not a WebP image.
  change('VP8', b => b.writeUInt16LE(0, 26));
  change('VP8L', b => b[20] = 0);
  change('VP8L', b => b[24] |= 0xe0); // Unsupported lossless version.
  change('VP8L', b => b[b.length - 1] = 1); // Nonzero RIFF padding.
  change('VP8X', b => b[24]++); // Canvas disagrees with image.
  change('VP8X', b => b[21] = 1); // Reserved byte.
  change('animated', b => b.writeUIntLE(100, 56, 3)); // Frame exceeds canvas.
  const x = fixtures.VP8X.subarray(12, 30);
  cases.push(riff(x), riff(x, x, fixtures.VP8.subarray(12))); // Missing image / duplicate VP8X.
  cases.push(riff(fixtures.VP8.subarray(12), fixtures.VP8.subarray(12)));
  cases.push(riff(chunk('VP8 ', Buffer.alloc(10))), riff(chunk('VP8L', Buffer.from([47, 0, 0, 0, 0]))));
  cases.push(riff(Buffer.from('VP8 '))); // Incomplete chunk header, correct RIFF size.
  cases.push(riff(fixtures.VP8.subarray(12, -2))); // Truncated chunk, corrected RIFF size.
  cases.push(Buffer.concat([fixtures.VP8, Buffer.from([0, 0])])); // Trailing bytes.
  const s = server();
  for (const [i, bytes] of cases.entries()) assert.equal((await s.upload(bytes)).status, 400, `case ${i}`);
  assert.equal(s.uploads.length, 0); assert.equal(s.registrations.length, 0);
});
test('50 MiB file limit is unchanged and MIME alone never authorizes WebP', async () => {
  const s = server();
  assert.equal((await s.upload(fixtures.VP8, 'image/webp', 50 * 1024 * 1024)).status, 201);
  assert.equal((await s.upload(fixtures.VP8, 'image/webp', 50 * 1024 * 1024 + 1)).status, 413);
  assert.equal((await s.upload(Buffer.from('not an image'))).status, 400);
  assert.equal(s.uploads.length, 1);
});
test('PNG and JPEG dimension extraction and upload limits are unchanged', async () => {
  const png = fs.readFileSync('public/assets/maps/test-map.png');
  // SOI + baseline SOF segment: exercise the existing JPEG dimension branch.
  const jpeg = Buffer.from([255,216,255,192,0,17,8,0,2,0,3,3,1,17,0,2,17,0,3,17,0,255,217]);
  const s = server();
  assert.deepEqual(Array.from(s.dimensions(png, 'image/png')), [png.readUInt32BE(16), png.readUInt32BE(20)]);
  assert.deepEqual(Array.from(s.dimensions(jpeg, 'image/jpeg')), [3, 2]);
  assert.equal((await s.upload(png, 'image/png')).status, 201);
  assert.equal((await s.upload(jpeg, 'image/jpeg')).status, 201);
  const bigPng = Buffer.from(png); bigPng.writeUInt32BE(6145, 16);
  const bigJpeg = Buffer.from(jpeg); bigJpeg.writeUInt16BE(6145, 7);
  assert.equal((await s.upload(bigPng, 'image/png')).status, 413);
  assert.equal((await s.upload(bigJpeg, 'image/jpeg')).status, 413);
  assert.equal(s.uploads.length, 2);
});
