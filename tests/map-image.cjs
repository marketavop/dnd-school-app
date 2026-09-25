const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/map-image.js', 'utf8').replace(/^import .*;\r?\n/, '').replaceAll('export function', 'function').replaceAll('export async function', 'async function');
const context = vm.createContext({ getCurrentUser: () => null, fetch: async () => ({}) });
vm.runInContext(`${source}; globalThis.mapImageSrc = mapImageSrc; globalThis.resolveMapImage = resolveMapImage; globalThis.configureMapImageUrl = configureMapImageUrl;`, context);
context.configureMapImageUrl('https://project.supabase.co');
assert.equal(context.mapImageSrc('./assets/maps/test-map.png'), './assets/maps/test-map.png');
assert.equal(context.mapImageSrc('maps/abc.jpg'), 'maps/abc.jpg');
context.fetch = async () => ({ ok: true, json: async () => ({ signed_url: 'https://signed.example/map' }) });
(async () => {
  assert.equal(await context.resolveMapImage('maps/abc.webp', 'mapa-akademie'), 'https://signed.example/map');
console.log('PASS: shared map image resolver preserves assets and resolves Storage paths');
})();
