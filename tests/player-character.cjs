const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/characters.js', 'utf8').replaceAll('export ', '');
const row = { id: 'character-a', user_id: 'player-a', name: 'Test', level: 1,
  background: 'Učenec', inventory: '- Kniha\n- Lano', notes: '# Výuka\nPoznámky' };
function api(token = 'player-token') {
  const calls = [];
  const db = { rpc(name, args) { calls.push({ name, args }); return Promise.resolve({ data: [{ ...row, ...args.p_patch }], error: null }); } };
  const context = vm.createContext({ db });
  vm.runInContext(`${source}`, context);
  return { calls, load: () => vm.runInContext(`loadCharacter(db, 'character-a', ${JSON.stringify(token)})`, context),
    update: (field = 'name', value = 'New') => vm.runInContext(`updateCharacterField(db, 'character-a', ${JSON.stringify(field)}, ${JSON.stringify(value)}, ${JSON.stringify(token)})`, context),
    lower: () => vm.runInContext(`lowerCharacterHp(db, 'character-a', 5, ${JSON.stringify(token)})`, context) };
}
(async () => {
  const client = api();
  assert.deepEqual(await client.load(), row);
  assert.equal(client.calls[0].name, 'player_character');
  assert.equal(client.calls[0].args.p_session_token, 'player-token');
  assert.equal(client.calls[0].args.p_character_id, 'character-a');
  await client.update();
  assert.equal(client.calls[1].name, 'player_update_character');
  assert.equal(client.calls[1].args.p_patch.name, 'New');
  await client.lower();
  assert.equal(client.calls[2].args.p_patch.max_hp, 5);
  for (const [field, value] of [['ac', 15], ['ac', null], ['ac_note', 'kožená zbroj + obratnost']]) {
    await client.update(field, value);
    assert.equal(client.calls.at(-1).name, 'player_update_character');
    assert.equal(client.calls.at(-1).args.p_session_token, 'player-token');
    assert.equal(client.calls.at(-1).args.p_patch[field], value);
  }
  // Transport contract only; normalization, types and limits are tested in SQL.
  for (const field of ['background', 'inventory', 'notes']) {
    for (const value of ['Text\n  s mezerami', '', null]) {
      const updated = await client.update(field, value);
      const call = client.calls.at(-1);
      assert.equal(call.name, 'player_update_character');
      assert.equal(call.args.p_session_token, 'player-token');
      assert.deepEqual(Object.keys(call.args.p_patch), [field]);
      assert.equal(call.args.p_patch[field], value);
      assert.deepEqual(updated, { ...row, [field]: value });
    }
  }
  const noToken = api(null);
  await assert.rejects(noToken.load(), /from/);
  assert.equal(noToken.calls.length, 0);
  console.log('PASS: player character read/update/lower use authorized RPCs and never send direct table calls when session exists');
})().catch(error => { console.error(error); process.exitCode = 1; });
