const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

(async () => {
  const source = readFileSync(resolve(__dirname, '../public/character-sections.js'), 'utf8');
  const { CHARACTER_SECTIONS } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.deepEqual(CHARACTER_SECTIONS, [
    { id: 'abilities', name: 'Vlastnosti a záchranné hody (Ability Scores & Saving Throws)', defaultVisible: true },
    { id: 'skills', name: 'Dovednosti (Skills)', defaultVisible: false },
    { id: 'features', name: 'Schopnosti (Features)', defaultVisible: false },
    { id: 'spells', name: 'Kouzla (Spells)', defaultVisible: false },
  ]);
  assert.equal(new Set(CHARACTER_SECTIONS.map(section => section.id)).size, CHARACTER_SECTIONS.length);
  assert.ok(CHARACTER_SECTIONS.every(section => section.id && section.name && typeof section.defaultVisible === 'boolean'));
  assert.ok(!CHARACTER_SECTIONS.some(section => ['Kouzla', 'Inventář', 'Studentský sešit'].includes(section.name)));
  console.log('PASS: implemented optional character sections have stable unique IDs and defaults');
})().catch(error => { console.error(error); process.exitCode = 1; });
