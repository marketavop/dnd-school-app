// Exercise the real host CSS without authentication or backend requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const server = http.createServer((req, res) => {
  const file = path.join(__dirname, '../public', new URL(req.url, 'http://local').pathname);
  try {
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.webp') ? 'image/webp' : 'text/html');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  try {
    const page = await browser.newPage();
    await page.route('**/*.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    for (const width of [1920, 1440, 1024, 768, 375, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
      await page.evaluate(() => { document.querySelector('#home-content').hidden = false; });
      const homeBefore = await page.locator('main').boundingBox();
      await page.evaluate(() => {
        document.querySelector('#home-content').hidden = true;
        document.querySelector('#leader-game').hidden = false;
        document.querySelector('main').classList.add('players-open');
      });
      const geometry = await page.evaluate(() => {
        const main = document.querySelector('main'), rect = main.getBoundingClientRect();
        const frame = document.querySelector('#leader-game-frame').getBoundingClientRect();
        return { left: rect.left, right: innerWidth - rect.right, width: rect.width,
          frameWidth: frame.width, maxWidth: getComputedStyle(main).maxWidth,
          overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.equal(geometry.maxWidth, 'none');
      assert.equal(geometry.overflow, false);
      assert.ok(Math.abs(geometry.width - geometry.frameWidth) < 1);
      assert.ok(geometry.width > width * .94);
      if (width >= 1440) assert.ok(geometry.left >= 16 && geometry.left <= 24 && geometry.right >= 16 && geometry.right <= 24);
      await page.evaluate(() => {
        document.querySelector('#leader-game').hidden = true;
        document.querySelector('#home-content').hidden = false;
        document.querySelector('main').classList.remove('players-open');
      });
      assert.deepEqual(await page.locator('main').boundingBox(), homeBefore);
    }
    console.log('PASS: game host fills available width at 1920–320px, no horizontal overflow, home layout restored');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
