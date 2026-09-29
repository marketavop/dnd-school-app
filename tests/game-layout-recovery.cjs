// Real HTML, CSS, map and panel modules; isolated session/backend fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const characterId = '12345678-1234-4321-9876-123456789abc';
const peerId = 'abcdefab-1234-4321-9876-abcdefabcdef';
let saved = { x: 350, y: 350 };
const writes = [];
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
    const context = await browser.newContext();
    await context.exposeFunction('fixtureTokens', () => [{ character_id: characterId, name: 'Test', ...saved }]);
    await context.exposeFunction('fixtureMove', (action, id, mapId, point) => {
      assert.equal(action, 'move');
      assert.equal(id, characterId);
      assert.equal(mapId, 'test-map');
      writes.push(point);
      saved = point;
      return saved;
    });
    await context.route('**/session-page.js', route => route.fulfill({ contentType: 'application/javascript', body: `
      export async function requireSession() { return {role:'player', character_id:location.search.includes('peer') ? '${peerId}' : '${characterId}', session_token:'fixture-session'}; }
    ` }));
    await context.route('**/game-session.js', route => route.fulfill({ contentType: 'application/javascript', body: `
      export function installGameSession() {
      window.getGameIdentity = () => ({role:'player', character_id:location.search.includes('peer') ? '${peerId}' : '${characterId}'});
      window.loadGameTokens = window.fixtureTokens;
      window.mutateGameToken = window.fixtureMove;
      window.loadNpcs = async () => [];
      }
    ` }));
    await context.route('**/config.local.js', route => route.fulfill({ contentType: 'application/javascript', body: `export const SUPABASE_URL='https://example.test'; export const SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';` }));
    await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'application/javascript', body: `
      export function createClient() { return {
        channel(name) { const bus = new BroadcastChannel(name), handlers = {};
          bus.onmessage = e => handlers[e.data.event]?.({payload:e.data.payload});
          const c = { on(type, filter, fn) {handlers[filter.event]=fn; return c}, subscribe(fn) {setTimeout(()=>fn?.('SUBSCRIBED'),0); return c}, async send(message) {bus.postMessage(message); return 'ok'}, close() {bus.close()} }; return c; },
        removeChannel(c) {c.close()},
        async rpc(name, args) {
          if (name !== 'player_character' || args.p_session_token !== 'fixture-session') throw new Error('Unexpected RPC');
          return {data:[{id:args.p_character_id, name:args.p_character_id === '${peerId}' ? 'Test Postava 2' : 'Test Postava', current_hp:10, max_hp:10, str:14, dex:12, con:10, int:16, wis:10, cha:8}]};
        },
        from(table) { return { select() {return this}, eq() {return this}, async single() {return {data:
          table === 'game_state' ? {active_map_id:'test-map'} :
          table === 'map_config' ? {cell_size:100} :
          {id:'${characterId}', name:'Test', current_hp:10, max_hp:10}
        }} }; }
      }; }
    ` }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const url = `http://127.0.0.1:${server.address().port}/game.html?mode=player`;
    async function ready() {
      await page.waitForFunction(() => {
        const token = document.querySelector('.token');
        return token && !token.hidden && !document.querySelector('#remove-token').disabled;
      });
    }
    async function geometry() {
      // Let ResizeObserver finish its production refit before measuring.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      return page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        const v = rect('#map-viewport'), m = rect('#map'), t = rect('.token');
        const a = rect('.map-area'), w = rect('.game-workspace');
        const panels = [...document.querySelectorAll('.game-workspace > aside')].filter(p => !p.hidden);
        const token = document.querySelector('.token');
        const scale = m.width / document.querySelector('#map').naturalWidth;
        return {
          width:v.width, height:v.height,
          fits: m.left >= v.left-1 && m.right <= v.right+1 && m.top >= v.top-1 && m.bottom <= v.bottom+1,
          fills: Math.abs(v.width-a.width)<1 && Math.abs(v.bottom-w.bottom)<1,
          full: Math.abs(a.width-w.width)<1,
          adjacent: panels.length <= 1 && panels.every(p => v.right <= p.getBoundingClientRect().left+1),
          coordinates: {x:parseFloat(token.style.left), y:parseFloat(token.style.top)},
          centered: Math.abs((t.left+t.width/2-m.left)/scale-parseFloat(token.style.left))<0.1 && Math.abs((t.top+t.height/2-m.top)/scale-parseFloat(token.style.top))<0.1,
          overflow: document.body.scrollWidth > innerWidth || document.body.scrollHeight > innerHeight,
        };
      });
    }
    await page.goto(url);
    await ready();
    const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(n => n.id));
    assert.equal(new Set(ids).size, ids.length, 'IDs must be unique');
    assert.equal(await page.locator('main > .game-workspace > .map-area > #map-viewport > #map-space').count(), 1);
    assert.doesNotMatch(await page.locator('body').innerText(), /Realtime spike|Pozice na mapě|Velikost pole|Připojeno\./);
    assert.equal(await page.getByRole('button', {name:'Odebrat postavu z mapy', exact:true}).isVisible(), true);
    assert.equal(await page.getByRole('button', {name:'Přizpůsobit mapu', exact:true}).isVisible(), true);
    await page.waitForFunction(() => document.querySelector('#game-character-name').textContent === 'Test Postava');
    assert.equal(await page.locator('footer, .dice-bar').count(), 0);
    assert.equal(await page.locator('[role="tab"]').count(), 2);
    await page.locator('#game-character-name').click();
    await page.getByRole('tab', {name:'Vlastnosti'}).click();
    assert.deepEqual(await page.locator('.ability-table thead th').allTextContents(), ['Vlastnost', 'Hodnota', 'Mod.', 'Záchrana']);
    await page.locator('#dice-toggle').click();
    await page.locator('#game-character-name').click();
    assert.equal(await page.getByRole('tab', {name:'Vlastnosti'}).getAttribute('aria-selected'), 'true');
    await page.locator('#game-character-name').click();
    for (const size of [{width:1280,height:800}, {width:768,height:600}, {width:375,height:667}]) {
      await page.setViewportSize(size);
      const closed = await geometry();
      assert.ok(closed.full && closed.fits && closed.fills && closed.centered && !closed.overflow);
      assert.ok(closed.height > size.height / 2);
      for (const toggle of ['#game-character-name', '#dice-toggle']) {
        await page.locator(toggle).click();
        const open = await geometry();
        assert.ok(open.width < closed.width && open.height === closed.height, JSON.stringify({size, toggle, closed, open}));
        assert.ok(open.adjacent && open.fits && open.fills && open.centered && !open.overflow);
        assert.deepEqual(open.coordinates, saved);
      }
      await page.locator('#dice-toggle').click();
      assert.equal((await geometry()).width, closed.width);
    }
    assert.equal(writes.length, 0, 'Panel toggles and refits must never write token coordinates');
    await page.setViewportSize({width:1280,height:800});
    await page.locator('#game-character-name').click();
    await geometry();
    const token = await page.locator('.token').boundingBox();
    const map = await page.locator('#map').boundingBox();
    const naturalWidth = await page.locator('#map').evaluate(img => img.naturalWidth);
    const scale = map.width / naturalWidth;
    await page.mouse.move(token.x+token.width/2, token.y+token.height/2);
    await page.mouse.down();
    await page.mouse.move(map.x+560*scale, map.y+460*scale, {steps:5});
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('#status').textContent === 'Uloženo do DB.');
    assert.deepEqual(saved, {x:550,y:450});
    assert.equal(writes.length, 1);
    await page.locator('#dice-toggle').click();
    const peer = await context.newPage();
    peer.on('pageerror', e => errors.push(e.message));
    await peer.goto(url + '&fixture=peer');
    await peer.waitForFunction(() => !document.querySelector('[data-die="20"]').disabled);
    assert.equal(await peer.locator('#game-character-name').textContent(), 'Test Postava 2');
    assert.deepEqual(await page.locator('[data-die]').evaluateAll(nodes => nodes.map(n => Number(n.dataset.die))), [4,6,8,10,12,20,100]);
    for (const sides of [4,6,8,10,12,20,100,4,6,8,12]) {
      await page.locator(`[data-die="${sides}"]`).click();
      const latest = await page.locator('#last-roll').textContent();
      assert.match(latest, new RegExp('^Test Postava · k'+sides+' → \\d+$'));
      await peer.waitForFunction(value => document.querySelector('#last-roll').textContent === value, latest);
    }
    assert.equal(await peer.locator('#dice-panel').isVisible(), false);
    await peer.locator('#dice-toggle').click();
    await peer.locator('[data-die="20"]').click();
    const latest = await peer.locator('#last-roll').textContent();
    assert.match(latest, /^Test Postava 2 · k20 → \d+$/);
    await page.waitForFunction(value => document.querySelector('#last-roll').textContent === value, latest);
    assert.equal(await page.locator('#roll-log li').count(), 10);
    assert.deepEqual(await page.locator('#roll-log li').allTextContents(), await peer.locator('#roll-log li').allTextContents());
    assert.equal((await page.locator('#roll-log li').allTextContents())[0], latest);
    await peer.close();
    await page.reload();
    await ready();
    assert.deepEqual((await geometry()).coordinates, saved);
    assert.equal(writes.length, 1);
    assert.deepEqual(errors, []);
    if (process.env.GAME_SCREENSHOT) await page.screenshot({path:process.env.GAME_SCREENSHOT});
    console.log('PASS: recovery DOM, responsive map/panel layout, real token drag/snap and reload with isolated backend');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; }).finally(() => server.close());
