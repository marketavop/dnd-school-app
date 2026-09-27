const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/app.js', 'utf8').replace(/^import .*;\r?\n/gm, '')
  .replace(/\r\n/g, '\n').split('\ntry {\n  const { SUPABASE_URL')[0];
let rows = [];
let definitions = [];
let confirmResult = true;
const calls = [];
let delay = null;
function client(role) {
  const el = () => ({ style: {}, handlers: {}, children: [], value: '', checked: true, complete: false,
    naturalWidth: 1000, naturalHeight: 800, clientWidth: 500, clientHeight: 400,
    classList: { add() {}, remove() {} }, setAttribute() {},
    addEventListener(k, fn) { this.handlers[k] = fn; }, append(...items) { this.children.push(...items); },
    remove() { this.removed = true; }, reset() {}, replaceChildren() { this.children = []; }, querySelector() { return button; },
    setPointerCapture() {}, hasPointerCapture() { return false; }, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 100, top: 80 }; } });
  const button = el();
  const elements = {};
  const document = { baseURI: 'https://app.test/', querySelector(s) { return elements[s] ||= el(); }, createElement: el };
  const ctx = vm.createContext({ document, URL, console, renderGrid() {}, ResizeObserver: class { observe() {} },
    window: { confirm: () => confirmResult, parent: {
      getGameIdentity: () => ({ role, character_id: 'player-character' }),
      loadNpcDefinitions: async () => { assert.equal(role, 'leader'); return definitions.map(r => ({ ...r })); },
      loadNpcs: async mapId => {
        const result = rows.filter(r => r.map_id === mapId && (role === 'leader' || r.visible)).map(r => ({ ...definitions.find(n => n.id === r.npc_id), ...r }));
        if (delay) await delay;
        return result;
      },
      mutateNpc: async (action, args) => {
        assert.equal(role, 'leader'); calls.push({ action, ...args });
        const row = rows.find(r => r.id === args.p_placement_id);
        if (action === 'move') Object.assign(row, { x: args.p_x, y: args.p_y });
        if (action === 'visibility') row.visible = args.p_visible;
        if (action === 'remove') rows = rows.filter(r => r !== row);
        if (action === 'create') definitions.push({ id: 'definition', name: args.p_name, image_url: args.p_image_url });
        if (action === 'delete') { definitions = definitions.filter(n => n.id !== args.p_npc_id); rows = rows.filter(r => r.npc_id !== args.p_npc_id); }
        if (action === 'add') rows.push({ id: args.p_map_id === 'test-map' ? 'new' : 'other', npc_id: args.p_npc_id,
          map_id: args.p_map_id, x: args.p_x, y: args.p_y, visible: true });
      },
    } } });
  vm.runInContext(source, ctx);
  vm.runInContext("activeMapId = 'test-map'; mapReady = configReady = connected = positionConnected = positionLoaded = true; loading = false;", ctx);
  return { ctx, elements, run: code => vm.runInContext(code, ctx), refresh: () => ctx.refreshNpcs() };
}
(async () => {
  const leader = client('leader'), player = client('player');
  const form = leader.elements['#npc-form'];
  leader.elements['#npc-name'] = { value: 'Goblin' };
  leader.elements['#npc-image'] = { value: '' };
  await form.handlers.submit({ preventDefault() {} });
  assert.equal(calls.length, 1);
  assert.equal(rows.length, 0);
  assert.equal(definitions.length, 1);
  await leader.run("changeNpcDefinition(npcDefinitions[0], 'add')");
  assert.equal(calls[1].p_x % 100, 50);
  assert.equal(calls[1].p_y % 100, 50);
  await leader.run("saveNpc(npcs.get('new'), 'visibility')");
  await player.refresh();
  assert.equal(player.run('npcs.size'), 0);
  assert.equal(leader.run('npcs.size'), 1);
  await leader.run("saveNpc(npcs.get('new'), 'visibility')");
  await player.refresh();
  assert.equal(player.run('npcs.size'), 1);
  const token = leader.run("npcs.get('new').element");
  const event = (x, y) => ({ button: 0, pointerId: 1, clientX: x, clientY: y, preventDefault() {} });
  for (const zoom of [0.5, 2]) {
    leader.run(`userZoom = ${zoom}; panX = 90; panY = -40; fitMap()`);
    const scale = leader.run('mapScale');
    const x = leader.run("npcs.get('new').saved.x"), y = leader.run("npcs.get('new').saved.y");
    const before = calls.length;
    token.handlers.pointerdown(event(100 + x * scale, 80 + y * scale));
    token.handlers.pointermove(event(100 + (x - 100) * scale, 80 + y * scale));
    assert.equal(calls.length, before);
    await token.handlers.pointerup(event(100 + (x - 100) * scale, 80 + y * scale));
    assert.equal(calls.length, before + 1);
    assert.equal(calls.at(-1).p_x, x - 100);
    await player.refresh();
    assert.equal(player.run("npcs.get('new').saved.x"), x - 100);
  }
  const beforePlayer = calls.length;
  player.run("npcs.get('new').element").handlers.pointerdown(event(200, 200));
  assert.equal(player.run('drag'), null);
  assert.equal(calls.length, beforePlayer);
  leader.run("clearNpcs(); activeMapId = 'mapa-akademie'; mapVersion++;");
  await leader.refresh(); assert.equal(leader.run('npcs.size'), 0);
  await leader.run("changeNpcDefinition(npcDefinitions[0], 'add')");
  await leader.run("saveNpc(npcs.get('other'), 'visibility')");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].npc_id, rows[1].npc_id);
  assert.notEqual(rows[0].visible, rows[1].visible);
  leader.run("activeMapId = 'test-map'; mapVersion++;");
  await leader.refresh(); assert.equal(leader.run('npcs.size'), 1);
  let release;
  delay = new Promise(resolve => { release = resolve; });
  const pending = leader.refresh();
  leader.run("clearNpcs(); activeMapId = 'mapa-akademie'; mapVersion++;");
  delay = null; release(); await pending;
  assert.equal(leader.run('npcs.size'), 0);
  leader.run("activeMapId = 'test-map'; mapVersion++;");
  await leader.refresh();
  await leader.run("saveNpc(npcs.get('new'), 'remove')");
  await player.refresh(); assert.equal(player.run('npcs.size'), 0);
  assert.equal(definitions.length, 1);
  assert.equal(rows.length, 1);
  await leader.run("changeNpcDefinition(npcDefinitions[0], 'add')");
  assert.equal(rows.length, 2);
  const deleteButton = leader.elements['#npc-list'].children[0].children.at(-1);
  const beforeDelete = calls.length;
  confirmResult = false; await deleteButton.handlers.click();
  assert.equal(calls.length, beforeDelete);
  confirmResult = true; await deleteButton.handlers.click();
  assert.equal(definitions.length, 0); assert.equal(rows.length, 0);
  await player.refresh(); assert.equal(player.run('npcs.size'), 0);
  console.log('PASS: global NPC create, placements/re-add, per-map visibility, cascade UI confirmation, drop/zoom/pan and stale reads');
})().catch(error => { console.error(error); process.exitCode = 1; });
