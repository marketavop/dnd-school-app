// Bez závislostí: node tests/map-config.cjs
// Celý app.js ve dvou oddělených kontextech; pouze DOM a Supabase jsou nahrazeny.
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = (readFileSync('public/grid.js', 'utf8').replace('export ', '') + readFileSync('public/app.js', 'utf8').replace("import { renderGrid } from './grid.js';", '').replace("import { configureMapImageUrl, resolveMapImage } from './map-image.js';", 'const configureMapImageUrl = () => {}; const resolveMapImage = async path => path;'))
  .replace("await import('./config.local.js')", 'testConfig')
  .replace("await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm')", 'testSdk');
const otherId = '10000000-0000-0000-0000-000000000002';
const uploadedMapId = 'a4516496-336b-43b2-90bf-3f495973f18a';
const leaderMaps = [
  { map_id: 'test-map', name: 'Test map' },
  { map_id: 'mapa-akademie', name: 'Mapa akademie' },
];
const mapRequests = [];
let emitMapChange = true;
const mapApiSource = readFileSync('public/leader-map-api.js', 'utf8')
  .replace(/^import .*;\r?\n/gm, '')
  .replaceAll('export ', '')
  .replace("await import('./config.local.js')", 'testConfig');
const otherPositions = {};
const characterId = 'd16ac8a0-ba74-40e7-8402-c75cfe3a4ab6';
const rows = {
  game_state: { active_map_id: 'test-map' },
  map_config: {
    'test-map': { map_id: 'test-map', cell_size: 100 },
    'mapa-akademie': { map_id: 'mapa-akademie', cell_size: 150 },
  },
  token_positions: { 'test-map': { character_id: characterId, map_id: 'test-map', x: 375, y: 375 } },
};
const listeners = [];
const writes = [];
let failWrite = false;
let failRead = false;
let delayConfigRead = null;
let delayConfigWrite = null;
let delayPositionRead = null;
let delayPositionWrite = null;
let realtimeTasks = [];
let confirmResult = true;
async function settle() {
  while (realtimeTasks.length) await Promise.all(realtimeTasks.splice(0));
}
function emit(table, row, event = 'UPDATE') {
  for (const listener of listeners.filter(l => l.active && l.table === table && l.event === event)) {
    if (table === 'token_positions' && event !== 'DELETE' && listener.filter !== `map_id=eq.${row.map_id}`) continue;
    realtimeTasks.push(Promise.resolve(listener.fn(event === 'DELETE' ? { old: { ...row } } : { new: { ...row } })));
  }
}
const coords = mapId => ({ x: rows.token_positions[mapId].x, y: rows.token_positions[mapId].y });

async function client(role = 'leader') {
  const elements = {};
  elements['map-select-label'] = {};
  for (const id of ['npc-controls', 'npc-status', 'npc-list', 'npc-form']) {
    elements[id] = { handlers: {}, append() {}, replaceChildren() {}, addEventListener(k, fn) { this.handlers[k] = fn; } };
  }
  for (const id of ['scene-players', 'scene-players-list', 'map', 'map-space', 'grid', 'map-status', 'token', 'status', 'connection', 'position', 'cell-size', 'cell-size-error', 'cell-size-status', 'map-select', 'active-map-status', 'add-token', 'add-token-message', 'remove-token', 'remove-token-message']) {
    elements[id] = { style: {}, attributes: {}, handlers: {}, children: [], validity: {},
      classList: { add() {}, remove() {} },
      setAttribute(k, v) { this.attributes[k] = String(v); },
      addEventListener(k, v) { this.handlers[k] = v; },
      replaceChildren() { this.children = []; }, append(line) { this.children.push(line); },
      getBoundingClientRect() { return { left: 0, top: 0 }; },
      setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return true; },
    };
  }
  Object.assign(elements.map, { complete: true, naturalWidth: 1536, naturalHeight: 1024 });
  elements['map-viewport'] = { clientWidth: 2000, clientHeight: 2000, addEventListener() {} };
  elements['fit-map'] = { addEventListener() {} };
  Object.defineProperty(elements.map, 'src', {
    get() { return this.source; },
    set(value) {
      this.source = value;
      const academic = value.endsWith('/mapa-akademie.png');
      this.naturalWidth = academic ? 1310 : 1536;
      this.naturalHeight = academic ? 1200 : 1024;
    },
  });
  Object.defineProperty(elements['cell-size'], 'valueAsNumber', { get() { return Number(this.value); } });
  let ready;
  const sdk = { createClient() { return {
    from(table) {
      assert.notEqual(table, 'spike_token', 'Globální tabulka se již nesmí používat');
      let update;
      let mapId;
      let deleteRequested = false;
      return {
        select() { return this; }, eq(k, v) {
          if (table === 'map_config') { assert.equal(k, 'map_id'); assert.ok(v in rows.map_config); mapId = v; }
          else if (table === 'token_positions') {
            if (k === 'character_id') assert.equal(v, characterId);
            else { assert.equal(k, 'map_id'); mapId = v; }
          } else { assert.equal(k, 'id'); assert.equal(v, 1); }
          return this;
        },
        update(value) { update = value; return this; },
        delete() { deleteRequested = true; return this; },
        upsert(value, options) {
          assert.equal(table, 'token_positions');
          assert.equal(options.onConflict, 'character_id,map_id');
          assert.equal(value.character_id, characterId);
          mapId = value.map_id; update = value; return this;
        },
        maybeSingle() { return this.single(); },
        async single() {
          if (!update && (failRead === true || failRead === table)) return { error: { message: 'missing row' } };
          let row = ['map_config', 'token_positions'].includes(table) ? rows[table][mapId] : rows[table];
          const snapshot = row ? { ...row } : null;
          if (!update && delayPositionRead && table === 'token_positions' && mapId === delayPositionRead.mapId) {
            await delayPositionRead.promise;
            return { data: snapshot };
          }
          if (!update && delayConfigRead && table === 'map_config' && mapId === delayConfigRead.mapId) {
            await delayConfigRead.promise;
            return { data: snapshot };
          }
          if (deleteRequested) {
            if (failWrite) return { error: { message: 'denied' } };
            if (table === 'token_positions' && rows.token_positions[mapId]) {
              const deleted = { ...rows.token_positions[mapId] };
              delete rows.token_positions[mapId];
              emit(table, deleted, 'DELETE');
            }
            writes.push({ table, mapId, deleted: true });
            return { data: null };
          }
          if (update) {
            if (failWrite) return { error: { message: 'denied' } };
            if (delayConfigWrite && table === 'map_config') await delayConfigWrite.promise;
            if (delayPositionWrite && table === 'token_positions') await delayPositionWrite.promise;
            writes.push({ table, mapId, value: { ...update } });
            const event = row ? 'UPDATE' : 'INSERT';
            if (!row) row = rows.token_positions[mapId] = {};
            Object.assign(row, update);
            emit(table, row, event);
          }
          return { data: row ? (table === 'token_positions' ? { x: row.x, y: row.y } : { ...row }) : null };
        },
      };
    },
    removeChannel(channel) {
      for (const listener of listeners.filter(l => l.channel === channel)) listener.active = false;
      return Promise.resolve('ok');
    },
    channel(name) { if (name === 'npc-changes') return { on() { return this; }, subscribe() { return this; } }; return {
      on(type, options, fn) {
        assert.equal(type, 'postgres_changes');
        assert.ok(options.event === 'UPDATE' || (options.table === 'token_positions' && ['INSERT', 'DELETE'].includes(options.event)));
        assert.equal(options.schema, 'public');
        if (options.table === 'token_positions' && options.event !== 'DELETE') assert.ok(options.filter.slice('map_id=eq.'.length) in rows.map_config);
        else if (options.table === 'token_positions') assert.equal(options.filter, undefined);
        else assert.equal(options.filter, options.table === 'map_config' ? undefined : 'id=eq.1');
        listeners.push({ table: options.table, filter: options.filter, event: options.event, fn, channel: this, active: true }); return this;
      },
      subscribe(fn) { ready = fn('SUBSCRIBED'); realtimeTasks.push(Promise.resolve(ready)); return this; },
    }; },
  }; } };
  const context = vm.createContext({
    testConfig: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' },
    testSdk: sdk,
    getCurrentUser: () => ({ role, session_token: 'test-session' }),
    configureMapImageUrl() {}, mapImageSrc() {}, handleSessionFailure: async () => {},
    fetch: async (url, options) => {
      mapRequests.push({ url, ...options });
      if (failWrite) return { ok: false, status: 403 };
      const mapId = JSON.parse(options.body).p_map_id;
      rows.game_state.active_map_id = mapId;
      if (emitMapChange) emit('game_state', rows.game_state);
      return { ok: true, json: async () => [{ ...rows.game_state }] };
    },
    ResizeObserver: class { observe() {} },
    URLSearchParams,
    window: { location: { search: `?character_id=${characterId}${role === 'leader' ? '&mode=leader' : ''}` }, confirm: () => confirmResult,
      parent: {
        getGameIdentity: () => ({ role, character_id: role === 'player' ? characterId : null }),
        loadGameTokens: async mapId => {
          const response = await sdk.createClient().from('token_positions').select().eq('map_id', mapId).maybeSingle();
          if (response.error) throw response.error;
          const roster = [{ character_id: characterId, name: 'Test', portrait_path: './portrait.png', ...(response.data || { x: null, y: null }) }];
          if (role === 'leader') roster.push({ character_id: otherId, name: 'Druhá postava', portrait_path: null, ...(otherPositions[mapId] || { x: null, y: null }) });
          return roster;
        },
        mutateGameToken: async (action, id, mapId, point) => {
          if (failWrite) throw new Error('denied');
          assert.ok(role === 'leader' || id === characterId);
          if (delayPositionWrite) await delayPositionWrite.promise;
          const storage = id === characterId ? rows.token_positions : otherPositions;
          if (action === 'move' && !storage[mapId]) throw new Error('missing token');
          if (action === 'remove') {
            const old = storage[mapId]; delete storage[mapId];
            if (old) emit('token_positions', { ...old, character_id: id, map_id: mapId }, 'DELETE');
          } else if (!(action === 'add' && storage[mapId])) {
            storage[mapId] = { character_id: id, map_id: mapId, ...point };
            emit('token_positions', storage[mapId], action === 'add' ? 'INSERT' : 'UPDATE');
          }
          writes.push({ table: 'token_positions', mapId, action, characterId: id, value: point });
          const row = storage[mapId];
          return row ? { x: row.x, y: row.y } : null;
        },
        loadNpcs: async () => [],
        loadNpcDefinitions: async () => [],
        loadLeaderMaps: async () => leaderMaps.map(row => ({ ...row })),
      } },
    URL,
    document: { baseURI: 'http://localhost/game.html', querySelector: s => elements[s.slice(1)],
      createElement() { return { style: {}, attributes: {}, handlers: {}, children: [], classList: { add() {}, remove() {} },
        setAttribute(k, v) { this.attributes[k] = v; },
        append(...children) { this.children.push(...children); }, remove() {},
        addEventListener(type, handler) { this.handlers[type] = handler; },
        setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return true; },
      }; }, createElementNS() { return { setAttribute() {} }; } },
  });
  // Zpřístupníme pouze čekání na interní frontu pro deterministické testy.
  await vm.runInContext(`(async () => { ${mapApiSource}\n window.parent.setLeaderActiveMap = setActiveMap; })()`, context);
  await vm.runInContext(`(async () => { ${source}\n globalThis.flush = () => Promise.resolve(); globalThis.tokenStates = tokens; })()`, context);
  await ready;
  await settle();
  Object.defineProperty(elements, 'token', { get: () => context.tokenStates.get(characterId)?.element || { hidden: true, style: {}, handlers: {} } });
  return { elements, tokenStates: context.tokenStates, async switchMap(mapId) {
    elements['map-select'].value = mapId;
    await elements['map-select'].handlers.change();
    await settle();
  }, async input(value) {
    // A saved preparation change arrives via the existing realtime channel.
    const mapId = elements['map-select'].value;
    rows.map_config[mapId].cell_size = value;
    emit('map_config', rows.map_config[mapId]);
    await settle();
  } };
}

(async () => {
  leaderMaps.push({ map_id: uploadedMapId, name: 'Uploaded map', image_path: `maps/${uploadedMapId}/map.webp` });
  rows.map_config[uploadedMapId] = { map_id: uploadedMapId, cell_size: 100 };
  const regression = await client();
  assert.deepEqual(regression.elements['map-select'].children.map(option => option.value), leaderMaps.map(row => row.map_id));
  // Exercise the real change handler and API fetch, including success without realtime.
  for (const realtime of [false, true]) {
    emitMapChange = realtime;
    for (const mapId of ['mapa-akademie', 'test-map', uploadedMapId]) {
      const before = mapRequests.length;
      await regression.switchMap(mapId);
      assert.equal(mapRequests.length, before + 1, 'One change makes exactly one RPC request');
      assert.equal(mapRequests[before].url, 'https://test.supabase.co/rest/v1/rpc/leader_set_active_map');
      assert.deepEqual(JSON.parse(mapRequests[before].body), { p_map_id: mapId, p_session_token: 'test-session' });
      assert.equal(rows.game_state.active_map_id, mapId);
      assert.equal(regression.elements['map-select'].value, rows.game_state.active_map_id);
      assert.equal(regression.elements['active-map-status'].textContent, `Aktivní mapa: ${leaderMaps.find(row => row.map_id === mapId).name}`);
    }
    assert.equal(regression.elements.map.src, `maps/${uploadedMapId}/map.webp`);
    failWrite = true;
    const before = mapRequests.length;
    await regression.switchMap('test-map');
    assert.equal(mapRequests.length, before + 1);
    assert.equal(regression.elements['map-select'].value, uploadedMapId, 'Failed RPC restores the active uploaded map');
    assert.equal(regression.elements['active-map-status'].textContent, 'Mapu se nepodařilo přepnout. Zkus to znovu.');
    assert.equal(regression.elements['map-select'].disabled, false);
    failWrite = false;
  }
  await regression.switchMap('test-map');
  listeners.splice(0);
  leaderMaps.pop();
  const a = await client(), b = await client();
  const player = await client('player');
  await player.switchMap('mapa-akademie');
  assert.equal(rows.game_state.active_map_id, 'test-map', 'Player handler cannot change active map');
  const size = c => Number(c.elements['cell-size'].value);
  const center = c => [c.elements.token.style.left, c.elements.token.style.top];
  assert.deepEqual(center(a), ['375px', '375px']);
  assert.deepEqual(center(b), ['375px', '375px']);
  assert.equal(size(a), 100); assert.equal(size(b), 100);
  // Multiple tokens share the renderer; the player receives only their own roster entry.
  assert.equal(a.tokenStates.size, 2);
  assert.equal(player.tokenStates.size, 1);
  assert.equal(a.tokenStates.get(otherId).element.hidden, true);
  assert.equal(a.tokenStates.get(otherId).action.textContent, 'Přidat');
  assert.equal(a.elements.token.children[0].src, 'http://localhost/portrait.png');
  assert.equal(a.elements.token.children[0].draggable, false);
  await a.input(150);
  assert.equal(size(b), 150); assert.equal(b.elements.token.style.width, '135px');
  await b.input(80);
  assert.equal(size(a), 80); assert.equal(a.elements.token.style.width, '72px');
  assert.deepEqual(center(a), ['375px', '375px']); assert.deepEqual(center(b), ['375px', '375px']);
  assert.equal(writes.length, 0, 'Game never writes map_config');
  assert.equal(a.elements['cell-size'].handlers.input, undefined);
  assert.equal(size(await client()), 80);
  // Reálné token handlery, snap do aktuálního 80px pole a přenos do druhého klienta.
  const event = (x, y) => ({ button: 0, pointerId: 1, clientX: x, clientY: y, preventDefault() {} });
  a.elements.token.handlers.pointerdown(event(375, 375));
  a.elements.token.handlers.pointermove(event(210, 190));
  const before = writes.length;
  await a.elements.token.handlers.pointerup(event(210, 190));
  assert.equal(writes.length, before + 1);
  assert.deepEqual(coords('test-map'), { x: 200, y: 200 });
  assert.deepEqual(center(b), ['200px', '200px']);
  assert.deepEqual(center(await client()), ['200px', '200px']);
  // MAP-006: výběr mapy, správný PNG, vlastní grid, návrat, reload i token realtime.
  assert.deepEqual(a.elements['map-select'].children.map(option => option.value), ['test-map', 'mapa-akademie']);
  const tokenWrites = () => writes.filter(w => w.table === 'token_positions').length;
  const tokenWritesBefore = tokenWrites();
  await a.switchMap('mapa-akademie');
  assert.equal(rows.game_state.active_map_id, 'mapa-akademie');
  for (const c of [a, b, player]) {
    assert.equal(c.elements['map-select'].value, 'mapa-akademie');
    assert.equal(c.elements.map.src, './assets/maps/mapa-akademie.png');
    assert.equal(size(c), 150);
    assert.equal(c.elements.token.style.width, '135px');
    assert.equal(c.elements['map-space'].style.width, '1310px');
    assert.equal(c.elements['map-space'].style.height, '1200px');
    assert.equal(c.elements.grid.children.length, 18);
    assert.equal(c.elements.token.hidden, true);
    if (c === player) assert.equal(c.elements.position.textContent, '—');
  }
  // Dodatečný INSERT bez reloadu zobrazí postavu na akademii.
  rows.token_positions['mapa-akademie'] = { character_id: characterId, map_id: 'mapa-akademie', x: 200, y: 200 };
  emit('token_positions', rows.token_positions['mapa-akademie'], 'INSERT');
  await settle();
  assert.equal(a.elements.token.hidden, false); assert.equal(b.elements.token.hidden, false);
  assert.deepEqual(center(a), ['200px', '200px']);
  await b.input(120);
  assert.equal(size(a), 120);
  assert.equal(rows.map_config['test-map'].cell_size, 80);
  assert.equal(rows.map_config['mapa-akademie'].cell_size, 120);
  for (const c of [await client(), await client()]) {
    assert.equal(c.elements['map-select'].value, 'mapa-akademie');
    assert.equal(size(c), 120);
  }
  await b.switchMap('test-map');
  assert.equal(size(a), 80); assert.equal(size(b), 80);
  assert.equal(a.elements.map.src, './assets/maps/test-map.png');
  assert.equal(a.elements['map-space'].style.width, '1536px');
  assert.equal(tokenWrites(), tokenWritesBefore);
  assert.deepEqual(coords('test-map'), { x: 200, y: 200 });
  failWrite = true;
  await a.switchMap('mapa-akademie');
  assert.equal(a.elements['map-select'].value, 'test-map');
  assert.equal(a.elements['active-map-status'].textContent, 'Mapu se nepodařilo přepnout. Zkus to znovu.');
  failWrite = false;
  // Opožděný SELECT staré mapy nesmí přepsat novou mapu.
  let releaseRead;
  delayConfigRead = { mapId: 'mapa-akademie', promise: new Promise(resolve => { releaseRead = resolve; }) };
  const oldLoad = listeners.find(l => l.table === 'game_state').fn({ new: { active_map_id: 'mapa-akademie' } });
  await listeners.find(l => l.table === 'game_state').fn({ new: { active_map_id: 'test-map' } });
  releaseRead(); await oldLoad; delayConfigRead = null;
  assert.equal(size(a), 80); assert.equal(a.elements['map-select'].value, 'test-map');
  await a.input(90);
  await a.switchMap('mapa-akademie');
  // Token funguje i po přepnutí a snapuje do aktuálního 120px gridu.
  b.elements.token.handlers.pointerdown(event(200, 200));
  b.elements.token.handlers.pointermove(event(330, 310));
  await b.elements.token.handlers.pointerup(event(330, 310));
  assert.deepEqual(coords('mapa-akademie'), { x: 300, y: 300 });
  assert.deepEqual(coords('test-map'), { x: 200, y: 200 });
  assert.deepEqual(center(a), ['300px', '300px']);
  // Pomalý obrázek se nezobrazí se starým gridem; přepnutí zruší aktivní drag.
  a.elements.token.handlers.pointerdown(event(300, 300));
  a.elements.token.handlers.pointermove(event(320, 320));
  const writesBeforeSwitch = tokenWrites();
  a.elements.map.complete = false;
  await b.switchMap('test-map');
  assert.equal(a.elements.map.hidden, true);
  assert.equal(a.elements.grid.style.display, 'none');
  assert.equal(a.elements.token.hidden, true);
  await a.elements.token.handlers.pointerup(event(320, 320));
  assert.equal(tokenWrites(), writesBeforeSwitch);
  a.elements.map.complete = true;
  a.elements.map.handlers.load();
  assert.equal(a.elements.map.hidden, false);
  assert.equal(a.elements.grid.style.display, '');
  assert.equal(a.elements.token.hidden, false);
  assert.deepEqual(center(a), ['200px', '200px']);
  // Jiná postava / neaktivní mapa se ignoruje; staré odběry jsou odstraněné.
  emit('token_positions', { character_id: 'another-character', map_id: 'test-map', x: 999, y: 999 });
  emit('token_positions', { character_id: characterId, map_id: 'mapa-akademie', x: 888, y: 888 });
  await settle();
  assert.deepEqual(center(a), ['200px', '200px']);
  assert.ok(listeners.filter(l => l.active && l.table === 'token_positions' && l.event !== 'DELETE').every(l => l.filter === 'map_id=eq.test-map'));
  const staleListener = listeners.find(l => l.active && l.table === 'token_positions');
  // Opožděné načtení a callback staré mapy nesmí vrátit starý token.
  let releasePositionRead;
  delayPositionRead = { mapId: 'mapa-akademie', promise: new Promise(resolve => { releasePositionRead = resolve; }) };
  const delayedSwitch = listeners.find(l => l.table === 'game_state').fn({ new: { active_map_id: 'mapa-akademie' } });
  await delayedSwitch;
  await listeners.find(l => l.table === 'game_state').fn({ new: { active_map_id: 'test-map' } });
  releasePositionRead(); await settle(); delayPositionRead = null;
  staleListener.fn({ new: { character_id: characterId, map_id: 'test-map', x: 777, y: 777 } });
  assert.deepEqual(center(a), ['200px', '200px']);
  // Pozdní upsert zůstane na původní mapě, ani jeho odpověď nepřepíše novou.
  let releasePositionWrite;
  delayPositionWrite = { promise: new Promise(resolve => { releasePositionWrite = resolve; }) };
  a.elements.token.handlers.pointerdown(event(200, 200));
  a.elements.token.handlers.pointermove(event(400, 400));
  const delayedDrop = a.elements.token.handlers.pointerup(event(400, 400));
  await a.switchMap('mapa-akademie');
  releasePositionWrite(); await delayedDrop; await settle(); delayPositionWrite = null;
  assert.deepEqual(coords('test-map'), { x: 405, y: 405 }); // Test-map má grid 90.
  assert.deepEqual(coords('mapa-akademie'), { x: 300, y: 300 });
  assert.deepEqual(center(a), ['300px', '300px']);
  // Selhání upsertu zachová poslední známou pozici.
  failWrite = true;
  a.elements.token.handlers.pointerdown(event(300, 300));
  a.elements.token.handlers.pointermove(event(500, 500));
  await a.elements.token.handlers.pointerup(event(500, 500));
  failWrite = false;
  assert.deepEqual(center(a), ['300px', '300px']);
  assert.equal(a.tokenStates.get(characterId).message.textContent, 'Pozici postavy se nepodařilo uložit. Zkus obnovit stránku a přesunout ji znovu.');
  await a.switchMap('test-map');
  assert.deepEqual(center(a), ['405px', '405px']);
  a.elements.map.handlers.error();
  assert.equal(a.elements.token.hidden, true);
  assert.equal(a.elements['map-status'].textContent, 'Obrázek mapy se nepodařilo načíst. Zkus obnovit stránku.');
  // INSERT během rozpracovaného SELECTu s prázdným výsledkem nesmí zase zmizet.
  delete rows.token_positions['mapa-akademie'];
  let releaseEmptyRead;
  delayPositionRead = { mapId: 'mapa-akademie', promise: new Promise(resolve => { releaseEmptyRead = resolve; }) };
  await listeners.find(l => l.table === 'game_state').fn({ new: { active_map_id: 'mapa-akademie' } });
  assert.equal(a.elements.token.hidden, true);
  rows.token_positions['mapa-akademie'] = { character_id: characterId, map_id: 'mapa-akademie', x: 420, y: 420 };
  emit('token_positions', rows.token_positions['mapa-akademie'], 'INSERT');
  releaseEmptyRead(); await settle(); delayPositionRead = null;
  assert.equal(a.elements.token.hidden, false);
  assert.deepEqual(center(a), ['420px', '420px']);
  // Leader adds/moves/removes two independent states through the same handlers.
  await a.switchMap('test-map');
  const second = a.tokenStates.get(otherId);
  let finishAdd;
  const beforeAdd = tokenWrites();
  delayPositionWrite = { promise: new Promise(resolve => { finishAdd = resolve; }) };
  const pendingAdd = second.action.handlers.click();
  await second.action.handlers.click();
  assert.equal(second.action.disabled, true);
  finishAdd(); await pendingAdd; delayPositionWrite = null; await settle();
  assert.equal(tokenWrites(), beforeAdd + 1, 'Repeated pending add writes once');
  assert.equal(second.element.hidden, false);
  assert.equal(b.tokenStates.get(otherId).element.hidden, false);
  assert.equal(player.tokenStates.has(otherId), false);
  assert.equal(second.action.textContent, 'Odebrat');
  const added = { ...otherPositions['test-map'] };
  const countAfterAdd = tokenWrites();
  second.element.handlers.pointerdown(event(added.x, added.y));
  second.element.handlers.pointermove(event(310, 290));
  assert.equal(tokenWrites(), countAfterAdd, 'No writes during drag');
  await second.element.handlers.pointerup(event(310, 290)); await settle();
  assert.deepEqual([otherPositions['test-map'].x, otherPositions['test-map'].y], [315, 315]);
  assert.equal(b.tokenStates.get(otherId).element.style.left, '315px');
  const primary = { ...rows.token_positions['test-map'] };
  confirmResult = false;
  await second.action.handlers.click(); assert.equal(second.element.hidden, false);
  confirmResult = true;
  failWrite = true;
  await second.action.handlers.click();
  assert.equal(second.element.hidden, false);
  assert.match(second.message.textContent, /nepodařilo odebrat/);
  failWrite = false;
  await second.action.handlers.click(); await settle();
  assert.equal(second.element.hidden, true);
  assert.equal(b.tokenStates.get(otherId).element.hidden, true);
  assert.equal(second.action.textContent, 'Přidat');
  assert.equal(second.message.textContent, '');
  assert.deepEqual(rows.token_positions['test-map'], primary);
  // DELETE of player's own token cancels an in-flight drag and must not resurrect on pointerup.
  const otherMapPosition = { ...rows.token_positions['mapa-akademie'] };
  player.elements.token.handlers.pointerdown(event(primary.x, primary.y));
  player.elements.token.handlers.pointermove(event(600, 500));
  await a.tokenStates.get(characterId).action.handlers.click(); await settle();
  const afterDelete = tokenWrites();
  await player.elements.token.handlers.pointerup(event(600, 500));
  assert.equal(tokenWrites(), afterDelete);
  assert.equal(player.elements.token.hidden, true);
  assert.equal(b.elements.token.hidden, true);
  assert.deepEqual(rows.token_positions['mapa-akademie'], otherMapPosition);
  // The player adds and moves their own token using their session RPC bridge.
  await player.elements['add-token'].handlers.click(); await settle();
  assert.equal(a.elements.token.hidden, false);
  const own = rows.token_positions['test-map'];
  player.elements.token.handlers.pointerdown(event(own.x, own.y));
  await player.elements.token.handlers.pointerup(event(300, 300)); await settle();
  assert.deepEqual(center(a), ['315px', '315px']);
  // Primary-key-only DELETE forces a fresh RPC read on the existing subscription.
  delete rows.token_positions['test-map'];
  emit('token_positions', { id: 'opaque-primary-key' }, 'DELETE'); await settle();
  assert.equal(a.elements.token.hidden, true);
  assert.equal(player.elements.token.hidden, true);
  assert.equal(a.tokenStates.get(otherId).element.hidden, true);
  // Neznámá mapa se nesmí tiše zobrazit jako test-map.
  await listeners.find(l => l.table === 'game_state').fn({ new: { active_map_id: 'unknown' } });
  assert.equal(a.elements.map.hidden, true);
  assert.equal(a.elements['active-map-status'].textContent, 'Tato mapa není dostupná. Vyber jinou mapu ze seznamu.');
  failRead = 'map_config';
  const missingConfig = await client();
  assert.equal(missingConfig.elements.map.hidden, true);
  assert.equal(missingConfig.elements['cell-size-status'].textContent, 'Velikost pole se nepodařilo načíst. Zkus obnovit stránku.');
  failRead = true;
  const broken = await client();
  assert.equal(broken.elements['active-map-status'].textContent, 'Aktivní mapu se nepodařilo načíst. Zkus obnovit stránku.');
  assert.equal(broken.elements['cell-size'].handlers.input, undefined);
  console.log('PASS: multiple tokens, session RPC mutations, add/move/delete realtime, player scope, per-map persistence, stale responses, snap/grid regressions');
})().catch(error => { console.error(error); process.exitCode = 1; });
