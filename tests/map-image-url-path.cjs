const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('supabase/functions/map-image-url/index.ts', 'utf8')
  .match(/function storageObjectPath[\s\S]*?\n}/)[0]
  .replace(': string', '');
const context = vm.createContext({});
vm.runInContext(`${source}; globalThis.storageObjectPath = storageObjectPath;`, context);
assert.equal(context.storageObjectPath('maps/abc.webp'), 'abc.webp');
assert.notEqual(context.storageObjectPath('maps/abc.webp'), 'maps/abc.webp');
console.log('PASS: signed URL uses object path inside maps bucket');
