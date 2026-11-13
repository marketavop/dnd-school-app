// Mechanické části dostupné pro budoucí společné řízení viditelnosti.
// Základ průkazu, Inventář a Studentský sešit jsou vždy viditelné a nepatří sem.
export const CHARACTER_SECTIONS = Object.freeze([
  Object.freeze({ id: 'abilities', name: 'Vlastnosti a záchranné hody', defaultVisible: true }),
  Object.freeze({ id: 'features', name: 'Schopnosti (Features)', defaultVisible: false }),
]);
