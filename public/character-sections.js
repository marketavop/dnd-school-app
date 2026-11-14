// Mechanické části dostupné pro budoucí společné řízení viditelnosti.
// Základ průkazu, Inventář a Studentský sešit jsou vždy viditelné a nepatří sem.
export const CHARACTER_SECTIONS = Object.freeze([
  Object.freeze({ id: 'abilities', name: 'Vlastnosti a záchranné hody (Ability Scores & Saving Throws)', defaultVisible: true }),
  Object.freeze({ id: 'skills', name: 'Dovednosti (Skills)', defaultVisible: false }),
  Object.freeze({ id: 'features', name: 'Schopnosti (Features)', defaultVisible: false }),
  Object.freeze({ id: 'spells', name: 'Kouzla (Spells)', defaultVisible: false }),
]);
