const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const source = readFileSync('public/navigation.js', 'utf8').replace("await import('./app.js')", 'startGame()');
async function render(path, search) {
  const ids = path === 'index.html' ? ['diary-link', 'game-link', 'navigation-status']
    : path === 'game.html' ? ['home-link', 'navigation-status', 'game-content'] : ['home-link'];
  const elements = Object.fromEntries(ids.map(id => [id, { hidden: id === 'game-content', textContent: '',
    removeAttribute() {} }]));
  let starts = 0;
  await vm.runInNewContext(`(async () => { ${source} })()`, {
    URLSearchParams, window: { location: { search } },
    document: { querySelector: selector => elements[selector.slice(1)] },
    startGame: () => { starts++; }, console,
  });
  return { elements, starts };
}
(async () => {
  for (const id of ['12345678-1234-4321-9876-123456789abc', 'ABCDEFAB-1234-4321-9876-ABCDEFABCDEF']) {
    const query = `?character_id=${id}`;
    const home = await render('index.html', query);
    assert.equal(home.starts, 0);
    for (const [link, path] of [['diary-link', 'character.html'], ['game-link', 'game.html']]) {
      assert.equal(home.elements[link].href, `./${path}${query}`);
      const destination = await render(path, query);
      assert.equal(destination.elements['home-link'].href, `./index.html${query}`);
      assert.equal(destination.starts, path === 'game.html' ? 1 : 0);
    }
  }
  for (const query of ['', '?character_id=', '?character_id=bad', '?character_id=12345678-1234-4321-9876-123456789abc&character_id=bad']) {
    const home = await render('index.html', query);
    assert.equal(home.elements['diary-link'].href, undefined);
    assert.equal(home.elements['game-link'].href, undefined);
    assert.ok(home.elements['navigation-status'].textContent);
    for (const path of ['character.html', 'game.html']) {
      const result = await render(path, query);
      assert.equal(result.elements['home-link'].href, './index.html');
      assert.equal(result.starts, 0);
    }
  }
  const game = readFileSync('public/game.html', 'utf8');
  const homepage = readFileSync('public/index.html', 'utf8');
  assert.ok(!homepage.includes('id="map"'));
  assert.ok(game.includes('id="map"'));
  assert.ok(!game.includes('src="./app.js"'));
  console.log('PASS: homepage/diary/game round trips preserve UUID, invalid IDs disable actions and prevent map startup');
})().catch(error => { console.error(error); process.exitCode = 1; });
