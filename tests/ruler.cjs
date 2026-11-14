// Bez závislostí: node tests/ruler.cjs
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = readFileSync('public/ruler.js', 'utf8').replace(/export /g, '');
const context = vm.createContext({ Number, Math });
vm.runInContext(`${source}
  globalThis.api = { pointerToMapPoint, mapPointToCell, pointerToCell, cellCenter, measureDistanceFeet };
`, context);
const { pointerToMapPoint, mapPointToCell, pointerToCell, cellCenter, measureDistanceFeet } = context.api;

const cellSize = 100;
const cell = (x, y) => ({ x, y });
const assertCell = (actual, expected) => {
  assert.equal(actual.x, expected.x);
  assert.equal(actual.y, expected.y);
};

// Začátek i konec jsou určeny poli, ne přesnou pozicí pointeru.
assertCell(mapPointToCell({ x: 149, y: 251 }, cellSize), cell(1, 2));
assertCell(cellCenter(cell(1, 2), cellSize), { x: 150, y: 250 });
assertCell(pointerToCell({ clientX: 275, clientY: 425 }, { left: 25, top: 25 }, 1, cellSize), cell(2, 4));

// §23: stejná osa i diagonála používají Chebyshevovu vzdálenost.
for (const [start, end, expected] of [
  [cell(2, 3), cell(2, 3), 0],
  [cell(2, 3), cell(3, 3), 5],
  [cell(2, 3), cell(3, 4), 5],
  [cell(1, 1), cell(4, 5), 20],
]) assert.equal(measureDistanceFeet(start, end), expected);

// Zoom a pan mění jen převod pointeru do map-space; výsledek pole zůstává stejný.
const mapPoint = cellCenter(cell(4, 6), cellSize);
const camera = { left: 380, top: 210 };
for (const scale of [0.5, 1, 2, 4]) {
  const pointer = { clientX: camera.left + mapPoint.x * scale, clientY: camera.top + mapPoint.y * scale };
  assertCell(pointerToCell(pointer, camera, scale, cellSize), cell(4, 6));
}

// Změna pixelové velikosti pole nemění vzdálenost ve ft.
const start = cell(3, 4);
const end = cell(6, 8);
for (const size of [20, 80, 100, 150, 300]) {
  assertCell(mapPointToCell(cellCenter(start, size), size), start);
  assertCell(mapPointToCell(cellCenter(end, size), size), end);
  assert.equal(measureDistanceFeet(start, end), 20);
}

console.log('PASS: ruler cell selection, centers, zoom/pan invariance and distances');
