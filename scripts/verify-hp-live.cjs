// Explicit opt-in: mutates the configured test player's HP, then restores them.
// HP_TEST_PASSWORD must be supplied through the environment. No tokens/passwords
// or character data beyond the tested HP pair are printed.
const fs = require('node:fs');
const assert = require('node:assert/strict');
async function main() {
  if (process.env.HP_LIVE_TEST !== '1' || !process.env.HP_TEST_PASSWORD) {
    throw new Error('Set HP_LIVE_TEST=1 and HP_TEST_PASSWORD to run this live test');
  }
  const config = fs.readFileSync('public/config.local.js', 'utf8');
  const url = config.match(/SUPABASE_URL\s*=\s*["']([^"']+)/)?.[1];
  const key = config.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*["']([^"']+)/)?.[1];
  if (!url || !key) throw new Error('Missing Supabase configuration');
  async function rpc(name, args) {
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(args), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(`RPC ${name}: ${response.status}, ${data.code || 'unknown'}`);
      error.code = data.code; throw error;
    }
    assert.equal(data.length, 1, `Expected one row from ${name}`);
    return data[0];
  }
  const user = await rpc('login', { p_username: process.env.HP_TEST_USERNAME || 'testplayer', p_password: process.env.HP_TEST_PASSWORD });
  assert.equal(user.role, 'player');
  const args = { p_session_token: user.session_token, p_character_id: user.character_id };
  const pair = row => ({ current_hp: row.current_hp, max_hp: row.max_hp });
  const read = async () => pair(await rpc('player_character', args));
  const update = async patch => pair(await rpc('player_update_character', { ...args, p_patch: patch }));
  const original = await read();
  let last = original, changed = false;
  async function write(patch) {
    assert.deepEqual(await read(), last, 'Concurrent HP change detected; stopping test');
    last = await update(patch); changed = true;
    assert.deepEqual(await read(), last, 'Independent reload differs from RPC response');
    return last;
  }
  try {
    await write({ max_hp: Math.max(20, original.current_hp ?? 0) });
    await write({ current_hp: 10 });
    await write({ max_hp: 20 });
    assert.deepEqual(await write({ current_hp: 15 }), { current_hp: 15, max_hp: 20 });
    console.log('PASS A/F: current HP persists across independent RPC reads (15/20)');
    for (const [label, patch] of [['C', { current_hp: -1 }], ['D', { max_hp: -1 }], ['E', { current_hp: 25 }]]) {
      try {
        await write(patch);
        console.log(`FAIL ${label}: deployed server accepted invalid HP`);
        process.exitCode = 1;
        // Restore the valid test baseline immediately if old schema accepts E.
        await write({ max_hp: 20 });
        await write({ current_hp: 15 });
      } catch (error) {
        if (error.code !== '23514') throw error;
        assert.deepEqual(await read(), last, 'Rejected write changed stored HP');
        console.log(`PASS ${label}: invalid HP rejected with CHECK violation`);
      }
    }
    assert.deepEqual(await write({ max_hp: 10 }), { current_hp: 10, max_hp: 10 });
    console.log('PASS B/F: lowering maximum returns and persists 10/10');
  } finally {
    if (changed) {
      await write({ max_hp: original.max_hp });
      await write({ current_hp: original.current_hp });
      assert.deepEqual(await read(), original);
      console.log('RESTORED: original HP confirmed by independent read');
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
