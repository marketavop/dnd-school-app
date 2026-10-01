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
function client(role, portraitControl = {}) {
  const portraitCalls = [];
  let definitionReads = 0;
  const el = () => ({ style: {}, handlers: {}, children: [], value: '', checked: true, complete: false,
    naturalWidth: 1000, naturalHeight: 800, clientWidth: 500, clientHeight: 400,
    classList: { add() {}, remove() {} }, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; },
    click() { this.clicked = true; },
    addEventListener(k, fn) { this.handlers[k] = fn; }, append(...items) { this.children.push(...items); },
    remove() { this.removed = true; }, reset() {}, replaceChildren() { this.children = []; }, querySelector() { return button; },
    setPointerCapture() {}, hasPointerCapture() { return false; }, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 100, top: 80 }; } });
  const button = el();
  const elements = {};
  const document = { baseURI: 'https://app.test/', querySelector(s) { return elements[s] ||= el(); }, createElement: el };
  const ctx = vm.createContext({ document, URL, console, renderGrid() {}, ResizeObserver: class { observe() {} },
    portraitImageUrl: async (id, options) => {
      portraitCalls.push({ action: 'read', id, ...options });
      if (portraitControl.readWait) await portraitControl.readWait;
      if (portraitControl.readError) throw portraitControl.readError;
      return portraitControl.url === undefined ? 'https://storage.test/signed-npc' : portraitControl.url;
    },
    uploadPortrait: (id, file, options) => writePortrait('upload', id, file, options),
    removePortrait: (id, options) => writePortrait('remove', id, null, options),
    window: { confirm: () => confirmResult, parent: {
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
        if (action === 'delete') { definitions = definitions.filter(n => n.id !== args.p_npc_id); rows = rows.filter(r => r.npc_id !== args.p_npc_id); }
        if (action === 'add') rows.push({ id: args.p_map_id === 'test-map' ? 'new' : 'other', npc_id: args.p_npc_id,
          map_id: args.p_map_id, x: args.p_x, y: args.p_y, visible: true });
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
  const form = leader.elements['#npc-form'];
  leader.elements['#npc-name'] = { value: 'Goblin' };
  await form.handlers.submit({ preventDefault() {} });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].p_image_url, null);
  assert.ok(!fs.readFileSync('public/game.html', 'utf8').includes('id="npc-image"'));
  assert.ok(!source.includes("querySelector('#npc-image')"));
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
  assert.equal(leader.elements['#npc-status'].textContent, '');
  assert.equal(leader.run('npcs.size'), 0);
  assert.deepEqual(definitions, definitionsBeforeRemove);
  assert.deepEqual(rows, otherMapBeforeRemove);
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
  definitions = [{ id: 'definition', name: 'Goblin', image_url: null }];
  rows = [{ id: 'placement', npc_id: 'definition', map_id: 'test-map', x: 50, y: 50, visible: true }];
  const control = {};
  const images = client('leader', control);
  const labels = () => images.elements['#npc-list'].children[0].children.map(el => el.textContent);
  const findButton = label => images.elements['#npc-list'].children[0].children.find(el => el.textContent === label);
  const input = () => images.elements['#npc-list'].children[0].children.find(el => el.type === 'file');
  await images.refresh();
  const originalToken = images.run("npcs.get('placement').element");
  assert.equal(originalToken.textContent, 'G');
  assert.equal(images.portraitCalls.length, 0, 'NULL reference does not request an image');
  assert.ok(labels().includes('Nahrát obrázek'));
  assert.ok(!labels().includes('Odstranit obrázek'));
  assert.match(input().accept, /\.jpeg/);
  findButton('Nahrát obrázek').handlers.click();
  assert.equal(input().clicked, true);
  let finishWrite;
  control.writeWait = new Promise(resolve => { finishWrite = resolve; });
  const selected = input(); selected.files = [{ name: 'goblin.png' }];
  const upload = selected.handlers.change();
  await images.run("changeNpcPortrait('definition', {name:'duplicate.png'})");
  assert.equal(images.portraitCalls.length, 1);
  assert.equal(findButton('Nahrát obrázek').disabled, true);
  finishWrite(); await upload; control.writeWait = null;
  assert.equal(images.portraitCalls[0].id, 'definition');
  assert.equal(images.portraitCalls[0].entityType, 'npc');
  assert.ok(labels().includes('Změnit obrázek'));
  assert.ok(labels().includes('Odstranit obrázek'));
  assert.equal(originalToken.children.length, 0, 'upload must not refresh an existing token');
  const firstPath = definitions[0].image_url;
  control.cleanup = true;
  input().files = [{ name: 'replacement.webp' }];
  await input().handlers.change();
  assert.notEqual(definitions[0].image_url, firstPath);
  assert.match(images.elements['#npc-status'].textContent, /úklid/);
  assert.equal(images.elements['#npc-status'].attributes.class, '');
  assert.equal(images.run("npcs.get('placement').element"), originalToken);
  assert.equal(originalToken.children.length, 0);
  await findButton('Odstranit obrázek').handlers.click();
  assert.equal(definitions[0].image_url, null);
  assert.ok(labels().includes('Nahrát obrázek'));
  assert.equal(images.portraitCalls.at(-1).action, 'remove');
  assert.equal(images.portraitCalls.at(-1).id, 'definition');
  assert.equal(calls.some(c => c.p_image_url !== undefined && c.p_image_url !== null), false);
  control.writeError = { status: 403 };
  await images.run("changeNpcPortrait('definition', {name:'denied.png'})");
  assert.equal(definitions[0].image_url, null);
  assert.ok(labels().includes('Nahrát obrázek'));
  assert.match(images.elements['#npc-status'].textContent, /nepodařilo/);
  control.writeError = { code: 'FILE_TOO_LARGE', message: 'Obrázek je příliš velký. Maximum je 5 MiB.' };
  await images.run("changeNpcPortrait('definition', {name:'oversized.png'})");
  assert.equal(images.elements['#npc-status'].textContent, control.writeError.message);
  assert.equal(images.elements['#npc-status'].attributes.class, 'portrait-error');
  assert.equal(findButton('Nahrát obrázek').disabled, false);
  assert.equal(images.run("npcBusy.has('definition')"), false);
  for (const error of [{ status: 409 }, { outcome_unknown: true }]) {
    control.writeError = error;
    definitions[0].image_url = 'npcs/definition/concurrent.png';
    let finishDefinitions;
    control.definitionWait = new Promise(resolve => { finishDefinitions = resolve; });
    const reads = images.definitionReads;
    const recovery = images.run("changeNpcPortrait('definition')");
    assert.equal(images.elements['#npc-status'].attributes.class, '', 'new attempt clears the old error style');
    await new Promise(setImmediate);
    assert.equal(images.definitionReads, reads + 1);
    const attempts = images.portraitCalls.length;
    await images.run("changeNpcPortrait('definition')");
    assert.equal(images.portraitCalls.length, attempts);
    finishDefinitions(); await recovery; control.definitionWait = null;
    assert.ok(labels().includes('Změnit obrázek'));
    assert.equal(findButton('Změnit obrázek').disabled, false);
    assert.match(images.elements['#npc-status'].textContent, /nebyl potvrzen/);
  }
  control.definitionError = true;
  await images.run("changeNpcPortrait('definition')");
  assert.equal(findButton('Změnit obrázek').disabled, true);
  assert.match(images.elements['#npc-status'].textContent, /obnovte stránku/);
  assert.equal(images.elements['#npc-status'].attributes.class, 'portrait-error');
  images.run("setNpcStatus('Vytvářím NPC…')");
  assert.equal(images.elements['#npc-status'].attributes.class, '', 'ordinary NPC status clears portrait error styling');
  const attempts = images.portraitCalls.length;
  await images.run("changeNpcPortrait('definition')");
  assert.equal(images.portraitCalls.length, attempts);

  // A freshly loaded game signs the definition image for the placement's map.
  const viewer = client('player');
  await viewer.refresh();
  await new Promise(setImmediate);
  const shown = viewer.run("npcs.get('placement').element");
  assert.deepEqual(viewer.portraitCalls, [{ action: 'read', id: 'definition', entityType: 'npc', mapId: 'test-map' }]);
  assert.equal(shown.children[0].src, 'https://storage.test/signed-npc');
  assert.notEqual(shown.children[0].src, definitions[0].image_url);
  assert.equal(viewer.elements['#npc-controls'].hidden, true);
  assert.equal(viewer.elements['#npc-list'].children.length, 0);
  await viewer.run("changeNpcPortrait('definition', {name:'forbidden.png'})");
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
  console.log('PASS: NPC create/placements, portrait upload/replace/remove, busy/recovery, signed token/fallback and stale image guards');
})().catch(error => { console.error(error); process.exitCode = 1; });
