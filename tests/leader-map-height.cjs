// Layout regression: production HTML/CSS and fitMap, fixed map/token fixture, no live DB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '../public');
const fit = fs.readFileSync(path.join(root, 'app.js'), 'utf8').split('function resetCamera')[0].replace(/^import .*;\r?\n/gm, '');
const server = http.createServer((req, res) => {
  const file = path.join(root, new URL(req.url, 'http://local').pathname);
  try {
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html');
    res.end(fs.readFileSync(file));
  } catch { res.writeHead(404); res.end(); }
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({channel: 'msedge', headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1920,height:1080}, deviceScaleFactor:1});
    await page.route('**/*.js', route => route.fulfill({contentType:'application/javascript', body:''}));
    const url = `http://127.0.0.1:${server.address().port}/game.html`;
    async function setup(role, count) {
      await page.goto(url);
      await page.evaluate(({role, count, fit}) => {
        document.documentElement.dataset.gameRole = role;
        document.querySelector('#game-content').hidden = false;
        document.querySelector('#navigation-status').textContent = '';
        for (const id of ['map-select-label','map-select','scene-players']) document.getElementById(id).hidden = role !== 'leader';
        for (const id of ['scene-players-list']) {
          for (let i=0; i<count; i++) {
            const li = document.createElement('li');
            const button = document.createElement('button'); button.textContent = 'Odebrat';
            const status = document.createElement('p'); status.setAttribute('role','status');
            li.append(`Postava ${i+1} `, button, status);
            document.getElementById(id).append(li);
          }
        }
        const script = document.createElement('script');
        script.textContent = fit + `
          new ResizeObserver(fitMap).observe(mapViewport);
          map.onload = () => {
            mapSpace.style.width = map.naturalWidth+'px'; mapSpace.style.height = map.naturalHeight+'px';
            map.hidden = false;
            const token = document.createElement('div'); token.className='token'; token.textContent='T';
            Object.assign(token.style,{left:'350px',top:'450px',width:'90px',height:'90px'}); mapSpace.append(token);
            const grid = document.querySelector('#grid'); grid.setAttribute('width',map.naturalWidth); grid.setAttribute('height',map.naturalHeight);
            fitMap();
          }; map.src='./assets/maps/test-map.png';`;
        document.body.append(script);
      }, {role,count,fit});
      await page.waitForSelector('.token');
    }
    async function check(role) {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const g = await page.evaluate(() => {
        const v = document.querySelector('#map-viewport').getBoundingClientRect();
        const img = document.querySelector('#map'), m = img.getBoundingClientRect();
        const token = document.querySelector('.token'), t = token.getBoundingClientRect();
        const grid = document.querySelector('#grid').getBoundingClientRect();
        return {height:v.height, window:innerHeight, bottom:v.bottom,
          fits:m.left>=v.left-1 && m.right<=v.right+1 && m.top>=v.top-1 && m.bottom<=v.bottom+1,
          aspect:Math.abs(m.width/m.height-img.naturalWidth/img.naturalHeight)<0.001,
          aligned:Math.abs(grid.width-m.width)<1 && Math.abs(grid.height-m.height)<1 &&
            Math.abs((t.left+t.width/2-m.left)/(m.width/img.naturalWidth)-350)<0.1 &&
            Math.abs((t.top+t.height/2-m.top)/(m.height/img.naturalHeight)-450)<0.1,
          x:token.style.left,y:token.style.top};
      });
      console.log(role, JSON.stringify(g));
      assert.ok(g.height >= g.window * 0.4, 'Map must retain usable height');
      assert.ok(g.bottom <= g.window+1 && g.fits && g.aspect && g.aligned);
      assert.equal(g.x,'350px'); assert.equal(g.y,'450px');
    }
    for (const count of [4,20]) {
      await setup('leader',count);
      for (const size of [{width:1920,height:1080},{width:1280,height:720},{width:1920,height:918},{width:1920,height:1080}]) {
        await page.setViewportSize(size); await check('leader');
      }
      await setup('leader',count); await check('leader reload');
    }
    await setup('player',0); await check('player');
    console.log('PASS: leader map height, resize, reload, aspect ratio, grid/token alignment, player layout');
  } finally { await browser.close(); }
})().catch(error => {console.error(error); process.exitCode=1;}).finally(() => server.close());
