const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('public/grid.js', 'utf8').replace('export ', '')
  + fs.readFileSync('public/map-preparation.js', 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export ', '').replace('const panel', 'const mapImageUrl = path => path; const resolveMapImage = async path => path;\nconst panel');
function page(role = 'leader') {
  const elements = {};
  const element = () => ({ hidden: true, style: {}, handlers: {}, attributes: {}, children: [], validity: {},
    classList: { add() {}, remove() {} },
    setAttribute(k, v) { this.attributes[k] = v; }, removeAttribute(k) { delete this[k]; },
    addEventListener(k, v) { this.handlers[k] = v; }, replaceChildren() { this.children = []; },
    append(child) { this.children.push(child); }, click() {},
  });
  for (const id of ['map-preparation', 'leader-maps', 'prep-cell-size', 'prep-error', 'prep-status', 'prep-save',
    'prep-image', 'prep-grid', 'prep-space', 'prep-viewport', 'prep-name', 'prep-back', 'leader-maps-link', 'main']) elements[id] = element();
  Object.assign(elements['prep-image'], { complete: true, naturalWidth: 1310, naturalHeight: 1200 });
  Object.assign(elements['prep-viewport'], { clientWidth: 655, clientHeight: 600 });
  Object.defineProperty(elements['prep-cell-size'], 'valueAsNumber', { get() { return Number(this.value); } });
  const rows = [{ map_id: 'mapa-akademie', name: 'Mapa akademie', image_path: './assets/maps/mapa-akademie.png', cell_size: 90 },
    { map_id: 'test-map', name: 'Test map', image_path: './assets/maps/test-map.png', cell_size: 100 }];
  const writes = [];
  let fail = false, wait = null, reads = 0;
  const context = vm.createContext({
    getCurrentUser: () => ({ role }), ResizeObserver: class { observe() {} }, console: { error() {} },
    document: { querySelector: s => elements[s.replace(/^#/, '')], createElementNS: element },
    loadMaps: async () => { reads++; return rows.map(row => ({ ...row })); },
    setMapCellSize: async (id, size) => {
      writes.push({ id, size }); if (wait) await wait; if (fail) throw new Error('denied');
      rows.find(row => row.map_id === id).cell_size = size; return size;
    },
  });
  vm.runInContext(source, context, { importModuleDynamically: async () => ({ SUPABASE_URL: 'https://project.supabase.co' }) });
  return { elements, rows, writes, reads: () => reads,
    open: id => vm.runInContext(`openMapPreparation('${id}')`, context),
    input: value => { elements['prep-cell-size'].value = String(value); elements['prep-cell-size'].handlers.input(); },
    save: () => elements['prep-save'].handlers.click(), back: () => elements['prep-back'].handlers.click(),
    fail: () => { fail = true; }, delay: promise => { wait = promise; },
  };
}
(async () => {
  const p = page(); await p.open('mapa-akademie');
  assert.equal(p.elements['prep-image'].src, './assets/maps/mapa-akademie.png');
  assert.equal(p.elements['prep-cell-size'].value, 90);
  assert.equal(p.elements['prep-grid'].children.length, 29);
  assert.equal(p.elements['prep-space'].style.transform, 'scale(0.5)');
  p.input(120);
  assert.equal(p.elements['prep-grid'].children.length, 22);
  assert.equal(p.rows[0].cell_size, 90);
  assert.equal(p.writes.length, 0, 'Input never writes');
  await p.save(); assert.deepEqual(p.writes, [{ id: 'mapa-akademie', size: 120 }]);
  p.back(); await p.open('mapa-akademie'); assert.equal(p.elements['prep-cell-size'].value, 120);
  const lastGrid = p.elements['prep-grid'].children;
  for (const value of ['', 10, 500, 'NaN']) {
    p.input(value); assert.equal(p.elements['prep-save'].disabled, true);
    assert.equal(p.elements['prep-cell-size'].attributes['aria-invalid'], 'true');
    assert.equal(p.elements['prep-grid'].children, lastGrid);
    await p.save(); assert.equal(p.writes.length, 1); assert.equal(p.rows[0].cell_size, 120);
  }
  for (const value of [20, 300, 80.5]) {
    p.input(value); assert.equal(p.elements['prep-error'].textContent, '');
    assert.equal(p.elements['prep-save'].disabled, false);
  }
  await p.save(); assert.equal(p.rows[0].cell_size, 80.5);
  assert.equal(p.rows[1].cell_size, 100);
  p.fail(); p.input(150); await p.save();
  assert.match(p.elements['prep-status'].textContent, /nepodařilo/);
  assert.equal(p.rows[0].cell_size, 80.5);
  const denied = page('player'); await denied.open('test-map'); assert.equal(denied.reads(), 0);
  const stale = page(); await stale.open('test-map'); stale.input(110);
  let done; stale.delay(new Promise(resolve => { done = resolve; }));
  const pending = stale.save(); await stale.save(); assert.equal(stale.writes.length, 1);
  stale.back(); await stale.open('mapa-akademie'); done(); await pending;
  assert.equal(stale.elements['prep-cell-size'].value, 90);
  assert.equal(stale.elements['prep-name'].textContent, 'Mapa akademie');
  const game = fs.readFileSync('public/game.html', 'utf8');
  assert.ok(game.includes('<output id="cell-size">'));
  assert.ok(!game.includes('<input id="cell-size"'));
  console.log('PASS: shared grid, local preview, explicit save, validation/decimals, reopen, errors and stale response');
})().catch(error => { console.error(error); process.exitCode = 1; });
