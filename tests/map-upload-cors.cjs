const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const fullSource = fs.readFileSync('supabase/functions/leader-map-upload/index.ts', 'utf8');
const source = fullSource.slice(fullSource.indexOf('const CORS_HEADERS'), fullSource.indexOf('function dimensions'))
  + fullSource.slice(fullSource.indexOf('function response'))
  .replace(/: string/g, '')
  .replace(/: number/g, '')
  .replace(/: FormData/g, '')
  .replace(/: Response/g, '');
let handler;
const context = vm.createContext({
  Deno: { serve(fn) { handler = fn; } },
  Response,
  TextDecoder,
  DataView,
  Uint8Array,
  crypto,
});
vm.runInContext(source, context);

(async () => {
  const response = await handler(new Request('https://example.test/functions/v1/leader-map-upload', { method: 'OPTIONS' }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  assert.equal(response.headers.get('access-control-allow-headers'), 'authorization, x-client-info, apikey, content-type, x-session-token');
  console.log('PASS: leader map upload CORS preflight');
})();
