// Bez závislostí: node tests/map-space.cjs
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = {};
for (const id of ['map', 'map-space', 'map-status', 'grid', 'token', 'status', 'connection', 'position']) {
  elements[id] = { style: {}, hidden: true, handlers: {},
    classList: { add() {}, remove() {} }, setPointerCapture() {}, releasePointerCapture() {},
    addEventListener(type, handler) { this.handlers[type] = handler; } };
}
Object.assign(elements.map, { complete: false, naturalWidth: 1536, naturalHeight: 1024 });
let rect = { left: 32, top: 284 };
elements['map-space'].getBoundingClientRect = () => rect;
Object.assign(elements.grid, { attributes: {}, children: [],
  setAttribute(name, value) { this.attributes[name] = String(value); },
  replaceChildren() { this.children = []; },
  append(child) { this.children.push(child); } });
const context = vm.createContext({ document: {
  querySelector: s => elements[s.slice(1)],
  createElementNS(namespace, tag) { return { namespace, tag, attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); } }; },
} });
// Zachováme skutečné handlery; síťový bootstrap nahradíme testovací DB.
const source = readFileSync('app.js', 'utf8').split('\ntry {\n  const { SUPABASE_URL')[0];
vm.runInContext(source, context);
let writes = [];
context.mockDb = { from: () => ({ update: point => {
  writes.push({ ...point });
  return { eq: () => ({ select: () => ({ single: async () => ({ data: point }) }) }) };
} }) };
vm.runInContext('db = mockDb; connected = true; loading = false; saved = { x: 100, y: 100 }; render(saved);', context);
assert.equal(elements.token.hidden, true, 'Token čeká na PNG');
assert.equal(elements.token.style.width, '90px');
assert.equal(elements.token.style.height, '90px');
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
  console.log('PASS: image load, center, grab offset, scroll, four edges, drop, cancel, no-op, legacy bounds');
})().catch(error => { console.error(error); process.exitCode = 1; });
