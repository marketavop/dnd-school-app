// Pouze krátkodobý společný log; žádný zápis do DB nebo localStorage.
export const DICE = [4, 6, 8, 10, 12, 20, 100];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function rollDie(sides) {
  if (!DICE.includes(sides)) throw new Error('Neplatná kostka.');
  // Rejection sampling zachovává stejnou pravděpodobnost všech výsledků.
  const limit = Math.floor(2 ** 32 / sides) * sides;
  const random = new Uint32Array(1);
  do { crypto.getRandomValues(random); } while (random[0] >= limit);
  return random[0] % sides + 1;
}
function validRoll(roll) {
  return roll && uuid.test(roll.id) && uuid.test(roll.character_id) &&
    typeof roll.name === 'string' && roll.name.length > 0 && roll.name.length <= 200 &&
    DICE.includes(roll.sides) && Number.isInteger(roll.result) && roll.result >= 1 && roll.result <= roll.sides &&
    Number.isSafeInteger(roll.order) && roll.order > 0 && roll.order < Number.MAX_SAFE_INTEGER;
}
export function connectRolls(db, character, render, connection, failure) {
  let rolls = [];
  let clock = 0;
  let connected = false;
  const channel = db.channel('game-rolls-v1', { config: { broadcast: { ack: true, self: false } } });
  function merge(incoming) {
    const byId = new Map(rolls.map(roll => [roll.id, roll]));
    for (const roll of incoming.slice(0, 10)) {
      if (!validRoll(roll)) continue;
      clock = Math.max(clock, roll.order);
      byId.set(roll.id, roll);
    }
    // Logické pořadí + UUID sjednotí i souběžné hody a rozdílné pořadí doručení.
    rolls = [...byId.values()].sort((a, b) => b.order - a.order || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)).slice(0, 10);
    render(rolls);
  }
  async function send(event, payload) {
    try {
      if (await channel.send({ type: 'broadcast', event, payload }) !== 'ok') throw new Error('Broadcast nebyl potvrzen.');
    } catch (error) {
      console.error('Sdílení hodů selhalo:', error);
      failure('Sdílení hodů se nepodařilo potvrdit. Ostatní hráči nemusí vidět stejný log.');
    }
  }
  channel.on('broadcast', { event: 'roll' }, ({ payload }) => merge([payload]))
    .on('broadcast', { event: 'roll-state' }, ({ payload }) => {
      if (Array.isArray(payload?.rolls)) merge(payload.rolls);
    })
    .on('broadcast', { event: 'roll-request' }, () => {
      if (connected) void send('roll-state', { rolls });
    })
    .subscribe(state => {
      connected = state === 'SUBSCRIBED';
      connection(connected);
      if (connected) {
        // Znovupřipojení sloučí oba krátké stavy, bez přepisování novějších hodů.
        if (rolls.length) void send('roll-state', { rolls });
        void send('roll-request', {});
      }
    });
  return {
    roll(sides) {
      if (!connected) return;
      const roll = { id: crypto.randomUUID(), character_id: character.id,
        name: (character.name?.trim() || 'Postava').slice(0, 200), sides, result: rollDie(sides), order: ++clock };
      merge([roll]); // Výsledek se objeví ihned, bez čekání na síť.
      void send('roll', roll);
      return roll;
    },
    close() { connected = false; return db.removeChannel(channel); },
  };
}
