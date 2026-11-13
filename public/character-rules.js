// Ticket 9: proficiency pouze podle základního povolání, bez ručních výjimek.
const SAVE_PROFICIENCIES = new Map([
  ['barbarian', ['str', 'con']], ['bard', ['dex', 'cha']],
  ['fighter', ['str', 'con']], ['sorcerer', ['con', 'cha']],
  ['warlock', ['wis', 'cha']], ['druid', ['int', 'wis']],
  ['ranger', ['str', 'dex']], ['cleric', ['wis', 'cha']],
  ['wizard', ['int', 'wis']], ['monk', ['str', 'dex']],
  ['paladin', ['wis', 'cha']], ['rogue', ['dex', 'int']],
]);

// Kódy jsou shodné s app_private.valid_skill_proficiencies v databázové migraci.
export const SKILLS = [
  { czechName: 'Akrobacie', englishName: 'Acrobatics', code: 'acrobatics', ability: 'dex' },
  { czechName: 'Zacházení se zvířaty', englishName: 'Animal Handling', code: 'animal_handling', ability: 'wis' },
  { czechName: 'Arkána', englishName: 'Arcana', code: 'arcana', ability: 'int' },
  { czechName: 'Atletika', englishName: 'Athletics', code: 'athletics', ability: 'str' },
  { czechName: 'Klamání', englishName: 'Deception', code: 'deception', ability: 'cha' },
  { czechName: 'Historie', englishName: 'History', code: 'history', ability: 'int' },
  { czechName: 'Vhled', englishName: 'Insight', code: 'insight', ability: 'wis' },
  { czechName: 'Zastrašování', englishName: 'Intimidation', code: 'intimidation', ability: 'cha' },
  { czechName: 'Vyšetřování', englishName: 'Investigation', code: 'investigation', ability: 'int' },
  { czechName: 'Lékařství', englishName: 'Medicine', code: 'medicine', ability: 'wis' },
  { czechName: 'Příroda', englishName: 'Nature', code: 'nature', ability: 'int' },
  { czechName: 'Vnímání', englishName: 'Perception', code: 'perception', ability: 'wis' },
  { czechName: 'Vystupování', englishName: 'Performance', code: 'performance', ability: 'cha' },
  { czechName: 'Přesvědčování', englishName: 'Persuasion', code: 'persuasion', ability: 'cha' },
  { czechName: 'Náboženství', englishName: 'Religion', code: 'religion', ability: 'int' },
  { czechName: 'Mrštnost rukou', englishName: 'Sleight of Hand', code: 'sleight_of_hand', ability: 'dex' },
  { czechName: 'Plížení', englishName: 'Stealth', code: 'stealth', ability: 'dex' },
  { czechName: 'Přežití', englishName: 'Survival', code: 'survival', ability: 'wis' },
];

function abilityModifier(value) {
  return value == null ? null : Math.floor((value - 10) / 2);
}

function proficiencyBonus(level) {
  return Number.isInteger(level) && level >= 1 && level <= 20 ? 2 + Math.floor((level - 1) / 4) : 0;
}

export function abilityValues(character, key, value = character[key]) {
  const modifier = abilityModifier(value);
  const proficient = SAVE_PROFICIENCIES.get(character.class_code)?.includes(key) ?? false;
  const save = modifier == null ? null : modifier + (proficient ? proficiencyBonus(character.level) : 0);
  return { modifier, proficient, save };
}

export function skillValues(character, skill) {
  const modifier = abilityModifier(character[skill.ability]);
  const proficient = character.skill_proficiencies?.[skill.code] === true;
  const bonus = modifier == null ? null : modifier + (proficient ? proficiencyBonus(character.level) : 0);
  return { modifier, proficient, bonus };
}
export function validHpDelta(value, badInput = false) {
  return !badInput && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}
export function adjustedHp(character, direction, amount) {
  return Math.max(0, Math.min(character.max_hp, character.current_hp + direction * Number(amount)));
}
