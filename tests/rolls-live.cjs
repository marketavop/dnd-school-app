// Opt-in transport test: two independent browser contexts, isolated ephemeral channel, no DB writes.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const channel = 'roll-test-' + require('crypto').randomUUID();
const root = path.resolve(__dirname, '../public');
const server = http.createServer((req,res) => {
  const requested = new URL(req.url,'http://local').pathname;
  if (requested === '/') { res.end('<!doctype html><title>Roll transport test</title>'); return; }
  if (!['/rolls.js','/config.local.js'].includes(requested)) { res.statusCode=404; res.end(); return; }
  let source=fs.readFileSync(path.join(root,requested),'utf8');
  if (requested==='/rolls.js') source=source.replace("'game-rolls-v1'",JSON.stringify(channel));
  res.setHeader('Content-Type','application/javascript'); res.end(source);
});
(async()=> {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    const pages=[];
    for (const [id,name] of [['12345678-1234-4321-9876-123456789abc','Transport A'],['abcdefab-1234-4321-9876-abcdefabcdef','Transport B']]) {
      const ctx=await browser.newContext(); const page=await ctx.newPage(); pages.push(page);
      await page.goto('http://127.0.0.1:'+server.address().port);
      await page.evaluate(async ({id,name})=> {
        const config=await import('/config.local.js');
        const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm');
        const {connectRolls}=await import('/rolls.js');
        const db=createClient(config.SUPABASE_URL,config.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
        window.session=connectRolls(db,{id,name},r=>window.rolls=r,c=>window.connected=c,e=>window.failure=e);
      },{id,name});
      await page.waitForFunction(()=>window.connected,{},{timeout:20000});
    }
    for(let i=0;i<13;i++) {
      const actor=pages[i%2];
      const roll=await actor.evaluate(()=>window.session.roll(20));
      for(const page of pages) await page.waitForFunction(id=>window.rolls?.[0]?.id===id,roll.id,{timeout:15000});
    }
    const a=await pages[0].evaluate(()=>window.rolls), b=await pages[1].evaluate(()=>window.rolls);
    assert.equal(a.length,10); assert.deepEqual(a,b);
    assert.equal(a[0].name,'Transport A');
    assert.equal(await pages[0].evaluate(()=>window.failure),undefined);
    assert.equal(await pages[1].evaluate(()=>window.failure),undefined);
    console.log('PASS: actual Supabase Broadcast, two independent contexts, two identities, matching last ten; isolated channel, no DB writes');
  } finally { await browser.close(); }
})().catch(e=> { console.error(e.message); process.exitCode=1; }).finally(()=>server.close());
