const CHARACTER_FIELDS = 'id,user_id,name,portrait_path,race_code,class_code,level,str,dex,con,int,wis,cha,xp,current_hp,max_hp';
const EDITABLE_FIELDS = new Set([
  'name', 'portrait_path', 'race_code', 'class_code', 'level',
  'str', 'dex', 'con', 'int', 'wis', 'cha',
  'xp', 'current_hp', 'max_hp',
]);

// Používá již vytvořeného Supabase klienta. NULL vrací beze změny.
export async function loadCharacter(db, characterId) {
  try {
    const { data, error } = await db.from('characters')
      .select(CHARACTER_FIELDS).eq('id', characterId).single();
    if (error) throw error;
    if (!data) throw new Error('DB nevrátila postavu.');
    return data;
  } catch (error) {
    console.error('Načtení postavy selhalo:', { characterId, error });
    throw error;
  }
}

// Mění právě jedno povolené pole existujícího řádku; nikdy nevytváří postavu.
export async function updateCharacterField(db, characterId, field, value) {
  try {
    if (!EDITABLE_FIELDS.has(field)) throw new Error('Nepovolené pole postavy.');
    // undefined by při serializaci zmizelo; prázdná hodnota musí být explicitní NULL.
    if (value === undefined) throw new Error('Hodnota pole nesmí být undefined.');
    const { data, error } = await db.from('characters')
      .update({ [field]: value }).eq('id', characterId).select(CHARACTER_FIELDS).single();
    if (error) throw error;
    if (!data) throw new Error('DB nevrátila aktualizovanou postavu.');
    return data;
  } catch (error) {
    console.error('Uložení pole postavy selhalo:', { characterId, field, error });
    throw error;
  }
}

// Pouze snížení maxima a korekce current HP v jednom atomickém UPDATE.
export async function lowerCharacterHp(db, characterId, maxHp) {
  try {
    if (!Number.isInteger(maxHp) || maxHp < 1) throw new Error('Neplatné maximum HP.');
    const { data, error } = await db.from('characters')
      .update({ max_hp: maxHp, current_hp: maxHp }).eq('id', characterId).select(CHARACTER_FIELDS).single();
    if (error) throw error;
    if (!data) throw new Error('DB nevrátila aktualizovanou postavu.');
    return data;
  } catch (error) {
    console.error('Snížení maxima HP selhalo:', { characterId, error });
    throw error;
  }
}
