// Bez závislostí: node tests/map-space.cjs
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = {};
for (const id of ['npc-controls', 'npc-status', 'npc-list', 'npc-form']) elements[id] = { addEventListener() {}, replaceChildren() {} };
for (const id of ['scene-players', 'scene-players-list', 'map', 'map-space', 'map-status', 'grid', 'token', 'status', 'connection', 'position', 'cell-size', 'cell-size-error', 'cell-size-status', 'map-select', 'active-map-status', 'add-token', 'add-token-message', 'remove-token', 'remove-token-message']) {
  elements[id] = { style: {}, hidden: true, handlers: {},
    setAttribute() {},
    classList: { add() {}, remove() {} }, setPointerCapture() {}, releasePointerCapture() {},
    addEventListener(type, handler) { this.handlers[type] = handler; } };
}
elements['map-select'].append = () => {};
elements['map-space'].append = () => {};
Object.assign(elements.map, { complete: false, naturalWidth: 1536, naturalHeight: 1024 });
Object.assign(elements['cell-size'], { value: '', validity: { badInput: false }, attributes: {},
  setAttribute(name, value) { this.attributes[name] = value; } });
Object.defineProperty(elements['cell-size'], 'valueAsNumber', {
  get() { return this.value === '' ? NaN : Number(this.value); },
});
let rect = { left: 32, top: 284 };
elements['map-space'].getBoundingClientRect = () => rect;
Object.assign(elements.grid, { attributes: {}, children: [],
  setAttribute(name, value) { this.attributes[name] = String(value); },
  replaceChildren() { this.children = []; },
  append(child) { this.children.push(child); } });
let resizeMap;
elements['map-viewport'] = { clientWidth: 2000, clientHeight: 2000, handlers: {},
  addEventListener(type, fn) { this.handlers[type] = fn; },
  getBoundingClientRect() { return { left: 0, top: 0 }; },
  classList: { add() {}, remove() {} }, setPointerCapture() {}, hasPointerCapture() { return false; } };
elements['fit-map'] = { addEventListener(type, fn) { this.click = fn; } };
class ResizeObserver {
  constructor(callback) { resizeMap = callback; }
  observe(target) { assert.equal(target, elements['map-viewport']); }
}
const context = vm.createContext({ ResizeObserver, URLSearchParams, window: { parent: {
  getGameIdentity: () => ({ role: 'player', character_id: 'd16ac8a0-ba74-40e7-8402-c75cfe3a4ab6' }),
  mutateGameToken: async (action, id, mapId, point) => {
    assert.equal(action, 'move'); assert.equal(id, 'd16ac8a0-ba74-40e7-8402-c75cfe3a4ab6');
    assert.equal(mapId, 'test-map'); const coords = { x: point.x, y: point.y }; writes.push(coords); return coords;
  },
}, location: { search: '?character_id=d16ac8a0-ba74-40e7-8402-c75cfe3a4ab6' }, confirm: () => true }, document: {
  querySelector: s => elements[s.slice(1)],
  createElement() { return { style: {}, classList: { add() {}, remove() {} }, handlers: {},
    setAttribute() {}, addEventListener(type, fn) { this.handlers[type] = fn; },
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture() { return true; } }; },
  createElementNS(namespace, tag) { return { namespace, tag, attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); } }; },
} });
// Zachováme skutečné handlery; síťový bootstrap nahradíme testovací DB.
const source = (readFileSync('public/grid.js', 'utf8').replace('export ', '') + readFileSync('public/app.js', 'utf8').replace("import { renderGrid } from './grid.js';", '')).replace(/\r\n/g, '\n').split('\ntry {\n  const { SUPABASE_URL')[0];
vm.runInContext(source.replace("import { configureMapImageUrl, resolveMapImage } from './map-image.js';", '') + "\nconst testState = createToken({ character_id: gameIdentity.character_id, name: 'Test' });", context);
elements.token = vm.runInContext('testState.element', context);
const input = elements['cell-size'];
const preview = async value => vm.runInContext(`applyCellSize(${value})`, context);
assert.equal(Number(input.value), 100);
assert.equal(input.handlers.input, undefined);
vm.runInContext('applyCellSize(80)', context); // Konfigurace může přijít před PNG.
assert.equal(elements.token.style.width, '72px');
assert.equal(elements.grid.children.length, 0);
vm.runInContext('applyCellSize(100)', context);
let writes = [];
let configWrites = [];
let configRow = { cell_size: 100 };
context.mockDb = { from: table => table === 'map_config' ? {
  select() { return this; }, eq() { return this; },
  update(value) { configWrites.push(value); configRow = value; return this; },
  single: async () => ({ data: configRow }),
} : (() => { throw new Error('Direct token write forbidden'); })() };
vm.runInContext('db = mockDb; activeMapId = "test-map"; connected = true; positionConnected = true; configReady = true; savedCellSize = 100; loading = false; positionLoaded = true; testState.saved = { x: 100, y: 100 }; render(testState, testState.saved);', context);
assert.equal(elements.token.hidden, true, 'Token čeká na PNG');
assert.equal(elements.token.style.width, '90px');
assert.equal(elements.token.style.height, '90px');
elements.map.complete = true;
elements.map.handlers.load();
assert.equal(elements.token.style.left, '100px');
assert.equal(elements.token.style.top, '100px');
assert.equal(elements['map-space'].style.width, '1536px');
assert.equal(elements['map-space'].style.height, '1024px');
assert.equal(elements.grid.attributes.width, '1536');
assert.equal(elements.grid.attributes.height, '1024');
assert.equal(elements.grid.children.length, 27);
assert.deepEqual(elements.grid.children[0].attributes, { x1: '0', y1: '0', x2: '0', y2: '1024' });
assert.deepEqual(elements.grid.children[15].attributes, { x1: '1500', y1: '0', x2: '1500', y2: '1024' });
assert.deepEqual(elements.grid.children[26].attributes, { x1: '0', y1: '1000', x2: '1536', y2: '1000' });
const event = (x, y) => ({ button: 0, pointerId: 1, clientX: x, clientY: y, preventDefault() {} });
const h = elements.token.handlers;
const point = () => [parseFloat(elements.token.style.left), parseFloat(elements.token.style.top)];
(async () => {
  // Legacy pozice se nesnapuje ani při načtení, ani při kliku.
  h.pointerdown(event(132, 384));
  await h.pointerup(event(132, 384));
  assert.deepEqual(point(), [100, 100]);
  assert.equal(writes.length, 0);
  h.pointerdown(event(137, 389)); // Úchop 5 px od středu.
  h.pointermove(event(337, 489));
  assert.deepEqual(point(), [300, 200]);
  assert.equal(writes.length, 0);
  rect = { left: -68, top: 234 }; // Scroll během dragu.
  h.pointermove(event(337, 489));
  assert.deepEqual(point(), [400, 250]);
  for (const [x, y, expected] of [[-999, 489, [45, 250]], [9999, 489, [1491, 250]],
    [337, -999, [400, 45]], [337, 9999, [400, 979]]]) {
    h.pointermove(event(x, y));
    assert.deepEqual(point(), expected);
  }
  await h.pointerup(event(337, 489));
  assert.deepEqual(writes, [{ x: 450, y: 250 }]);
  await h.pointerup(event(337, 489));
  assert.equal(writes.length, 1);
  h.pointerdown(event(337, 489));
  h.pointermove(event(500, 500));
  h.pointercancel(event(500, 500));
  assert.deepEqual(point(), [450, 250]);
  assert.equal(writes.length, 1);
  h.pointerdown(event(337, 489));
  await h.pointerup(event(337, 489));
  assert.equal(writes.length, 1);
  vm.runInContext('render(testState, { x: 0, y: 2000 });', context);
  assert.deepEqual(point(), [45, 979]);
  assert.equal(writes.length, 1, 'Načtení mimo hranice samo nezapisuje');
  for (const [x, y, expected] of [[1520, 260, [1450, 250]], [260, 1010, [250, 950]],
    [1535, 1023, [1450, 950]], [0, 0, [50, 50]], [349, 299, [350, 250]]]) {
    vm.runInContext('render(testState, testState.saved);', context);
    const [sx, sy] = point();
    h.pointerdown(event(rect.left + sx, rect.top + sy));
    h.pointermove(event(rect.left + x, rect.top + y));
    const count = writes.length;
    await h.pointerup(event(rect.left + x, rect.top + y));
    assert.deepEqual(point(), expected);
    assert.deepEqual(writes.at(-1), { x: expected[0], y: expected[1] });
    assert.equal(writes.length, count + 1);
  }
  // MAP-005: změna velikosti nesmí změnit ani zobrazený střed u kraje, ani DB.
  vm.runInContext('render(testState, { x: 45, y: 45 });', context);
  const savedBefore = vm.runInContext('JSON.stringify(testState.saved)', context);
  const countBefore = writes.length;
  for (const [size, diameter, lines] of [[80, 72, 33], [20, 18, 129], [300, 270, 10], [80.5, 72.45, 33]]) {
    await preview(size);
    assert.equal(elements.token.style.width, `${diameter}px`);
    assert.equal(elements.token.style.height, `${diameter}px`);
    assert.equal(elements.grid.children.length, lines);
    assert.deepEqual(point(), [45, 45]);
    assert.equal(elements['map-space'].style.width, '1536px');
    assert.equal(elements['map-space'].style.height, '1024px');
    assert.equal(vm.runInContext('JSON.stringify(testState.saved)', context), savedBefore);
    assert.equal(writes.length, countBefore);
  }
  await preview(80);
  h.pointerdown(event(rect.left + 45, rect.top + 45));
  h.pointermove(event(rect.left + 210, rect.top + 190));
  assert.equal(writes.length, countBefore);
  await h.pointerup(event(rect.left + 210, rect.top + 190));
  assert.deepEqual(writes.at(-1), { x: 200, y: 200 });
  assert.equal(writes.length, countBefore + 1);
  // MAP-010: oba omezující rozměry, žádné zvětšení ani zápis při resize.
  const beforeResize = writes.length;
  const viewport = elements['map-viewport'];
  for (const [width, height, scale, left, top] of [[768, 2000, 0.5, 0, 744], [2000, 256, 0.25, 808, 0], [3000, 3000, 1, 732, 988]]) {
    Object.assign(viewport, { clientWidth: width, clientHeight: height });
    resizeMap();
    assert.equal(elements['map-space'].style.transform, `scale(${scale})`);
    assert.equal(elements['map-space'].style.left, `${left}px`);
    assert.equal(elements['map-space'].style.top, `${top}px`);
    assert.deepEqual(point(), [200, 200]);
    assert.equal(writes.length, beforeResize);
    assert.equal(elements['map-space'].style.width, '1536px');
    assert.equal(elements['map-space'].style.height, '1024px');
  }
  viewport.clientWidth = 768;
  resizeMap();
  h.pointerdown(event(rect.left + 105, rect.top + 105)); // Úchop 10 mapových px od středu při scale 0.5.
  h.pointermove(event(rect.left + 185, rect.top + 145));
  assert.deepEqual(point(), [360, 280]);
  assert.equal(writes.length, beforeResize);
  await h.pointerup(event(rect.left + 185, rect.top + 145));
  assert.deepEqual(writes.at(-1), { x: 360, y: 280 });
  assert.equal(writes.length, beforeResize + 1);
  const beforeCamera = writes.length;
  const wheel = deltaY => viewport.handlers.wheel({ deltaY, deltaMode: 0, clientX: 180, clientY: 220, preventDefault() {} });
  wheel(-Math.log(2) / 0.002);
  assert.equal(vm.runInContext('userZoom', context), 2);
  assert.equal(vm.runInContext('mapScale', context), 1);
  viewport.handlers.pointerdown({ button: 0, pointerId: 22, clientX: 10, clientY: 20, target: { closest: () => null }, preventDefault() {} });
  const oldPan = vm.runInContext('panX', context);
  viewport.handlers.pointermove({ pointerId: 22, clientX: 70, clientY: 40 });
  assert.equal(vm.runInContext('panX', context), oldPan + 60);
  viewport.handlers.pointerup({ pointerId: 22 });
  wheel(-100000);
  assert.equal(vm.runInContext('userZoom', context), 4);
  wheel(100000);
  assert.equal(vm.runInContext('userZoom', context), 0.5);
  assert.deepEqual(point(), [360, 280]);
  assert.equal(writes.length, beforeCamera);
  elements['fit-map'].click();
  assert.equal(vm.runInContext('userZoom', context), 1);
  assert.equal(vm.runInContext('panX + panY', context), 0);
  // Nový běh modulu načte uložených 80 z DB namísto výchozích 100.
  configRow = { cell_size: 80 };
  const reload = vm.createContext({ ResizeObserver, URLSearchParams, window: context.window, document: context.document, mockDb: context.mockDb });
  vm.runInContext(source.replace("import { configureMapImageUrl, resolveMapImage } from './map-image.js';", '') + '\ndb = mockDb; connected = true; createToken({ character_id: gameIdentity.character_id, name: \'Test\' });', reload);
  await vm.runInContext('loadMapConfig()', reload);
  assert.equal(Number(input.value), 80);
  assert.equal(vm.runInContext('tokens.values().next().value.element.style.width', reload), '72px');
  console.log('PASS: map-space, drag/snap regressions; grid validation, unchanged token x/y, persisted config on restart');
})().catch(error => { console.error(error); process.exitCode = 1; });
