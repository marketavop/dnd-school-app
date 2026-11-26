export const INVENTORY_TYPES = new Map([
  ['weapon', 'Zbraň (Weapon)'], ['armor_shield', 'Zbroj a štít (Armor & Shield)'],
  ['adventuring_gear', 'Dobrodružná výbava (Adventuring Gear)'], ['tool', 'Nástroj nebo pomůcka (Tool)'],
  ['consumable', 'Spotřební předmět (Consumable)'], ['magic_item', 'Kouzelný předmět (Magic Item)'],
  ['valuable', 'Cennost (Valuable)'], ['quest_item', 'Úkolový předmět (Quest Item)'],
  ['other', 'Ostatní (Other)'],
]);

export function inventoryItemDetails(item) {
  const details = [INVENTORY_TYPES.get(item.item_type) ?? 'Neznámý typ', `Množství: ${item.quantity}`];
  if (item.price_gp != null) details.push(`${String(item.price_gp).replace('.', ',')} GP / ks`);
  if (item.not_for_sale) details.push('Neprodejné');
  return details;
}

export function setupInventoryItemForm(db, characterId, sessionToken, onSaved) {
  const dialog = document.querySelector('#inventory-item-dialog');
  const form = document.querySelector('#inventory-item-form');
  const title = document.querySelector('#inventory-item-form-title');
  const save = document.querySelector('#inventory-item-save');
  const cancel = document.querySelector('#inventory-item-cancel');
  const error = document.querySelector('#inventory-item-error');
  const fieldset = form.querySelector('fieldset');
  const { itemName, itemType, quantity, price, notForSale, note } = form.elements;
  let editingItem, initial;
  let busy = false;

  for (const [code, label] of INVENTORY_TYPES) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = label;
    itemType.append(option);
  }
  dialog.hidden = false;

  function readForm() {
    return {
      name: itemName.value, item_type: itemType.value, quantity: quantity.value,
      price_gp: price.value.trim(), not_for_sale: notForSale.checked, note: note.value || null,
    };
  }
  function clearError() {
    error.textContent = '';
    for (const field of [itemName, itemType, quantity, price]) field.removeAttribute('aria-invalid');
  }
  function invalid(field, message) {
    error.textContent = message;
    field.setAttribute('aria-invalid', 'true');
    field.focus();
  }
  function open(item) {
    if (dialog.open || busy) return;
    editingItem = item;
    itemName.value = item?.name ?? '';
    itemType.value = item?.item_type ?? 'other';
    quantity.value = item?.quantity ?? 1;
    price.value = item?.price_gp == null ? '' : String(item.price_gp).replace('.', ',');
    notForSale.checked = item?.not_for_sale ?? false;
    note.value = item?.note ?? '';
    initial = readForm();
    title.textContent = item ? 'Upravit předmět' : 'Přidat předmět';
    save.textContent = item ? 'Uložit změny' : 'Přidat předmět';
    clearError();
    dialog.showModal();
  }
  cancel.addEventListener('click', () => { if (!busy) dialog.close(); });
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !dialog.open) return;
    clearError();
    const draft = readForm();
    if (!draft.name.trim()) return invalid(itemName, 'Vyplň název předmětu.');
    if (!INVENTORY_TYPES.has(draft.item_type)) return invalid(itemType, 'Vyber typ předmětu.');
    const amount = Number(draft.quantity);
    if (!/^\d+$/.test(draft.quantity) || amount < 1 || amount > 2147483647) {
      return invalid(quantity, 'Množství musí být kladné celé číslo do 2 147 483 647.');
    }
    const priceChanged = !editingItem || draft.price_gp !== initial.price_gp;
    const unitPrice = draft.price_gp === '' ? null : Number(draft.price_gp.replace(',', '.'));
    if (priceChanged && unitPrice !== null && (
      !/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(draft.price_gp) || !Number.isFinite(unitPrice)
      || (unitPrice === 0 && /[1-9]/.test(draft.price_gp))
    )) return invalid(price, 'Zadej nezápornou cenu, například 0 nebo 1,5 GP.');

    const values = { ...draft, quantity: amount, price_gp: unitPrice };
    const args = { p_session_token: sessionToken, p_character_id: characterId };
    const updating = Boolean(editingItem);
    if (updating) {
      args.p_item_id = editingItem.id;
      args.p_patch = Object.fromEntries(Object.keys(values)
        .filter(key => draft[key] !== initial[key]).map(key => [key, values[key]]));
      if (!Object.keys(args.p_patch).length) { dialog.close(); return; }
    } else {
      for (const [key, value] of Object.entries(values)) args['p_' + key] = value;
    }

    busy = fieldset.disabled = save.disabled = cancel.disabled = true;
    const saveLabel = save.textContent;
    save.textContent = 'Ukládám…';
    try {
      const { data, error: rpcError } = await db.rpc(
        updating ? 'player_update_inventory_item' : 'player_add_inventory_item', args,
      );
      const saved = data?.[0];
      if (rpcError || !Array.isArray(data) || data.length !== 1 || !saved?.id
          || saved.character_id !== characterId || (updating && saved.id !== editingItem.id)) {
        throw new Error('Předmět se nepodařilo uložit.');
      }
      const focus = onSaved(saved, updating);
      dialog.close();
      focus?.focus();
    } catch {
      error.textContent = 'Předmět se nepodařilo uložit. Vyplněné údaje zůstaly zachované.';
    } finally {
      busy = fieldset.disabled = save.disabled = cancel.disabled = false;
      save.textContent = saveLabel;
      if (dialog.open) save.focus();
    }
  });
  return open;
}
