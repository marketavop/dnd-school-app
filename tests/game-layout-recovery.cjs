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
const overview = { ac: 16, level: 5, dex: 14, inventory: '# Výbava\n- **Meč**\n- *Lano*\n- [x] Pochodeň\n- [ ] Jídlo\n<script>window.inventoryExecuted=true</script>\n<img src=x onerror="window.inventoryExecuted=true">\n' + 'DlouhýInventář'.repeat(100) };
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
    const context = await browser.newContext({ hasTouch: true });
    await context.exposeFunction('fixtureOverview', id => id === characterId ? overview : { ac: null, level: null, dex: 8 });
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
      export function createClient() { let currentHp = 10; return {
        channel(name) { const bus = new BroadcastChannel(name), handlers = {};
          bus.onmessage = e => handlers[e.data.event]?.({payload:e.data.payload});
          const c = { on(type, filter, fn) {handlers[filter.event]=fn; return c}, subscribe(fn) {setTimeout(()=>fn?.('SUBSCRIBED'),0); return c}, async send(message) {bus.postMessage(message); return 'ok'}, close() {bus.close()} }; return c; },
        removeChannel(c) {c.close()},
        async rpc(name, args) {
          if (!['player_character', 'player_update_character'].includes(name) || args.p_session_token !== 'fixture-session') throw new Error('Unexpected RPC');
          if (name === 'player_update_character') {
            if (Object.keys(args.p_patch).join() !== 'current_hp') throw new Error('Only HP may be edited');
            currentHp = args.p_patch.current_hp;
          }
          return {data:[{id:args.p_character_id, name:args.p_character_id === '${peerId}' ? 'Test Postava 2' : 'Test Postava', current_hp:currentHp, max_hp:10, str:14, dex:12, con:10, int:16, wis:10, cha:8, ...await window.fixtureOverview(args.p_character_id)}]};
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
          width:v.width, height:v.height, toolbarHeight:rect('.map-toolbar').height,
          fits: m.left >= v.left-1 && m.right <= v.right+1 && m.top >= v.top-1 && m.bottom <= v.bottom+1,
          fills: Math.abs(v.width-a.width)<1 && Math.abs(v.bottom-w.bottom)<1,
          full: Math.abs(a.width-w.width)<1,
          adjacent: panels.length <= 1 && panels.every(p => v.right <= p.getBoundingClientRect().left+1),
          overlay: panels.length===1 && ['character-panel','dice-panel'].includes(panels[0].id) && panels[0].getBoundingClientRect().right<=w.right+1 && panels[0].getBoundingClientRect().left>=w.left && panels[0].getBoundingClientRect().bottom<=w.bottom+1,
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
    assert.equal(await page.locator('#compact-ac').textContent(), '16');
    assert.equal(await page.locator('#compact-level').textContent(), '5');
    assert.equal(await page.locator('#compact-initiative').textContent(), '+2');
    overview.ac = 18;
    overview.level = 6;
    overview.dex = 10;
    await page.reload();
    await ready();
    await page.waitForFunction(() => document.querySelector('#compact-ac').textContent === '18');
    assert.equal(await page.locator('#compact-level').textContent(), '6');
    assert.equal(await page.locator('#compact-initiative').textContent(), '0');
    assert.equal(await page.locator('footer, .dice-bar').count(), 0);
    assert.equal(await page.locator('[role="tab"]').count(), 2);
    assert.deepEqual(await page.getByRole('tab', {includeHidden:true}).allTextContents(), ['Přehled', 'Inventář']);
    assert.equal(await page.locator('#overview-tab').getAttribute('aria-selected'), 'true');
    await page.locator('#game-character-name').click();
    await page.getByRole('tab', {name:'Inventář', exact:true}).click();
    assert.equal(await page.locator('#game-inventory h2').textContent(), 'Výbava');
    assert.equal(await page.locator('#game-inventory strong').textContent(), 'Meč');
    assert.equal(await page.locator('#game-inventory em').textContent(), 'Lano');
    assert.deepEqual(await page.locator('#game-inventory .markdown-checkbox').allTextContents(), ['☑', '☐']);
    assert.equal(await page.locator('#game-inventory input, #game-inventory script, #game-inventory img, #inventory-panel textarea').count(), 0);
    assert.equal(await page.evaluate(() => window.inventoryExecuted), undefined);
    assert.equal(await page.locator('#inventory-edit-link').getAttribute('href'), `./character.html?character_id=${characterId}&tab=inventory`);
    assert.equal(await page.locator('#inventory-edit-link').getAttribute('target'), '_top');
    await page.getByRole('tab', {name:'Inventář', exact:true}).press('Home');
    assert.equal(await page.locator('#overview-panel').isVisible(), true);
    await page.locator('#compact-hp-delta').fill('2');
    await page.locator('#compact-hp-minus').click();
    await page.waitForFunction(() => document.querySelector('#compact-current-hp').textContent === '8');
    await page.locator('#compact-hp-plus').click();
    await page.waitForFunction(() => document.querySelector('#compact-current-hp').textContent === '10');
    assert.equal(await page.locator('#compact-ac').textContent(), '18');
    assert.equal(await page.locator('#compact-level').textContent(), '6');
    await page.getByRole('tab', {name:'Přehled'}).click();
    assert.deepEqual(await page.locator('.ability-table thead th').allTextContents(), ['Vlastnost', 'Score', 'Mod.', 'Save']);
    await page.locator('#dice-toggle').click();
    await page.locator('#game-character-name').click();
    assert.equal(await page.getByRole('tab', {name:'Přehled'}).getAttribute('aria-selected'), 'true');
    await page.locator('#game-character-name').click();
    for (const size of [{width:1920,height:1080}, {width:1440,height:900}, {width:412,height:924}, {width:924,height:412}, {width:768,height:1024}, {width:1024,height:768}, {width:375,height:667}, {width:320,height:667}]) {
      await page.setViewportSize(size);
      const closed = await geometry();
      assert.ok(closed.full && closed.fits && closed.fills && closed.centered && !closed.overflow);
      assert.ok(closed.height > size.height / 2);
      for (const toggle of ['#game-character-name', '#dice-toggle']) {
        await page.locator(toggle).click();
        const open = await geometry();
        // Wrapped map actions use more height when a mobile side panel narrows the map.
        const overlay = true;
        assert.ok((overlay ? open.width===closed.width && open.height===closed.height : open.width < closed.width && Math.abs((open.height + open.toolbarHeight) - (closed.height + closed.toolbarHeight)) < 1), JSON.stringify({size, toggle, closed, open}));
        assert.ok((overlay ? open.overlay : open.adjacent) && open.fits && open.fills && open.centered && !open.overflow);
        assert.deepEqual(open.coordinates, saved);
        if (toggle === '#game-character-name') {
          await page.getByRole('tab', {name:'Přehled', exact:true}).click();
          assert.deepEqual(await page.locator('#overview-panel dt').allTextContents(), ['AC', 'Level', 'Iniciativa']);
          const overviewLayout = await page.evaluate(() => {
            const rect = selector => document.querySelector(selector).getBoundingClientRect();
            const panel = document.querySelector('#character-panel');
            const p = panel.getBoundingClientRect();
            const hp = rect('.hp-values'), controls = rect('.hp-adjust');
            const ac = document.querySelector('#compact-ac').parentElement.getBoundingClientRect();
            const level = document.querySelector('#compact-level').parentElement.getBoundingClientRect();
            const initiative = document.querySelector('#compact-initiative').parentElement.getBoundingClientRect();
            const fontSize = selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
            return {
              ordered: hp.bottom <= controls.top && controls.bottom <= ac.top && ac.bottom <= initiative.top,
              equalCards: Math.abs(ac.width-level.width)<1 && Math.abs(ac.height-level.height)<1 && ac.top===level.top && ac.right<=level.left,
              prominentHp: ['#compact-ac', '#compact-level', '#compact-initiative'].every(selector => fontSize('#compact-current-hp') > fontSize(selector)),
              expectedWidth: Math.abs(p.width - Math.min(380, innerWidth-24))<1,
              noOverflow: panel.scrollWidth===panel.clientWidth && document.documentElement.scrollWidth<=innerWidth,
              touchControls: [...document.querySelectorAll('.hp-adjust button, .hp-adjust input')].every(element => {
                const r = element.getBoundingClientRect();
                return r.width>=44 && r.height>=44 && r.left>=p.left && r.right<=p.right;
              }),
            };
          });
          assert.deepEqual(overviewLayout, {ordered:true, equalCards:true, prominentHp:true, expectedWidth:true, noOverflow:true, touchControls:true}, JSON.stringify(size));
          await page.getByRole('tab', {name:'Přehled', exact:true}).click();
          assert.equal(await page.locator('#overview-panel').isVisible(), true);
          assert.equal(await page.locator('#overview-panel > .ability-table').count(), 1);
          assert.ok(await page.locator('#overview-panel').evaluate(panel => panel.querySelector('.overview-stats').getBoundingClientRect().bottom <= panel.querySelector('.ability-table').getBoundingClientRect().top));
          const abilities = await page.locator('.ability-table').evaluate(table => {
            const panel = table.closest('aside');
            return { rows: table.tBodies[0].rows.length, icons: table.querySelectorAll('tbody th[scope="row"] svg[aria-hidden="true"]').length,
              columns: table.querySelectorAll('thead th[scope="col"]').length,
              compactHeaders: [...table.tHead.rows[0].cells].slice(1).every((header, index) => {
                const range = document.createRange();
                range.selectNodeContents(header);
                const text = range.getBoundingClientRect(), cell = header.getBoundingClientRect();
                return range.getClientRects().length===1 && text.left>=cell.left && text.right<=cell.right &&
                  [...table.tBodies[0].rows].every(row => {
                    const value = row.cells[index+1].getBoundingClientRect();
                    return Math.abs((cell.left+cell.right)-(value.left+value.right))<1;
                  });
              }),
              fits: panel.scrollWidth===panel.clientWidth && document.documentElement.scrollWidth<=innerWidth };
          });
          assert.deepEqual(abilities, {rows:6, icons:6, columns:4, compactHeaders:true, fits:true});
          await page.getByRole('tab', {name:'Inventář', exact:true}).click();
          assert.equal(await page.locator('#inventory-panel').isVisible(), true);
          assert.ok(await page.locator('#character-panel').evaluate(panel => panel.scrollWidth===panel.clientWidth && document.documentElement.scrollWidth<=innerWidth && getComputedStyle(panel).overflowY==='auto'));
          await page.locator('#inventory-edit-link').scrollIntoViewIfNeeded();
          await page.getByRole('tab', {name:'Přehled', exact:true}).click();
        }
      }
      await page.locator('#dice-toggle').click();
      assert.equal((await geometry()).width, closed.width);
      {
        const camera = () => page.locator('#map-space').evaluate(node => ({transform:node.style.transform, left:node.style.left, top:node.style.top}));
        const viewport = await page.locator('#map-viewport').boundingBox();
        const initial = await camera();
        await page.mouse.move(viewport.x+12, viewport.y+20);
        await page.mouse.wheel(0, -180);
        await page.waitForFunction(initial => document.querySelector('#map-space').style.transform!==initial.transform, initial);
        await page.mouse.down();
        await page.mouse.move(viewport.x+42, viewport.y+40, {steps:3});
        await page.mouse.up();
        const moved = await camera();
        assert.notEqual(moved.transform, initial.transform);
        const toggle = await page.locator('#game-character-name').boundingBox();
        await page.touchscreen.tap(toggle.x+toggle.width/2, toggle.y+toggle.height/2);
        assert.equal(await page.locator('#character-panel').isVisible(), true);
        await geometry();
        assert.deepEqual(await camera(), moved, 'Opening the overlay preserves zoom and pan');
        await page.locator('#dice-toggle').click();
        await geometry();
        assert.equal(await page.locator('#character-panel').isVisible(), false);
        assert.equal(await page.locator('#dice-panel').isVisible(), true);
        assert.deepEqual(await camera(), moved, 'Switching to dice preserves zoom and pan');
        await page.locator('#game-character-name').click();
        assert.equal(await page.locator('#dice-panel').isVisible(), false);
        await page.touchscreen.tap(toggle.x+toggle.width/2, toggle.y+toggle.height/2);
        assert.equal(await page.locator('#character-panel').isVisible(), false);
        await geometry();
        assert.deepEqual(await camera(), moved, 'Closing the overlay preserves zoom and pan');
        await page.mouse.move(viewport.x+12, viewport.y+20);
        await page.mouse.down();
        await page.mouse.move(viewport.x+32, viewport.y+30, {steps:3});
        await page.mouse.up();
        assert.notEqual((await camera()).left, moved.left, 'Map panning still works after closing');
        await page.locator('#fit-map').click();
      }
    }
    assert.equal(writes.length, 0, 'Panel toggles and refits must never write token coordinates');
    await page.locator('#game-character-name').click();
    for (const size of [{width:1920,height:1080}, {width:412,height:924}, {width:924,height:412}, {width:768,height:1024}, {width:1024,height:768}, {width:1440,height:900}]) {
      await page.setViewportSize(size);
      const opened = await geometry();
      assert.ok(opened.full && opened.overlay && !opened.overflow);
      const camera = await page.locator('#map-space').getAttribute('style');
      await page.locator('#game-character-name').click();
      const closed = await geometry();
      assert.equal(closed.width, opened.width);
      assert.equal(closed.height, opened.height);
      assert.equal(await page.locator('#map-space').getAttribute('style'), camera);
      await page.locator('#game-character-name').click();
    }
    await page.locator('#game-character-name').click();
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
    assert.equal(await peer.locator('#compact-ac').textContent(), '—');
    assert.equal(await peer.locator('#compact-level').textContent(), '—');
    assert.equal(await peer.locator('#game-inventory').textContent(), 'Inventář je zatím prázdný.');
    assert.equal(await peer.locator('#inventory-edit-link').getAttribute('href'), `./character.html?character_id=${peerId}&tab=inventory`);
    assert.equal(await peer.locator('#compact-initiative').textContent(), '-1');
    assert.equal(await page.locator('#compact-initiative').textContent(), '0');
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
    overview.ac = 0;
    overview.level = null;
    overview.dex = null;
    overview.inventory = '- Uložená změna z deníku';
    await page.reload();
    await ready();
    await page.waitForFunction(() => document.querySelector('#compact-ac').textContent === '0');
    assert.equal(await page.locator('#compact-level').textContent(), '—');
    assert.equal(await page.locator('#compact-initiative').textContent(), '—');
    assert.equal(await page.locator('#game-inventory li').textContent(), 'Uložená změna z deníku');
    assert.deepEqual((await geometry()).coordinates, saved);
    assert.equal(writes.length, 1);
    assert.deepEqual(errors, []);
    if (process.env.GAME_SCREENSHOT) await page.screenshot({path:process.env.GAME_SCREENSHOT});
    console.log('PASS: recovery DOM, responsive map/panel layout, real token drag/snap and reload with isolated backend');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; }).finally(() => server.close());
