// Bez závislostí: node tests/map-space.cjs
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = {};
for (const id of ['map', 'map-space', 'map-status', 'grid', 'token', 'status', 'connection', 'position', 'cell-size', 'cell-size-error', 'cell-size-status', 'map-select', 'active-map-status', 'add-token', 'add-token-message', 'remove-token', 'remove-token-message']) {
  elements[id] = { style: {}, hidden: true, handlers: {},
    classList: { add() {}, remove() {} }, setPointerCapture() {}, releasePointerCapture() {},
    addEventListener(type, handler) { this.handlers[type] = handler; } };
}
elements['map-select'].append = () => {};
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
const context = vm.createContext({ window: { confirm: () => true }, document: {
  querySelector: s => elements[s.slice(1)],
  createElement() { return {}; },
  createElementNS(namespace, tag) { return { namespace, tag, attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); } }; },
} });
// Zachováme skutečné handlery; síťový bootstrap nahradíme testovací DB.
const source = readFileSync('public/app.js', 'utf8').split('\ntry {\n  const { SUPABASE_URL')[0];
vm.runInContext(source, context);
const input = elements['cell-size'];
const preview = async value => { input.value = String(value); input.handlers.input(); await vm.runInContext('configWriteQueue', context); };
assert.equal(Number(input.value), 100);
assert.equal(Number(input.min), 20);
assert.equal(Number(input.max), 300);
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
} : ({ upsert: (point, options) => {
  assert.equal(table, 'token_positions');
  assert.equal(point.character_id, 'd16ac8a0-ba74-40e7-8402-c75cfe3a4ab6');
  assert.equal(point.map_id, 'test-map');
  assert.equal(options.onConflict, 'character_id,map_id');
  const coords = { x: point.x, y: point.y };
  writes.push(coords);
  return { select: () => ({ single: async () => ({ data: coords }) }) };
} }) };
vm.runInContext('db = mockDb; activeMapId = "test-map"; connected = true; positionConnected = true; configReady = true; savedCellSize = 100; loading = false; saved = { x: 100, y: 100 }; render(saved);', context);
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
  vm.runInContext('render({ x: 0, y: 2000 });', context);
  assert.deepEqual(point(), [45, 979]);
  assert.equal(writes.length, 1, 'Načtení mimo hranice samo nezapisuje');
  for (const [x, y, expected] of [[1520, 260, [1450, 250]], [260, 1010, [250, 950]],
    [1535, 1023, [1450, 950]], [0, 0, [50, 50]], [349, 299, [350, 250]]]) {
    vm.runInContext('render(saved);', context);
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
  vm.runInContext('render({ x: 45, y: 45 });', context);
  const savedBefore = vm.runInContext('JSON.stringify(saved)', context);
  const countBefore = writes.length;
  for (const [size, diameter, lines] of [[80, 72, 33], [20, 18, 129], [300, 270, 10], [80.5, 72.45, 33]]) {
    await preview(size);
    assert.equal(elements.token.style.width, `${diameter}px`);
    assert.equal(elements.token.style.height, `${diameter}px`);
    assert.equal(elements.grid.children.length, lines);
    assert.deepEqual(point(), [45, 45]);
    assert.equal(elements['map-space'].style.width, '1536px');
    assert.equal(elements['map-space'].style.height, '1024px');
    assert.equal(vm.runInContext('JSON.stringify(saved)', context), savedBefore);
    assert.equal(writes.length, countBefore);
  }
  const lastGrid = JSON.stringify(elements.grid.children);
  const configCount = configWrites.length;
  for (const [value, message] of [['', 'Zadej velikost pole.'], [10, 'Zadej velikost pole od 20 do 300 px.'], [500, 'Zadej velikost pole od 20 do 300 px.']]) {
    await preview(value);
    assert.equal(elements['cell-size-error'].textContent, message);
    assert.equal(input.attributes['aria-invalid'], 'true');
    assert.equal(JSON.stringify(elements.grid.children), lastGrid);
    assert.equal(elements.token.style.width, '72.45px');
    assert.deepEqual(point(), [45, 45]);
    assert.equal(writes.length, countBefore);
    assert.equal(configWrites.length, configCount);
  }
  input.validity.badInput = true;
  await preview('');
  assert.equal(elements['cell-size-error'].textContent, 'Zadej velikost pole jako číslo.');
  input.validity.badInput = false;
  await preview(80);
  assert.equal(elements['cell-size-error'].textContent, '');
  assert.equal(input.attributes['aria-invalid'], 'false');
  assert.equal(writes.length, countBefore);
  // Následující drop používá poslední platnou velikost (80), i při chybě inputu.
  await preview(500);
  h.pointerdown(event(rect.left + 45, rect.top + 45));
  h.pointermove(event(rect.left + 210, rect.top + 190));
  assert.equal(writes.length, countBefore);
  await h.pointerup(event(rect.left + 210, rect.top + 190));
  assert.deepEqual(writes.at(-1), { x: 200, y: 200 });
  assert.equal(writes.length, countBefore + 1);
  // Nový běh modulu načte uložených 80 z DB namísto výchozích 100.
  const reload = vm.createContext({ document: context.document, mockDb: context.mockDb });
  vm.runInContext(source + '\ndb = mockDb; connected = true;', reload);
  await vm.runInContext('loadMapConfig()', reload);
  assert.equal(Number(input.value), 80);
  assert.equal(elements.token.style.width, '72px');
  console.log('PASS: map-space, drag/snap regressions; grid validation, unchanged token x/y, persisted config on restart');
})().catch(error => { console.error(error); process.exitCode = 1; });
