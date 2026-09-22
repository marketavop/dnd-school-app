const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const { webcrypto } = require('crypto');
const source = fs.readFileSync('public/rolls.js', 'utf8').replaceAll('export ', '');
const channels = [];
let queue = [];
let reject = false;
const db = {
  channel(name, options) {
    assert.equal(name, 'game-rolls-v1');
    assert.equal(options.config.broadcast.ack, true);
    const handlers = {};
    const c = { connected: true,
      on(type, filter, callback) { handlers[filter.event] = callback; return c; },
      subscribe(callback) { c.state = callback; callback('SUBSCRIBED'); return c; },
      async send(message) {
        if (reject) return 'timed out';
        for (const peer of channels) if (peer !== c && peer.connected) queue.push(() => peer.receive(message));
        return 'ok';
      },
      receive(message) { handlers[message.event]?.({ payload: message.payload }); },
    };
    channels.push(c);
    return c;
  },
  removeChannel(c) { c.connected = false; },
};
function flush(reverse = false) { while (queue.length) (reverse ? queue.pop() : queue.shift())(); }
const context = vm.createContext({ crypto: webcrypto, console: { error() {} }, Uint32Array });
vm.runInContext(source + '\nglobalThis.api = { connectRolls, rollDie };', context);
const { connectRolls, rollDie } = context.api;
for (const n of [4,6,8,10,12,20,100]) for (let i=0;i<1000;i++) { const r=rollDie(n); assert.ok(Number.isInteger(r) && r>=1 && r<=n); }
assert.throws(() => rollDie(3));
const a = { id:'12345678-1234-4321-9876-123456789abc', name:'Postava A' };
const b = { id:'abcdefab-1234-4321-9876-abcdefabcdef', name:'Postava B' };
let logA, logB, logC, failures = [];
const A = connectRolls(db,a,r=>logA=r,()=>{},e=>failures.push(e));
const B = connectRolls(db,b,r=>logB=r,()=>{},e=>failures.push(e));
flush();
const first=A.roll(20);
assert.equal(logA[0].id,first.id); // okamžitě před doručením
flush();
assert.equal(logB[0].character_id,a.id);
assert.equal(logB[0].name,a.name);
B.roll(100); flush();
assert.equal(logA[0].name,b.name);
for(let i=0;i<12;i++) { A.roll(8); flush(); }
assert.equal(logA.length,10);
assert.equal(JSON.stringify(logA),JSON.stringify(logB));
const x=A.roll(6), y=A.roll(6);
assert.notEqual(x.id,y.id);
flush(true);
assert.equal(logB[0].id,y.id);
A.roll(4); B.roll(12); flush(true);
assert.equal(JSON.stringify(logA),JSON.stringify(logB));
const C=connectRolls(db,a,r=>logC=r,()=>{},()=>{}); flush();
assert.equal(JSON.stringify(logC),JSON.stringify(logA));
channels[1].connected=false; channels[1].state('CHANNEL_ERROR');
assert.equal(B.roll(6),undefined);
A.roll(10); flush();
channels[1].connected=true; channels[1].state('SUBSCRIBED'); flush();
assert.equal(JSON.stringify(logA),JSON.stringify(logB));
const before=JSON.stringify(logA);
channels[0].receive({event:'roll',payload:{...first,id:'bad',result:999}});
assert.equal(JSON.stringify(logA),before);
reject=true; A.roll(6);
setImmediate(() => {
  assert.equal(failures.length,1);
  C.close();
  console.log('PASS: all dice ranges, immediate roll, two identities, shared top ten, double click, reordered/concurrent delivery, late join, reconnect, invalid payload, send failure');
});
