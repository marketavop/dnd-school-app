const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const source = readFileSync(resolve(__dirname, '../public/spell-slots.js'), 'utf8')
  .replaceAll('export function', 'function')
  + '\nmodule.exports = { automaticSpellSlots, createSpellSlotState, setManualCorrection, recalculateSpellSlots, spendSpellSlot, restoreAllSpellSlots, spellSlotStateFromRecord, serializeSpellSlotState };';
const context = { module: { exports: {} } };
vm.runInNewContext(source, context);
const rules = context.module.exports;
const levels = slots => slots.map(({ level, maximum, current }) => [level, maximum, current]);
const assertSlots = (actual, expected) => assert.equal(JSON.stringify(actual), JSON.stringify(expected));

assertSlots(levels(rules.createSpellSlotState({ classCode: 'wizard', level: 1 }).slots), [[1, 2, 2]]);
assertSlots(levels(rules.createSpellSlotState({ classCode: 'wizard', level: 3 }).slots), [[1, 4, 4], [2, 2, 2]]);
assertSlots(rules.automaticSpellSlots('paladin', 1), []);
assertSlots(levels(rules.createSpellSlotState({ classCode: 'paladin', level: 2 }).slots), [[1, 2, 2]]);
assertSlots(rules.automaticSpellSlots('fighter', 20), []);
assertSlots(levels(rules.createSpellSlotState({ classCode: 'warlock', level: 3 }).slots), [[2, 2, 2]]);
assertSlots(rules.automaticSpellSlots('wizard', 1).map(row => row.level), [1]); // cantrips are not slots

let state = rules.createSpellSlotState({ classCode: 'wizard', level: 1 });
state = rules.spendSpellSlot(state, 1);
state = rules.spendSpellSlot(state, 1);
assertSlots(levels(state.slots), [[1, 2, 0]]);
assert.strictEqual(rules.spendSpellSlot(state, 1), state); // spending at zero is a no-op
state = rules.restoreAllSpellSlots(state);
assertSlots(levels(state.slots), [[1, 2, 2]]);

state = rules.createSpellSlotState({ classCode: 'wizard', level: 1 });
state = rules.setManualCorrection(state, 1, 2);
state = rules.spendSpellSlot(state, 1);
assertSlots(levels(state.slots), [[1, 4, 3]]);
state = rules.recalculateSpellSlots(state, { classCode: 'wizard', level: 3 });
assertSlots(state.manualCorrection, {});
assertSlots(levels(state.slots), [[1, 4, 3], [2, 2, 2]]); // one spent slot survives level-up

state = rules.createSpellSlotState({ classCode: 'fighter', level: 1 });
state = rules.setManualCorrection(state, 1, 2);
assertSlots(levels(state.slots), [[1, 2, 2]]);
state = rules.setManualCorrection(state, 1, -3);
assertSlots(levels(state.slots), [[1, 0, 0]]);
state = rules.spellSlotStateFromRecord({ class_code: 'fighter', level: 1, spell_slot_state: { current: { 1: 1 }, manual_correction: { 1: 2 }, source: { class_code: 'fighter', level: 1 } } });
assertSlots(levels(state.slots), [[1, 2, 1]]);

state = rules.createSpellSlotState({ classCode: 'warlock', level: 3 });
state = rules.spendSpellSlot(state);
state = rules.recalculateSpellSlots(state, { classCode: 'warlock', level: 5 });
assertSlots(levels(state.slots), [[3, 2, 1]]); // shared fund consumption is preserved

state = rules.createSpellSlotState({ classCode: 'wizard', level: 1 });
state = rules.spendSpellSlot(state, 1);
let stored = rules.serializeSpellSlotState(state);
assertSlots(stored, { current: { 1: 1 }, maximum: { 1: 2 }, manual_correction: {}, source: { class_code: 'wizard', level: 1 } });
state = rules.spellSlotStateFromRecord({ class_code: 'wizard', level: 3, spell_slot_state: stored });
assertSlots(levels(state.slots), [[1, 4, 3], [2, 2, 2]]);

state = rules.createSpellSlotState({ classCode: 'wizard', level: 1 });
state = rules.setManualCorrection(state, 1, 2);
state = rules.spendSpellSlot(state, 1);
stored = rules.serializeSpellSlotState(state);
stored.manual_correction = {}; // database clears this when the level changes
state = rules.spellSlotStateFromRecord({ class_code: 'wizard', level: 3, spell_slot_state: stored });
assertSlots(levels(state.slots), [[1, 4, 3], [2, 2, 2]]); // correction reset still preserves one spent slot

console.log('PASS: spell-slot tables, corrections, spending, restore, and recalculation');
