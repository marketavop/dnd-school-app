import { restoreSpellSlot, spendSpellSlot } from './spell-slots.js';

export function spellLevelName(level) {
  if (level === 0) return 'Cantrips (Triky)';
  const suffix = level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th';
  return `${level}${suffix}-level spells (Kouzla ${level}. úrovně)`;
}

export function renderSpellGroups(list, character, state, grouped, { busy, onChange, compact = false }) {
  const rowForLevel = level => state.slots.find(row => row.level === level) ?? { level, maximum: 0, current: 0 };
  function groupHeading(level, row) {
    const header = document.createElement('header'); header.className = 'spell-level-heading';
    const title = document.createElement('h3');
    const shortName = level === 0 ? 'Cantrips' : `${level}${level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th'} level`;
    title.textContent = (compact ? shortName : spellLevelName(level)) + (level > 0 && character.class_code === 'warlock' && row.maximum > 0 ? ' · Pact Magic' : '');
    const hint = document.createElement('span'); hint.className = 'spell-level-hint'; hint.textContent = level === 0 ? 'bez spotřeby pozic' : row.maximum ? `${row.current}/${row.maximum}` : 'bez pozic';
    const diamonds = document.createElement('div'); diamonds.className = 'spell-slot-diamonds';
    diamonds.setAttribute('aria-label', level === 0 ? 'Triky se nespotřebovávají' : `${row.current} z ${row.maximum} dostupných pozic`);
    if (level > 0) {
      for (let index = 0; index < Math.min(row.maximum, 20); index++) {
        const diamond = document.createElement(onChange ? 'button' : 'span');
        diamond.className = index < row.current ? 'is-available' : 'is-spent';
        if (!onChange) {
          diamond.setAttribute('aria-hidden', 'true');
          diamonds.append(diamond);
          continue;
        }
        diamond.type = 'button';
        diamond.setAttribute('aria-label', index < row.current ? `Spotřebovat pozici ${level}. úrovně` : `Obnovit pozici ${level}. úrovně`);
        diamond.disabled = busy;
        diamond.addEventListener('click', () => onChange(index < row.current ? spendSpellSlot(state, row.level) : restoreSpellSlot(state, row.level)));
        diamonds.append(diamond);
      }
    }
    header.append(title, diamonds, hint);
    return header;
  }
  for (const row of state.slots) {
    if (row.maximum > 0 && !grouped.has(row.level)) grouped.set(row.level, []);
  }
  list.replaceChildren();
  for (const level of [...grouped.keys()].sort((a, b) => a - b)) {
    const group = document.createElement('section');
    group.className = 'spell-level-group';
    group.append(groupHeading(level, rowForLevel(level)), ...grouped.get(level));
    list.append(group);
  }
  if (!grouped.size) list.textContent = 'Zatím nemáš zapsaná žádná kouzla.';
}
