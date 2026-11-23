// D&D 5e (2014) spell-slot rules.
// This module intentionally contains state transitions only; persistence and UI
// can use the returned plain objects without sharing mutable state.

const FULL_CASTER_SLOTS = [
  [],
  [2],
  [4, 2],
  [4, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1],
  [4, 3, 3, 3, 3, 2, 2, 1],
];

// The table is indexed by character level. A half-caster uses the row at
// floor(level / 2); level 1 therefore has no automatic spell slots.
const HALF_CASTER_SLOTS = [
  [], [], [2], [3], [4, 2], [4, 2], [4, 2, 2], [4, 2, 2],
  [4, 3, 2, 1], [4, 3, 2, 1], [4, 3, 2, 2],
];

const PACT_MAGIC = [
  null,
  [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4],
  [2, 5], [2, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5],
  [4, 5], [4, 5], [4, 5], [4, 5],
];

const FULL_CASTERS = new Set(['bard', 'cleric', 'druid', 'sorcerer', 'wizard']);
const HALF_CASTERS = new Set(['paladin', 'ranger']);
const MAX_LEVEL = 20;

function validLevel(level) {
  return Number.isInteger(level) && level >= 1 && level <= MAX_LEVEL;
}

function slotRows(counts) {
  return counts.map((maximum, index) => ({ level: index + 1, maximum, current: maximum }));
}

function automaticRows(classCode, level) {
  if (!validLevel(level)) return [];
  if (classCode === 'warlock') {
    const [maximum, slotLevel] = PACT_MAGIC[level];
    return [{ level: slotLevel, maximum, current: maximum }];
  }
  if (FULL_CASTERS.has(classCode)) return slotRows(FULL_CASTER_SLOTS[level]);
  if (HALF_CASTERS.has(classCode)) return slotRows(HALF_CASTER_SLOTS[level] ?? []);
  return [];
}

function correctionMap(correction) {
  if (correction == null) return {};
  if (Number.isSafeInteger(correction)) return { 1: correction };
  return Object.fromEntries(Object.entries(correction).map(([level, value]) => [level, Number.isSafeInteger(value) ? value : 0]));
}

function applyCorrection(rows, correction) {
  const adjustments = correctionMap(correction);
  return rows.map(row => {
    const maximum = Math.max(0, row.maximum + (adjustments[row.level] ?? 0));
    return { ...row, maximum, current: maximum };
  });
}

export function automaticSpellSlots(classCode, level) {
  return automaticRows(classCode, level).map(({ level: slotLevel, maximum }) => ({ level: slotLevel, maximum }));
}

export function createSpellSlotState({ classCode = null, level = null, manualCorrection = {} } = {}) {
  const corrections = correctionMap(manualCorrection);
  const rows = applyCorrection(automaticRows(classCode, level), corrections);
  for (const [slotLevel, delta] of Object.entries(corrections)) {
    const levelNumber = Number(slotLevel);
    if (delta > 0 && !rows.some(row => row.level === levelNumber)) rows.push({ level: levelNumber, maximum: delta, current: delta });
  }
  rows.sort((left, right) => left.level - right.level);
  return { classCode, level, manualCorrection: corrections, slots: rows };
}

export function setManualCorrection(state, slotLevel, delta) {
  if (!Number.isInteger(slotLevel) || slotLevel < 1 || slotLevel > 9 || !Number.isSafeInteger(delta)) return state;
  const manualCorrection = { ...state.manualCorrection, [slotLevel]: delta };
  const automaticMaximum = automaticRows(state.classCode, state.level).find(item => item.level === slotLevel)?.maximum ?? 0;
  const slots = state.slots.map(row => {
    if (row.level !== slotLevel) return row;
    const maximum = Math.max(0, automaticMaximum + delta);
    const consumed = Math.max(0, row.maximum - row.current);
    return { ...row, maximum, current: Math.max(0, maximum - consumed) };
  });
  // A correction may create a slot level for a class with no automatic slots.
  if (!slots.some(row => row.level === slotLevel) && delta > 0) slots.push({ level: slotLevel, maximum: delta, current: delta });
  slots.sort((a, b) => a.level - b.level);
  return { ...state, manualCorrection, slots };
}

export function recalculateSpellSlots(previousState, { classCode = previousState.classCode, level = previousState.level } = {}) {
  const oldConsumed = new Map(previousState.slots.map(row => [row.level, Math.max(0, row.maximum - row.current)]));
  const oldPactConsumed = previousState.classCode === 'warlock' ? Math.max(0, (previousState.slots[0]?.maximum ?? 0) - (previousState.slots[0]?.current ?? 0)) : 0;
  const next = createSpellSlotState({ classCode, level });
  next.slots = next.slots.map(row => {
    const consumed = classCode === 'warlock' ? oldPactConsumed : (oldConsumed.get(row.level) ?? 0);
    return { ...row, current: Math.max(0, row.maximum - consumed) };
  });
  return next;
}

export function spendSpellSlot(state, slotLevel = state.slots.length === 1 ? state.slots[0].level : null) {
  const index = state.slots.findIndex(row => row.level === slotLevel);
  if (index < 0 || state.slots[index].current <= 0) return state;
  const slots = state.slots.map((row, rowIndex) => rowIndex === index ? { ...row, current: row.current - 1 } : row);
  return { ...state, slots };
}

export function restoreSpellSlot(state, slotLevel = state.slots.length === 1 ? state.slots[0].level : null) {
  const index = state.slots.findIndex(row => row.level === slotLevel);
  if (index < 0 || state.slots[index].current >= state.slots[index].maximum) return state;
  const slots = state.slots.map((row, rowIndex) => rowIndex === index ? { ...row, current: row.current + 1 } : row);
  return { ...state, slots };
}

export function restoreAllSpellSlots(state) {
  return { ...state, slots: state.slots.map(row => ({ ...row, current: row.maximum })) };
}

// Persistence stores user state and the source used to calculate it, never a
// second copy of the D&D progression tables. If source differs from character,
// recalculateSpellSlots preserves spent slots and clears manual corrections.
export function spellSlotStateFromRecord(character) {
  const saved = character.spell_slot_state;
  const currentCharacterState = manualCorrection => createSpellSlotState({ classCode: character.class_code, level: character.level, manualCorrection });
  if (!saved || typeof saved !== 'object') return currentCharacterState();
  const source = saved.source;
  const sourceState = source && typeof source === 'object'
    ? createSpellSlotState({ classCode: source.class_code, level: source.level, manualCorrection: saved.manual_correction })
    : currentCharacterState(saved.manual_correction);
  const savedCurrent = saved.current && typeof saved.current === 'object' ? saved.current : {};
  const savedMaximum = saved.maximum && typeof saved.maximum === 'object' ? saved.maximum : {};
  sourceState.slots = sourceState.slots.map(row => {
    const maximum = savedMaximum[row.level];
    const current = savedCurrent[row.level];
    const persistedMaximum = Number.isInteger(maximum) ? Math.max(0, maximum) : row.maximum;
    return Number.isInteger(current)
      ? { ...row, maximum: persistedMaximum, current: Math.max(0, Math.min(persistedMaximum, current)) }
      : { ...row, maximum: persistedMaximum, current: persistedMaximum };
  });
  if (source?.class_code === character.class_code && source?.level === character.level) return sourceState;
  return recalculateSpellSlots(sourceState, character);
}

export function serializeSpellSlotState(state) {
  const source = validLevel(state.level) && typeof state.classCode === 'string'
    ? { class_code: state.classCode, level: state.level }
    : null;
  return {
    current: Object.fromEntries(state.slots.map(row => [row.level, row.current])),
    maximum: Object.fromEntries(state.slots.map(row => [row.level, row.maximum])),
    manual_correction: state.manualCorrection,
    source,
  };
}