// node tests/character-skills.cjs — metadata a výpočty D&D 5e 2014.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const source = readFileSync(resolve(__dirname, '../public/character-rules.js'), 'utf8')
  .replaceAll('export const', 'const')
  .replaceAll('export function', 'function')
  + '\nmodule.exports = { SKILLS, skillValues };';
const context = { module: { exports: {} } };
vm.runInNewContext(source, context);
const { SKILLS, skillValues } = context.module.exports;

const expectedAbilities = {
  acrobatics: 'dex', animal_handling: 'wis', arcana: 'int', athletics: 'str', deception: 'cha',
  history: 'int', insight: 'wis', intimidation: 'cha', investigation: 'int', medicine: 'wis',
  nature: 'int', perception: 'wis', performance: 'cha', persuasion: 'cha', religion: 'int',
  sleight_of_hand: 'dex', stealth: 'dex', survival: 'wis',
};

assert.equal(SKILLS.length, 18);
assert.deepEqual(Object.fromEntries(SKILLS.map(({ code, ability }) => [code, ability])), expectedAbilities);
assert.ok(SKILLS.every(skill => skill.czechName && skill.englishName));

const character = { level: 1, str: 10, dex: 14, con: 10, int: 12, wis: 8, cha: 16, skill_proficiencies: { stealth: true } };
const stealth = SKILLS.find(skill => skill.code === 'stealth');
const arcana = SKILLS.find(skill => skill.code === 'arcana');
assert.equal(skillValues(character, stealth).modifier, 2);
assert.equal(skillValues(character, stealth).proficient, true);
assert.equal(skillValues(character, stealth).bonus, 4);
assert.equal(skillValues(character, arcana).proficient, false);
assert.equal(skillValues(character, arcana).bonus, 1);
assert.equal(skillValues({ ...character, dex: 18 }, stealth).bonus, 6);
assert.equal(skillValues({ ...character, level: 5 }, stealth).bonus, 5);

console.log('PASS: 18 skill metadata mappings, proficiency, and level recalculation');
