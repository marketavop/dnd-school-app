// Ticket 9: proficiency pouze podle základního povolání, bez ručních výjimek.
const SAVE_PROFICIENCIES = new Map([
  ['barbarian', ['str', 'con']], ['bard', ['dex', 'cha']],
  ['fighter', ['str', 'con']], ['sorcerer', ['con', 'cha']],
  ['warlock', ['wis', 'cha']], ['druid', ['int', 'wis']],
  ['ranger', ['str', 'dex']], ['cleric', ['wis', 'cha']],
  ['wizard', ['int', 'wis']], ['monk', ['str', 'dex']],
  ['paladin', ['wis', 'cha']], ['rogue', ['dex', 'int']],
]);

export function abilityValues(character, key, value = character[key]) {
  const modifier = value == null ? null : Math.floor((value - 10) / 2);
  const proficient = SAVE_PROFICIENCIES.get(character.class_code)?.includes(key) ?? false;
  const level = character.level;
  const proficiencyBonus = Number.isInteger(level) && level >= 1 && level <= 20 ? 2 + Math.floor((level - 1) / 4) : 0;
  const save = modifier == null ? null : modifier + (proficient ? proficiencyBonus : 0);
  return { modifier, proficient, save };
}
export function validHpDelta(value, badInput = false) {
  return !badInput && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}
export function adjustedHp(character, direction, amount) {
  return Math.max(0, Math.min(character.max_hp, character.current_hp + direction * Number(amount)));
}
