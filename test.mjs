// node test.mjs — casino payouts, pooled upgrades, and a full autopiloted trip
import assert from 'node:assert/strict';
import { handValue, bjDeal, bjStand, rouletteMult, crapsRoll } from './casino.js';
import { createSim } from './sim.js';

const seq = (...v) => () => v.shift();
const C = k => (k - 1) / 13 + 1e-3, D = d => (d - 1) / 6 + 1e-3; // rng values that draw card rank k / die face d

assert.equal(handValue([1, 13]), 21);
assert.equal(handValue([1, 1, 9]), 21);
assert.equal(handValue([10, 10, 5]), 25);
assert.equal(bjDeal(seq(C(1), C(13), C(9), C(9)), 10).ret, 25); // blackjack pays 3:2
let s = bjStand(seq(C(10)), bjDeal(seq(C(10), C(8), C(10), C(6)), 10));
assert.deepEqual([s.ret, s.msg], [20, 'DEALER BUSTS']);

assert.equal(rouletteMult({ k: 'red' }, 1), 2);
assert.equal(rouletteMult({ k: 'red' }, 0), 0);
assert.equal(rouletteMult({ k: 'n', n: 17 }, 17), 36);
assert.equal(rouletteMult({ k: 'd3' }, 25), 3);

assert.equal(crapsRoll(seq(D(3), D(4)), { bet: 10, point: 0 }).ret, 20);
const cr = crapsRoll(seq(D(2), D(2)), { bet: 10, point: 0 });
assert.equal(cr.point, 4);
assert.deepEqual([crapsRoll(seq(D(3), D(4)), cr).done, cr.ret], [true, 0]);

// pooling: two players chip into one engine upgrade, overflow is never taken
const sim = createSim();
sim.addPlayer('a', 'A'); sim.addPlayer('b', 'B');
const { S } = sim;
S.phase = 'shop'; S.players.a.money = 200; S.players.b.money = 200;
sim.act('a', { t: 'fund', k: 'engine', amt: 200 });
assert.equal(S.up.engine, 0);
sim.act('b', { t: 'fund', k: 'engine', amt: 500 });
assert.deepEqual([S.up.engine, S.players.b.money], [1, 100]);
sim.act('b', { t: 'bj', a: 'deal', bet: 1e9 }); // bet is clamped to the wallet
assert.ok(S.players.b.money >= 0);

// autopilot: the driver steers at the road ahead, the gunner shoots the nearest zombie
S.phase = 'lobby'; sim.startTrip(); S.van.hp = 1e6;
for (let t = 0; t < 300 * 60 && S.phase === 'drive'; t++) {
  const v = S.van, tgt = sim.road.pts[Math.min(sim.road.n - 1, v.i + 5)];
  const diff = Math.atan2(Math.sin(Math.atan2(tgt.x - v.x, tgt.z - v.z) - v.h), Math.cos(Math.atan2(tgt.x - v.x, tgt.z - v.z) - v.h));
  const z = S.zs.find(z => !z.dead) || { x: 0, z: 0 };
  sim.act('a', { t: 'in', thr: 1, steer: Math.max(-1, Math.min(1, -diff * 3)), aim: [z.x, z.z], fire: true });
  sim.act('b', { t: 'in', aim: [z.x, z.z], fire: true });
  sim.step(1 / 60);
}
assert.equal(S.phase, 'shop');
assert.ok(S.stats.kills > 0, 'nobody killed anything');
console.log(`ok — trip done, ${S.stats.kills} kills, wallets ${S.players.a.money}/${S.players.b.money}`);
