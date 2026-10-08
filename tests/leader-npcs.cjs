// Production homepage/navigation/NPC module with an isolated backend.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const server = http.createServer((req, res) => {
  const file = path.join(__dirname, '../public', new URL(req.url, 'http://local').pathname);
  try {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  try {
    const context = await browser.newContext();
    await context.route('**/config.local.js', route => route.fulfill({ contentType: 'application/javascript', body: "export const SUPABASE_URL='https://fixture.test'; export const SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';" }));
    await context.route('https://fixture.test/rest/v1/rpc/*', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
    let rows = [], creates = 0, deletes = 0, uploads = 0, reads = 0;
    let failRead = false, failCreate = false, imageError = null, deleteError = false, readGate = null, createGate = null;
    await context.exposeFunction('npcFixture', async (action, args) => {
      if (action === 'read') { reads++; const snapshot = structuredClone(rows); if (readGate) await readGate; if (failRead) throw Error('offline'); return snapshot; }
      if (action === 'create') {
        creates++; if (createGate) await createGate; if (failCreate) throw Error('offline');
        const id = 'npc-' + creates; rows.push({ id, name: args.p_name, image_url: null }); return id;
      }
      if (action === 'delete') { deletes++; if (deleteError) throw Error('unknown'); rows = rows.filter(r => r.id !== args.p_npc_id); return null; }
      if (action === 'upload' || action === 'remove') {
        uploads++; if (imageError) return { error: imageError };
        const row = rows.find(r => r.id === args.id); row.image_url = action === 'upload' ? 'npcs/' + args.id + '/image.png' : null;
        return { object_path: row.image_url, cleanup_pending: args.file === 'cleanup.png' };
      }
      throw Error('Unexpected API: ' + action);
    });
    await context.route('**/login.js', route => route.fulfill({ contentType: 'application/javascript', body: `
      export const getCurrentUser=()=>({role:new URL(location.href).searchParams.get('fixtureRole')||'leader',session_token:'fixture'});
      export const restoreSession=async()=>getCurrentUser(); export function mountLogin(){} export function logout(){} export async function handleSessionFailure(){}
    ` }));
    await context.route('**/token-api.js', route => route.fulfill({ contentType: 'application/javascript', body: `
      export const loadNpcDefinitions=()=>window.npcFixture('read');
      export const mutateNpc=(action,args)=>window.npcFixture(action,args);
      export function loadGameTokens(){throw Error('No map calls allowed')} export function mutateGameToken(){throw Error('No map calls allowed')} export function loadNpcs(){throw Error('No map calls allowed')}
    ` }));
    await context.route('**/portrait-api.js', route => route.fulfill({ contentType: 'application/javascript', body: `
      export async function portraitImageUrl(){return '/fixture.png'}
      async function write(action,id,file){const result=await window.npcFixture(action,{id,file:file?.name});if(result.error)throw Object.assign(new Error('fixture'),result.error);return result}
      export const uploadPortrait=(id,file)=>write('upload',id,file); export const removePortrait=id=>write('remove',id);
    ` }));
    await context.route('**/fixture.png', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=', 'base64') }));
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const url = `http://127.0.0.1:${server.address().port}/index.html`;
    const ready = () => page.waitForFunction(() => !document.querySelector('#leader-npc-submit').disabled);
    await page.goto(url + '?view=npcs&fixtureRole=player');
    assert.equal(await page.locator('#leader-npcs').isVisible(), false);
    assert.equal(await page.locator('#leader-npcs-link').isVisible(), false);
    assert.equal(reads, 0);
    const views = ['home', 'players', 'maps', 'npcs'];
    const labels = ['Domů', 'Hráči', 'Mapy', 'NPC'];
    async function checkNav(view) {
      const section = view === 'home' ? 'leader-content' : 'leader-' + view;
      await page.locator('#' + section).waitFor({ state: 'visible' });
      const nav = page.locator('.admin-nav:visible');
      assert.equal(await nav.count(), 1);
      assert.deepEqual(await nav.locator('a').allTextContents(), labels);
      assert.deepEqual(await nav.locator('[aria-current="page"]').allTextContents(), [labels[views.indexOf(view)]]);
      assert.equal(new URL(page.url()).searchParams.get('view'), view === 'home' ? null : view);
    }
    for (const from of views) {
      for (const to of views) {
        await page.goto(url + (from === 'home' ? '' : '?view=' + from));
        await checkNav(from);
        await page.locator('.admin-nav:visible').getByRole('link', { name: labels[views.indexOf(to)], exact: true }).click();
        await checkNav(to);
        await page.reload(); await checkNav(to);
        if (from !== to) {
          await page.goBack(); await checkNav(from);
          await page.goForward(); await checkNav(to);
        }
      }
    }
    for (const view of views) {
      await page.goto(url + '?fixtureRole=player' + (view === 'home' ? '' : '&view=' + view));
      await page.locator('#home-content').waitFor({ state: 'visible' });
      assert.equal(await page.locator('.admin-nav:visible').count(), 0);
    }
    await page.goto(url); await page.locator('#leader-npcs-link').click(); await ready();
    assert.match(await page.locator('#npcs-status').innerText(), /Zatím/);
    await page.locator('#leader-npc-name').fill('   '); await page.locator('#leader-npc-submit').click(); assert.equal(creates, 0);
    await page.locator('#leader-npc-name').fill('Goblin');
    let releaseCreate; createGate = new Promise(resolve => { releaseCreate = resolve; });
    await page.locator('#leader-npc-submit').click();
    await page.locator('#leader-npc-form').evaluate(form => form.dispatchEvent(new Event('submit', { cancelable: true })));
    assert.equal(creates, 1); releaseCreate(); createGate = null; await ready();
    assert.equal(await page.locator('.npc-card').count(), 1);
    const image = { name: 'image.png', mimeType: 'image/png', buffer: Buffer.from('fixture') };
    await page.locator('#leader-npc-name').fill('With image'); await page.locator('#leader-npc-image').setInputFiles(image);
    await page.locator('#leader-npc-submit').click(); await ready();
    assert.equal(creates, 2); assert.equal(uploads, 1);
    // A failed upload keeps the newly created definition for a retry.
    imageError = { outcome_unknown: true };
    await page.locator('#leader-npc-name').fill('Partial image'); await page.locator('#leader-npc-image').setInputFiles(image);
    await page.locator('#leader-npc-submit').click(); await ready();
    const createdBeforeRetry = creates;
    assert.match(await page.locator('#npcs-status').innerText(), /vytvořeno.*obrázek/);
    imageError = null;
    await page.locator('#leader-npc-submit').click(); await ready();
    assert.equal(creates, createdBeforeRetry);
    assert.ok(rows.at(-1).image_url);
    const card = page.locator('.npc-card').first();
    await card.locator('input').setInputFiles({ ...image, name: 'cleanup.png' }); await ready();
    await page.waitForFunction(() => document.querySelector('#npcs-status').textContent.includes('úklid'));
    await card.locator('input').setInputFiles(image); await ready();
    await card.getByRole('button', { name: 'Odstranit obrázek' }).click(); await ready(); assert.equal(rows[0].image_url, null);
    imageError = { status: 409 }; failRead = true;
    await card.locator('input').setInputFiles(image);
    await page.waitForFunction(() => document.querySelector('#npcs-status').textContent.includes('zablokované'));
    assert.equal(await page.locator('#leader-npc-submit').isDisabled(), true);
    imageError = null; failRead = false; await page.locator('#npcs-reload').click(); await ready();
    let confirm = false; page.on('dialog', dialog => { assert.match(dialog.message(), /všech mapách/); return confirm ? dialog.accept() : dialog.dismiss(); });
    await card.getByRole('button', { name: 'Smazat NPC' }).click(); assert.equal(deletes, 0);
    confirm = true; deleteError = true;
    await card.getByRole('button', { name: 'Smazat NPC' }).click(); await ready();
    assert.match(await page.locator('#npcs-status').innerText(), /nebyl potvrzen/); assert.equal(rows.length, 3);
    deleteError = false; await card.getByRole('button', { name: 'Smazat NPC' }).click(); await ready(); assert.equal(rows.length, 2);
    failCreate = true; await page.locator('#leader-npc-name').fill('Failure'); await page.locator('#leader-npc-submit').click(); await ready();
    assert.match(await page.locator('#npcs-status').innerText(), /nebylo potvrzeno/); failCreate = false;
    await page.reload(); await ready(); assert.equal(await page.locator('.npc-card').count(), 2);
    await page.locator('#npcs-home-nav').click(); await page.goBack(); await ready();
    await page.goForward(); assert.equal(await page.locator('#leader-npcs').isVisible(), false);
    let releaseRead; readGate = new Promise(resolve => { releaseRead = resolve; });
    await page.locator('#leader-npcs-link').click(); await page.locator('#npcs-home-nav').click();
    releaseRead(); readGate = null;
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 50)));
    assert.equal(await page.locator('#leader-npcs').isVisible(), false);
    assert.equal(await page.locator('#leader-npcs-list li').count(), 0);
    await page.locator('#leader-npcs-link').click(); await ready();
    await page.setViewportSize({ width: 375, height: 667 });
    assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log('PASS: homepage NPC roles, CRUD/images, conflicts, failures, duplicate submit, stale reads, refresh/history and mobile');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
