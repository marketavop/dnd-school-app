const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/map-upload.js', 'utf8').replace("import { getCurrentUser } from './login.js';", '');
function page(role, file = null) {
  const el = () => ({ hidden: false, value: '', files: file ? [file] : [], handlers: {},
    addEventListener(k, v) { this.handlers[k] = v; }, reset() {}, querySelector() { return { disabled: false }; } });
  const elements = Object.fromEntries(['add-map-button','map-upload-form','map-upload-name','map-upload-file','map-upload-error','maps-status','map-upload-cancel','leader-maps-link'].map(id => [id, el()]));
  const calls = [];
  const context = vm.createContext({ getCurrentUser: () => role ? { role, session_token: 'secret' } : null,
    document: { querySelector: s => elements[s.slice(1)] }, console: { error() {} }, FormData: class { set() {} }, createImageBitmap: async () => ({ width: 100, height: 100, close() {} }),
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({}) }; },
    import: async () => ({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }),
  });
  vm.runInContext(source, context, { importModuleDynamically: async () => ({ SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }) }); return { elements, calls };
}
const invalid = page('player'); invalid.elements['add-map-button'].handlers.click(); assert.equal(invalid.elements['map-upload-form'].hidden, false);
assert.equal(page(null).calls.length, 0);
const p = page('leader', { type: 'image/png', size: 100 }); p.elements['map-upload-name'].value = 'Nová mapa';
assert.equal(typeof p.elements['map-upload-form'].handlers.submit, 'function');
assert.equal(p.calls.length, 0, 'No request is made before submit');
console.log('PASS: uploader leader guard and local preflight structure');
