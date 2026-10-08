const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/app.js', 'utf8').replace(/^import .*;\r?\n/gm, '')
  .replace(/\r\n/g, '\n').split('\ntry {\n  const { SUPABASE_URL')[0];
let rows = [];
let definitions = [];
const calls = [];
let delay = null;
function client(role, portraitControl = {}) {
  const portraitCalls = [];
  let definitionReads = 0;
  const el = () => ({ style: {}, handlers: {}, children: [], value: '', checked: true, complete: false,
    naturalWidth: 1000, naturalHeight: 800, clientWidth: 500, clientHeight: 400,
    classList: { add() {}, remove() {} }, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; },
    click() { this.clicked = true; }, focus() {},
    addEventListener(k, fn) { this.handlers[k] = fn; }, append(...items) { this.children.push(...items); },
    remove() { this.removed = true; }, reset() {}, replaceChildren() { this.children = []; }, querySelector() { return button; },
    setPointerCapture() {}, hasPointerCapture() { return false; }, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 100, top: 80 }; } });
  const button = el();
  const elements = {};
  const document = { baseURI: 'https://app.test/', querySelector(s) { assert.ok(!['#npc-controls', '#npc-form', '#npc-name', '#npc-list', '#npc-status'].includes(s), 'Removed global DOM requested: ' + s); return elements[s] ||= el(); }, createElement: el };
  const ctx = vm.createContext({ document, URL, console, renderGrid() {}, ResizeObserver: class { observe() {} },
    portraitImageUrl: async (id, options) => {
      portraitCalls.push({ action: 'read', id, ...options });
      if (portraitControl.readWait) await portraitControl.readWait;
      if (portraitControl.readError) throw portraitControl.readError;
      return portraitControl.url === undefined ? 'https://storage.test/signed-npc' : portraitControl.url;
    },
    uploadPortrait: (id, file, options) => writePortrait('upload', id, file, options),
    window: { parent: {
      getGameIdentity: () => ({ role, character_id: 'player-character' }),
      loadNpcDefinitions: async () => {
        assert.equal(role, 'leader'); definitionReads++;
        if (portraitControl.definitionWait) await portraitControl.definitionWait;
        if (portraitControl.definitionError) throw new Error('Definitions unavailable');
        return definitions.map(r => ({ ...r }));
      },
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
        assert.notEqual(action, 'delete', 'Game must never delete global definitions');
        if (action === 'add') rows.push({ id: args.p_map_id === 'test-map' ? 'new' : 'other', npc_id: args.p_npc_id,
          map_id: args.p_map_id, x: args.p_x, y: args.p_y, visible: false });
      },
    } } });
  vm.runInContext(source, ctx);
  vm.runInContext("activeMapId = 'test-map'; mapReady = configReady = connected = positionConnected = positionLoaded = true; loading = false;", ctx);
  async function writePortrait(action, id, file, options) {
    assert.equal(role, 'leader');
    portraitCalls.push({ action, id, file, ...options });
    if (portraitControl.writeWait) await portraitControl.writeWait;
    if (portraitControl.writeError) throw portraitControl.writeError;
    const definition = definitions.find(n => n.id === id);
    assert.ok(definition, 'write must use definition ID, not placement ID');
    definition.image_url = action === 'remove' ? null : `npcs/${id}/upload-${portraitCalls.length}.png`;
    return { object_path: definition.image_url, cleanup_pending: !!portraitControl.cleanup };
  }
  return { ctx, elements, portraitCalls, get definitionReads() { return definitionReads; },
    run: code => vm.runInContext(code, ctx), refresh: () => ctx.refreshNpcs() };
}
(async () => {
  const leader = client('leader'), player = client('player');
  definitions = [{ id: 'definition', name: 'Goblin', image_url: null }];
  await leader.refresh();
  for (const id of ['npc-controls', 'npc-form', 'npc-name', 'npc-list', 'npc-status']) {
    assert.ok(!fs.readFileSync('public/game.html', 'utf8').includes('id="' + id + '"'));
  }
  await leader.run("addNpcToMap(npcDefinitions[0])");
  assert.equal(calls[0].p_x % 100, 50);
  assert.equal(calls[0].p_y % 100, 50);
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
    assert.equal(leader.run("npcs.get('new').saved.x"), x - 100, 'Successful NPC move updates local saved position before refresh');
    await player.refresh();
    assert.equal(player.run("npcs.get('new').saved.x"), x - 100);
  }
  const beforePlayer = calls.length;
  player.run("npcs.get('new').element").handlers.pointerdown(event(200, 200));
  assert.equal(player.run('drag'), null);
  assert.equal(calls.length, beforePlayer);
  leader.run("clearNpcs(); activeMapId = 'mapa-akademie'; mapVersion++;");
  await leader.refresh(); assert.equal(leader.run('npcs.size'), 0);
  await leader.run("addNpcToMap(npcDefinitions[0])");
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
  // Original bug: run the real transport for removal, with a real empty 204.
  const transportSource = fs.readFileSync('public/token-api.js', 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace("await import('./config.local.js')", 'config').replaceAll('export ', '');
  let removeRequests = 0;
  let jsonCalls = 0;
  const transport = vm.createContext({
    getCurrentUser: () => ({ role: 'leader', session_token: 'fixture-session' }),
    handleSessionFailure: async () => assert.fail('Successful removal must not fail the session'),
    config: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_PUBLISHABLE_KEY: 'fixture' },
    fetch: async (url, options) => {
      assert.ok(url.endsWith('/rpc/leader_remove_npc_from_map'));
      const args = JSON.parse(options.body);
      assert.equal(args.p_session_token, 'fixture-session');
      assert.equal(args.p_placement_id, 'new');
      removeRequests++;
      rows = rows.filter(row => row.id !== args.p_placement_id);
      const response = new Response(null, { status: 204 });
      const json = response.json.bind(response);
      response.json = () => { jsonCalls++; return json(); };
      return response;
    },
  });
  vm.runInContext(transportSource, transport);
  const originalMutation = leader.ctx.window.parent.mutateNpc;
  leader.ctx.window.parent.mutateNpc = vm.runInContext('mutateNpc', transport);
  const definitionsBeforeRemove = structuredClone(definitions);
  const otherMapBeforeRemove = structuredClone(rows.filter(row => row.map_id === 'mapa-akademie'));
  await leader.run("saveNpc(npcs.get('new'), 'remove')");
  leader.ctx.window.parent.mutateNpc = originalMutation;
  assert.equal(removeRequests, 1);
  assert.equal(jsonCalls, 0);
  assert.equal(leader.elements['#scene-npcs-status'].textContent, '');
  assert.equal(leader.run('npcs.size'), 0);
  assert.deepEqual(definitions, definitionsBeforeRemove);
  assert.deepEqual(rows, otherMapBeforeRemove);
  await player.refresh(); assert.equal(player.run('npcs.size'), 0);
  assert.equal(definitions.length, 1);
  assert.equal(rows.length, 1);
  await leader.run("addNpcToMap(npcDefinitions[0])");
  assert.equal(rows.length, 2);
  // Global definition editing is tested on the homepage; game only reads portraits.
  definitions = [{ id: 'definition', name: 'Goblin', image_url: 'npcs/definition/portrait.png' }];
  rows = [{ id: 'placement', npc_id: 'definition', map_id: 'test-map', x: 50, y: 50, visible: true }];
  // A freshly loaded game signs the definition image for the placement's map.
  const viewer = client('player');
  await viewer.refresh();
  await new Promise(setImmediate);
  const shown = viewer.run("npcs.get('placement').element");
  assert.deepEqual(viewer.portraitCalls, [{ action: 'read', id: 'definition', entityType: 'npc', mapId: 'test-map' }]);
  assert.equal(shown.children[0].src, 'https://storage.test/signed-npc');
  assert.notEqual(shown.children[0].src, definitions[0].image_url);
  assert.equal(viewer.portraitCalls.length, 1);
  shown.children[0].handlers.error();
  assert.equal(shown.children[0].removed, true);
  assert.equal(shown.textContent, 'G');
  for (const readControl of [{ url: null }, { readError: { status: 403 } }, { readError: new Error('offline') }]) {
    const fallback = client('player', readControl);
    await fallback.refresh();
    await new Promise(setImmediate);
    const token = fallback.run("npcs.get('placement').element");
    assert.equal(token.children.length, 0);
    assert.equal(token.textContent, 'G');
  }
  rows[0].visible = false;
  const hidden = client('player'); await hidden.refresh();
  assert.equal(hidden.portraitCalls.length, 0);
  rows[0].visible = true;
  for (const invalidate of ["clearNpcs()", "mapVersion++; activeMapId = 'other-map'", "npcs.delete('placement')"]) {
    let finishRead;
    const delayed = client('player', { readWait: new Promise(resolve => { finishRead = resolve; }) });
    await delayed.refresh();
    const oldToken = delayed.run("npcs.get('placement').element");
    delayed.run(invalidate);
    finishRead(); await new Promise(setImmediate);
    assert.equal(oldToken.children.length, 0, 'late image must not attach to an invalid token');
  }
  const afterRemove = client('player');
  definitions[0].image_url = null;
  await afterRemove.refresh();
  assert.equal(afterRemove.portraitCalls.length, 0);
  assert.equal(afterRemove.run("npcs.get('placement').element.textContent"), 'G');
  // Scene uses map placements, including hidden ones, without another data source.
  definitions = [{ id: 'a', name: 'Secret', image_url: null }, { id: 'b', name: 'Other map', image_url: null },
    { id: 'unused', name: 'Unplaced', image_url: null }];
  rows = [{ id: 'pa', npc_id: 'a', map_id: 'test-map', x: 50, y: 50, visible: false },
    { id: 'pb', npc_id: 'b', map_id: 'mapa-akademie', x: 50, y: 50, visible: true }];
  const scene = client('leader');
  const sceneRows = () => scene.elements['#scene-npcs-list'].children;
  await scene.refresh();
  assert.equal(sceneRows().length, 1);
  assert.match(sceneRows()[0].children[0].textContent, /Secret — skryté hráčům/);
  assert.equal(scene.run('npcDefinitions.length'), 3, 'definitions remain available to the picker');
  const scenePlayer = client('player'); await scenePlayer.refresh();
  assert.equal(scenePlayer.elements['#scene-npcs'].hidden, true);
  assert.equal(scenePlayer.elements['#scene-npcs-list'].children.length, 0);
  await sceneRows()[0].children[1].handlers.click();
  assert.equal(calls.at(-1).action, 'visibility');
  assert.equal(calls.at(-1).p_placement_id, 'pa');
  assert.equal(calls.at(-1).p_visible, true);
  assert.match(sceneRows()[0].children[0].textContent, /viditelné/);
  // The realtime notification invokes this same refresh even when Scene is closed.
  scene.elements['#scene-panel'] = { hidden: true };
  rows[0].visible = false;
  await scene.refresh();
  assert.match(sceneRows()[0].children[0].textContent, /skryté hráčům/);
  await sceneRows()[0].children[2].handlers.click();
  assert.equal(calls.at(-1).action, 'remove');
  assert.equal(calls.at(-1).p_placement_id, 'pa');
  assert.equal(definitions.length, 3);
  assert.equal(rows.length, 1);
  assert.equal(sceneRows().length, 0);
  assert.equal(scene.elements['#scene-npcs-empty'].hidden, false);
  scene.run("clearNpcs(); activeMapId = 'mapa-akademie'; mapVersion++;");
  await scene.refresh();
  assert.equal(sceneRows().length, 1);
  assert.match(sceneRows()[0].children[0].textContent, /Other map — viditelné/);
  // Picker reuses definitions, excludes only current-map placements, and signs previews.
  definitions[2].image_url = 'npcs/unused/portrait.png';
  await scene.refresh();
  const readsBeforePicker = scene.definitionReads;
  scene.run('setNpcPicker(true)');
  const options = () => scene.elements['#scene-npc-options'].children;
  const optionButton = index => options()[index].children[0];
  assert.equal(options().length, 2);
  assert.equal(optionButton(0).children[0].textContent, 'Secret');
  assert.equal(optionButton(1).children[0].textContent, 'Unplaced');
  await new Promise(setImmediate);
  assert.equal(optionButton(1).children[1].src, 'https://storage.test/signed-npc');
  assert.equal(scene.portraitCalls.at(-1).id, 'unused');
  assert.equal(scene.portraitCalls.at(-1).mapId, undefined);
  assert.equal(scene.definitionReads, readsBeforePicker);
  const mutate = scene.ctx.window.parent.mutateNpc;
  let finishAdd;
  let failAdd = true;
  let addAttempts = 0;
  scene.ctx.window.parent.mutateNpc = async (action, args) => {
    assert.equal(action, 'add');
    addAttempts++;
    if (failAdd) throw new Error('Fixture backend failure');
    await new Promise(resolve => { finishAdd = resolve; });
    await mutate(action, args);
    // Model the deployed backend default, without a frontend visibility request.
    rows.at(-1).visible = false;
  };
  await optionButton(0).handlers.click();
  assert.equal(scene.elements['#scene-npc-picker'].hidden, false);
  assert.match(scene.elements['#scene-npcs-status'].textContent, /nepodařilo/);
  assert.equal(optionButton(0).disabled, false);
  failAdd = false;
  const beforeDefinitions = structuredClone(definitions);
  const otherPlacements = structuredClone(rows);
  const cameraBefore = scene.run('[userZoom, panX, panY].join()');
  const selectedNpc = optionButton(0);
  const adding = selectedNpc.handlers.click();
  await selectedNpc.handlers.click();
  assert.equal(addAttempts, 2, 'failure plus one in-flight retry, no duplicate');
  assert.equal(optionButton(0).disabled, true);
  finishAdd(); await adding;
  assert.equal(scene.elements['#scene-npc-picker'].hidden, true);
  assert.equal(scene.elements['#scene-npc-add'].attributes['aria-expanded'], 'false');
  assert.equal(rows.at(-1).visible, false);
  assert.deepEqual(definitions, beforeDefinitions);
  assert.deepEqual(rows.slice(0, -1), otherPlacements);
  assert.equal(scene.run('[userZoom, panX, panY].join()'), cameraBefore);
  await selectedNpc.handlers.click();
  assert.equal(addAttempts, 2, 'stale button must not add an already placed NPC');
  scene.run('setNpcPicker(true)');
  assert.equal(options().length, 1);
  scene.elements['#scene-npc-cancel'].handlers.click();
  assert.equal(scene.elements['#scene-npc-picker'].hidden, true);
  scene.run('npcDefinitions = []; setNpcPicker(true)');
  assert.equal(options().length, 0);
  assert.equal(scene.elements['#scene-npc-picker-empty'].hidden, false);
  scenePlayer.run('setNpcPicker(true)');
  assert.equal(scenePlayer.elements['#scene-npc-picker'].hidden, true);
  // Quick creation retains the definition ID across partial failures.
  definitions = []; rows = [];
  const quick = client('leader');
  let creates = 0, adds = 0, failCreate = false, failPlacement = false, createWait = null;
  quick.ctx.window.parent.mutateNpc = async (action, args) => {
    if (action === 'create') {
      creates++;
      if (createWait) await createWait;
      if (failCreate) throw new Error('Create failed');
      const id = 'quick-' + creates;
      definitions.push({ id, name: args.p_name, image_url: null });
      return id;
    }
    assert.equal(action, 'add', 'no frontend hide request');
    adds++;
    if (failPlacement) throw new Error('Placement failed');
    rows.push({ id: 'p-' + args.p_npc_id, npc_id: args.p_npc_id, name: definitions.find(n => n.id === args.p_npc_id).name,
      map_id: args.p_map_id, x: args.p_x, y: args.p_y, visible: false });
  };
  const submitQuick = () => quick.elements['#scene-npc-form'].handlers.submit({ preventDefault() {} });
  const quickName = quick.elements['#scene-npc-name'];
  quickName.value = '   '; await submitQuick();
  quickName.value = 'x'.repeat(121); await submitQuick();
  assert.equal(creates, 0);
  quickName.value = 'Cancelled';
  quick.elements['#scene-npc-close'].handlers.click();
  assert.equal(creates, 0);
  quickName.value = '  Name only  '; await submitQuick();
  assert.equal(definitions[0].name, 'Name only');
  assert.equal(rows[0].visible, false);
  assert.equal(quick.portraitCalls.length, 0);
  quickName.value = 'With picture';
  quick.elements['#scene-npc-image'].files = [{ name: 'npc.png', size: 100 }];
  await submitQuick();
  assert.equal(quick.portraitCalls.at(-1).entityType, 'npc');
  assert.equal(quick.portraitCalls.at(-1).id, definitions[1].id);
  assert.ok(definitions[1].image_url);
  assert.equal(rows[1].visible, false);
  quick.elements['#scene-npc-image'].files = [];
  quickName.value = 'Retry placement'; failPlacement = true;
  await submitQuick();
  const retainedId = quick.run('quickNpcPending.id');
  const createsBeforeRetry = creates;
  assert.match(quick.elements['#scene-npc-create-status'].textContent, /vytvořeno.*nepodařilo.*umístit/);
  failPlacement = false; await submitQuick();
  assert.equal(creates, createsBeforeRetry);
  assert.equal(rows.at(-1).npc_id, retainedId);
  assert.equal(quick.run('quickNpcPending'), null);
  quickName.value = 'Failure'; failCreate = true;
  const addsBeforeFailure = adds;
  await submitQuick();
  assert.equal(adds, addsBeforeFailure);
  assert.match(quick.elements['#scene-npc-create-status'].textContent, /nepodařilo potvrdit/);
  assert.equal(quick.elements['#scene-npc-save'].disabled, false);
  failCreate = false;
  let releaseCreate;
  createWait = new Promise(resolve => { releaseCreate = resolve; });
  const duplicateGuard = submitQuick();
  const createsDuringSave = creates;
  await submitQuick();
  assert.equal(creates, createsDuringSave);
  assert.equal(quick.elements['#scene-npc-save'].disabled, true);
  releaseCreate(); await duplicateGuard; createWait = null;
  assert.equal(rows.at(-1).visible, false);
  console.log('PASS: Scene without global DOM, placements, quick creation/upload/retry, hidden data, camera, signed portraits and stale responses');
})().catch(error => { console.error(error); process.exitCode = 1; });
