// Bez závislostí: node tests/characters.cjs
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

(async () => {
  const source = readFileSync(resolve(__dirname, '../public/characters.js'), 'utf8');
  const { loadCharacter, updateCharacterField } = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  );
  const fields = ['id', 'user_id', 'name', 'portrait_path', 'race_code', 'class_code',
    'level', 'str', 'dex', 'con', 'int', 'wis', 'cha', 'xp', 'current_hp', 'max_hp'];
  const row = Object.fromEntries(fields.map(field => [field, null]));
  Object.assign(row, { id: 'character-a', user_id: 'account-a', name: 'Test' });
  const other = { ...row, id: 'character-b' };
  const rows = [row, other];
  const calls = [];
  const logs = [];
  let failure = null;
  const db = {
    from(table) {
      assert.equal(table, 'characters');
      const call = { table };
      calls.push(call);
      return {
        select(columns) { assert.equal(columns, fields.join(',')); return this; },
        eq(key, value) { assert.equal(key, 'id'); call.id = value; return this; },
        update(patch) { assert.equal(Object.keys(patch).length, 1); call.patch = patch; return this; },
        async single() {
          if (failure?.throws) throw failure.error;
          if (failure) return { data: null, error: failure.error };
          const target = rows.find(candidate => candidate.id === call.id);
          if (!target) return { data: null, error: { code: 'PGRST116', message: 'No row' } };
          if (call.patch) Object.assign(target, call.patch);
          return { data: { ...target }, error: null };
        },
      };
    },
  };
  const originalError = console.error;
  console.error = (...args) => logs.push(args);
  try {
    assert.deepEqual(await loadCharacter(db, row.id), row);
    for (const field of fields.slice(3)) assert.equal(row[field], null);
    for (const [field, value] of [
      ['str', 15], ['str', null], ['name', 'Eliška'], ['portrait_path', 'portraits/a.png'],
      ['race_code', 'elf'], ['race_code', null], ['class_code', 'wizard'],
      ['level', 1], ['dex', 12], ['con', 13], ['int', 14], ['wis', 15], ['cha', 16],
    ]) {
      const before = { ...row };
      assert.deepEqual(await updateCharacterField(db, row.id, field, value), { ...before, [field]: value });
      assert.deepEqual(await loadCharacter(db, row.id), { ...before, [field]: value });
    }
    for (const field of fields.slice(3)) {
      await updateCharacterField(db, row.id, field, null);
      assert.equal((await loadCharacter(db, row.id))[field], null);
    }
    assert.equal(other.name, 'Test');
    assert.equal(other.str, null);
    assert.equal(logs.length, 0);

    for (const field of ['id', 'user_id', 'unknown', '__proto__', 'toString']) {
      const count = calls.length;
      await assert.rejects(updateCharacterField(db, row.id, field, 'changed'), /Nepovolené/);
      assert.equal(calls.length, count, 'Forbidden field must not reach Supabase');
    }
    await assert.rejects(updateCharacterField(db, row.id, 'str', undefined), /undefined/);
    assert.equal(row.id, 'character-a');
    assert.equal(row.user_id, 'account-a');

    // Simulace odpovědí Supabase, nikoli ověření skutečných DB constraintů/RLS.
    const constraint = { code: '23514', message: 'characters_str_check' };
    failure = { error: constraint };
    await assert.rejects(updateCharacterField(db, row.id, 'str', 25), error => error === constraint);
    assert.deepEqual(calls.at(-1).patch, { str: 25 }, 'Range validation belongs to the database');
    assert.equal(row.str, null);
    assert.equal(logs.at(-1)[1].error, constraint);

    for (const operation of [
      () => loadCharacter(db, row.id),
      () => updateCharacterField(db, row.id, 'str', 15),
    ]) {
      for (const mode of [
        { error: { code: '42501', message: 'Permission denied' } },
        { throws: true, error: new Error('Network failed') },
      ]) {
        failure = mode;
        const count = logs.length;
        await assert.rejects(operation(), error => error === mode.error);
        assert.equal(logs.length, count + 1);
        assert.equal(logs.at(-1)[1].error, mode.error);
      }
    }
    failure = null;
    await assert.rejects(loadCharacter(db, 'missing'), error => error.code === 'PGRST116');
    await assert.rejects(updateCharacterField(db, 'missing', 'str', 15), error => error.code === 'PGRST116');
    assert.equal(rows.length, 2, 'Update must not insert a character');
    // Ani neočekávaná prázdná odpověď bez error nesmí znamenat úspěch.
    failure = { error: null };
    await assert.rejects(loadCharacter(db, row.id), /nevrátila/);
    await assert.rejects(updateCharacterField(db, row.id, 'str', 15), /nevrátila/);
  } finally {
    console.error = originalError;
  }
  console.log('PASS: character fields, NULL, scoped single-field update/reload, allowlist, logged/rethrown DB and network errors, missing rows');
})().catch(error => { console.error(error); process.exitCode = 1; });
