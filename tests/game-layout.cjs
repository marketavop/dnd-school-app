const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const idA = '12345678-1234-4321-9876-123456789abc';
const idB = 'abcdefab-1234-4321-9876-abcdefabcdef';
const writes = [];
const rows = {
  [idA]: { id: idA, name: 'Eliška', current_hp: 12, max_hp: 20, class_code: 'wizard', level: 5, str: 8, dex: 14, con: 12, int: 16, wis: 13, cha: null },
  [idB]: { id: idB, name: 'Jiná postava', current_hp: 3, max_hp: 8, class_code: null, level: null, str: 18, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
};
let failWrite = false;
const server = http.createServer((req, res) => {
  const file = path.join(__dirname, '../public', new URL(req.url, 'http://local').pathname);
  try {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html');
    res.end(fs.readFileSync(file));
  } catch { res.statusCode = 404; res.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await context.route('**/config.local.js', route => route.fulfill({ contentType: 'application/javascript', body: `export const SUPABASE_URL='https://example.test'; export const SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';` }));
    await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'application/javascript', body: `export function createClient() { return { channel(name) {
      const bus = new BroadcastChannel(name); const handlers = {};
      bus.onmessage = e => handlers[e.data.event]?.({payload:e.data.payload});
      const channel = { on(type, filter, fn) { handlers[filter.event]=fn; return channel; },
        subscribe(fn) { setTimeout(()=>fn('SUBSCRIBED'),0); return channel; },
        async send(message) { bus.postMessage(message); return 'ok'; }, close() { bus.close(); } };
      return channel;
    }, removeChannel(channel) { channel.close(); }, from(table) { let id, patch; return { select() { return this; }, eq(key,value) { id=value; return this; }, update(value) { patch=value; return this; }, async single() { return await window.testDb({table,id,patch}); } }; } }; }` }));
    await context.exposeFunction('testDb', ({ table, id, patch }) => {
      assert.equal(table, 'characters');
      if (patch) {
        writes.push({ id, patch });
        if (failWrite) return { error: { message: 'test failure' } };
        Object.assign(rows[id], patch);
      }
      return { data: rows[id] ?? null };
    });
    // Layout smoke uses the unchanged production fitMap/ResizeObserver; map behavior has separate regression suites.
    const fit = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8').split("const grid =")[0];
    await context.route('**/app.js', route => route.fulfill({ contentType: 'application/javascript', body: fit + `map.onload = () => { mapSpace.style.width = map.naturalWidth+'px'; mapSpace.style.height = map.naturalHeight+'px'; fitMap(); }; map.src='./assets/maps/test-map.png'; map.hidden=false;` }));
    const url = `http://127.0.0.1:${server.address().port}/game.html`;
    await page.goto(url + '?character_id=' + idA);
    await page.waitForFunction(() => document.querySelector('#game-character-name').textContent === 'Eliška');
    assert.equal(await page.locator('#character-panel').isVisible(), false);
    assert.equal(await page.locator('footer, .dice-bar, #diary-toggle').count(), 0);
    const closed = await page.locator('#map-viewport').boundingBox();
    await page.locator('#game-character-name').click();
    const opened = await page.locator('#map-viewport').boundingBox();
    assert.ok(opened.width < closed.width);
    assert.equal(opened.height, closed.height);
    assert.equal(await page.getByRole('tab').count(), 2);
    async function checkPanels(character, dice) {
      assert.equal(await page.locator('#character-panel').isVisible(), character);
      assert.equal(await page.locator('#dice-panel').isVisible(), dice);
      assert.equal(await page.locator('#game-character-name').getAttribute('aria-expanded'), String(character));
      assert.equal(await page.locator('#dice-toggle').getAttribute('aria-expanded'), String(dice));
      assert.ok(await page.locator('.game-workspace > aside:visible').count() <= 1);
    }
    await page.getByRole('tab', { name: 'Vlastnosti' }).click();
    await page.locator('#dice-toggle').click();
    await checkPanels(false, true);
    assert.equal((await page.locator('#map-viewport').boundingBox()).width, opened.width);
    await page.locator('#dice-toggle').click();
    await checkPanels(false, false);
    await page.locator('#dice-toggle').click();
    await checkPanels(false, true);
    await page.locator('#game-character-name').click();
    await checkPanels(true, false);
    assert.equal(await page.getByRole('tab', { name: 'Vlastnosti' }).getAttribute('aria-selected'), 'true');
    await page.locator('#game-character-name').click();
    await checkPanels(false, false);
    await page.locator('#game-character-name').click();
    await page.getByRole('tab', { name: 'Vlastnosti' }).press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'Přehled' }).getAttribute('aria-selected'), 'true');
    await page.getByRole('tab', { name: 'Přehled' }).press('ArrowLeft');
    assert.equal(await page.getByRole('tab', { name: 'Vlastnosti' }).getAttribute('aria-selected'), 'true');
    await page.locator('#dice-toggle').click();
    await page.waitForFunction(() => !document.querySelector('[data-die="20"]').disabled);
    const peer = await context.newPage();
    await peer.goto(url + '?character_id=' + idB);
    await peer.waitForFunction(() => !document.querySelector('[data-die="20"]').disabled);
    const expected = [];
    for (const n of [4,6,8,10,12,20,100,4,6,8,12,20]) {
      await page.getByRole('button', { name: 'Hodit k'+n, exact:true }).click();
      const latest = await page.locator('#last-roll').textContent();
      await peer.waitForFunction(latest => document.querySelector('#last-roll').textContent === latest, latest);
      const result = Number(latest.split(' → ')[1]);
      assert.ok(result >= 1 && result <= n);
      expected.unshift('Eliška · k'+n+' → '+result);
    }
    assert.deepEqual(await peer.locator('#roll-log li').allTextContents(), expected.slice(0,10));
    // Realtime se aktualizuje i při zavřeném panelu přijímajícího klienta.
    assert.equal(await peer.locator('#character-panel').isVisible(), false);
    await peer.locator('#dice-toggle').click();
    await peer.getByRole('button', { name: 'Hodit k6', exact:true }).dblclick();
    await page.waitForFunction(() => document.querySelector('#last-roll').textContent.startsWith('Jiná postava: k6'));
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#roll-log li').count(),10);
    assert.deepEqual(await page.locator('#roll-log li').allTextContents(),await peer.locator('#roll-log li').allTextContents());
    assert.ok((await page.locator('#roll-log li').allTextContents()).slice(0,2).every(v => v.startsWith('Jiná postava · k6 →')));
    await peer.close();
    if (process.env.GAME_SCREENSHOT) await page.screenshot({ path: process.env.GAME_SCREENSHOT });
    await page.locator('#game-character-name').click();
    await page.getByRole('tab', { name: 'Vlastnosti' }).click();
    assert.equal(await page.locator('#compact-modifier-str').textContent(), '-1');
    assert.equal(await page.locator('#compact-save-int').textContent(), '+6');
    assert.equal(await page.locator('#compact-cha').textContent(), '—');
    await page.getByRole('tab', { name: 'Přehled' }).click();
    await page.locator('#compact-hp-delta').fill('5');
    await page.getByRole('button', { name: 'Ubrat HP' }).click();
    await page.waitForFunction(() => document.querySelector('#compact-current-hp').textContent === '7');
    assert.deepEqual(writes.at(-1), { id: idA, patch: { current_hp: 7 } });
    assert.equal(rows[idB].current_hp, 3);
    failWrite = true;
    await page.getByRole('button', { name: 'Přidat HP' }).click();
    await page.waitForFunction(() => document.querySelector('#compact-hp-error').textContent.includes('Nepodařilo'));
    assert.equal(await page.locator('#compact-current-hp').textContent(), '7');
    failWrite = false;
    await page.locator('#dice-toggle').click();
    for (const size of [{width:1280,height:800},{width:768,height:600},{width:375,height:667}]) {
      await page.setViewportSize(size);
      await page.waitForTimeout(80);
      const geometry = await page.evaluate(() => {
        const v = document.querySelector('#map-viewport');
        const m = document.querySelector('#map').getBoundingClientRect();
        const r = v.getBoundingClientRect();
        const panel = document.querySelector('#dice-panel');
        const p = panel.getBoundingClientRect();
        return { fits: m.left >= r.left-1 && m.right <= r.right+1 && m.top >= r.top-1 && m.bottom <= r.bottom+1,
          noOverlap: r.right <= p.left+1,
          noScroll: v.scrollWidth === v.clientWidth && v.scrollHeight === v.clientHeight && panel.scrollWidth === panel.clientWidth,
          fullHeight: Math.abs(r.bottom-innerHeight)<1,
          body: document.body.scrollWidth <= innerWidth,
          dice: [...document.querySelectorAll('[data-die]')].every(button => { const b=button.getBoundingClientRect(); return b.width>=44 && b.height>=44 && b.left>=p.left && b.right<=p.right && b.bottom<=innerHeight; }) };
      });
      assert.deepEqual(geometry, { fits:true, noOverlap:true, noScroll:true, fullHeight:true, body:true, dice:true });
      const diceWidth=(await page.locator('#dice-panel').boundingBox()).width;
      await page.locator('#game-character-name').click();
      await checkPanels(true, false);
      assert.equal((await page.locator('#character-panel').boundingBox()).width,diceWidth);
      await page.locator('#dice-toggle').click();
      await checkPanels(false, true);
      await page.locator('#dice-toggle').click();
      await checkPanels(false, false);
      await page.waitForTimeout(80);
      const closedWidth=(await page.locator('#map-viewport').boundingBox()).width;
      await page.locator('#dice-toggle').click();
      await page.waitForTimeout(80);
      assert.ok((await page.locator('#map-viewport').boundingBox()).width<closedWidth);
    }
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#compact-current-hp').textContent === '7');
    assert.equal(await page.locator('#character-panel').isVisible(), false);
    await checkPanels(false, false);
    await page.locator('#game-character-name').click();
    assert.equal(await page.getByRole('tab', {name:'Přehled'}).getAttribute('aria-selected'),'true');
    await page.goto(url + '?character_id=' + idB);
    await page.waitForFunction(() => document.querySelector('#game-character-name').textContent === 'Jiná postava');
    assert.equal(await page.locator('#compact-current-hp').textContent(), '3');
    assert.equal(await page.locator('#compact-str').textContent(), '18');
    assert.deepEqual(errors, []);
    console.log('PASS: game layout, responsive fit, tabs, HP persistence/failure, isolated URL character contexts');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());

