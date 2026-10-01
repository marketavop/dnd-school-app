// Run after map-delete-migration.sql, ONLY in its disposable fixture database.
// MAP_DELETE_TEST_DATABASE_URL=... node tests/map-delete-race.cjs
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const url = process.env.MAP_DELETE_TEST_DATABASE_URL;
if (!url) throw new Error('Set MAP_DELETE_TEST_DATABASE_URL to the disposable map-delete fixture DB');
const sql = statement => execFileSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', url, '-c', statement], { encoding: 'utf8' }).trim();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function connection(name) {
  const p = spawn('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', url], {
    env: { ...process.env, PGAPPNAME: name }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = '', errors = '';
  p.stdout.on('data', chunk => { output += chunk; });
  p.stderr.on('data', chunk => { errors += chunk; });
  const done = new Promise((resolve, reject) => {
    p.on('error', reject); p.on('close', code => resolve({ code, errors }));
  });
  return { p, done, output: () => output };
}
async function until(check) {
  for (let i = 0; i < 100; i++) { if (check()) return; await delay(50); }
  throw new Error('Concurrency barrier timed out');
}
(async () => {
  assert.equal(sql("SELECT count(*) FROM app_private.maps WHERE map_id IN ('active','other')"), '2');
  for (const first of ['activate', 'delete']) {
    sql("UPDATE public.game_state SET active_map_id='active' WHERE id=1; INSERT INTO app_private.maps VALUES('race','local') ON CONFLICT DO NOTHING; INSERT INTO public.map_config VALUES('race',100) ON CONFLICT DO NOTHING;");
    const a = connection('map-delete-race-a'), b = connection('map-delete-race-b');
    const activate = "SELECT * FROM public.leader_set_active_map('leader','race');";
    const remove = "SELECT * FROM public.leader_delete_map('leader','race');";
    try {
      a.p.stdin.write(`BEGIN; ${first === 'activate' ? activate : remove} SELECT 'LOCK_HELD';\n`);
      await until(() => a.output().includes('LOCK_HELD'));
      b.p.stdin.end(first === 'activate' ? remove : activate);
      await until(() => sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='map-delete-race-b' AND wait_event_type='Lock'") === '1');
      a.p.stdin.end('COMMIT;\n');
      assert.equal((await a.done).code, 0);
      const second = await b.done;
      assert.notEqual(second.code, 0);
      assert.match(second.errors, first === 'activate' ? /Active map cannot be deleted/ : /Unknown prepared map/);
      assert.equal(sql('SELECT count(*) FROM public.game_state g LEFT JOIN app_private.maps m ON m.map_id=g.active_map_id WHERE g.id=1 AND m.map_id IS NULL'), '0');
      assert.equal(sql("SELECT active_map_id FROM public.game_state WHERE id=1"), first === 'activate' ? 'race' : 'active');
    } finally { a.p.kill(); b.p.kill(); }
  }
  console.log('PASS: real two-connection activate/delete serialization in both orders');
})().catch(error => { console.error(error); process.exitCode = 1; });
