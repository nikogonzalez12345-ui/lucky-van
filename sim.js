// sim.js — host-authoritative game rules. No three.js here, so node can run it (see test.mjs).
import { bjDeal, bjHit, bjStand, bjDouble, crapsRoll, rouletteSpin, ROUL_KINDS } from './casino.js';

export const rngFrom = seed => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const ROAD_W = 12, STEP = 4, MAX_PLAYERS = 4;

export const WEAPONS = {
  pistol:  { name: 'Pistol',  price: 0,     dmg: 24,  rate: 3,   spread: 0.03,  pellets: 1, pierce: 1, pack: 0,   packPrice: 0 },
  smg:     { name: 'SMG',     price: 700,   dmg: 15,  rate: 11,  spread: 0.07,  pellets: 1, pierce: 1, pack: 200, packPrice: 80 },
  shotgun: { name: 'Shotgun', price: 1200,  dmg: 14,  rate: 1.4, spread: 0.16,  pellets: 8, pierce: 1, pack: 30,  packPrice: 90 },
  rifle:   { name: 'Rifle',   price: 2500,  dmg: 110, rate: 1.8, spread: 0.008, pellets: 1, pierce: 4, pack: 40,  packPrice: 150 },
  minigun: { name: 'Minigun', price: 6000,  dmg: 20,  rate: 22,  spread: 0.09,  pellets: 1, pierce: 1, pack: 600, packPrice: 300 },
  rocket:  { name: 'Rocket Launcher', price: 10000, dmg: 260, rate: 0.9, spread: 0.01, pellets: 1, pierce: 1, splash: 5, pack: 10, packPrice: 400 },
};
export const UPGRADES = {
  engine: { name: 'Engine',   base: 300, desc: 'Top speed + acceleration' },
  tires:  { name: 'Tires',    base: 200, desc: 'Steering + off-road speed' },
  body:   { name: 'Body',     base: 250, desc: '+120 max hull' },
  armor:  { name: 'Armor',    base: 450, desc: '-10% damage taken' },
  plow:   { name: 'Ram Plow', base: 350, desc: 'Ram harder, at lower speed' },
};
export const MAX_LVL = 6;
export const upPrice = (k, lvl) => Math.round(UPGRADES[k].base * 2 ** lvl);
export const vanStats = up => ({
  top: 17 + 3.2 * up.engine, accel: 9 + 2.6 * up.engine,
  turn: 1.5 + 0.18 * up.tires, offroad: 0.45 + 0.08 * up.tires,
  maxHp: 220 + 120 * up.body, armor: Math.min(0.6, 0.1 * up.armor),
  ram: 1 + 0.6 * up.plow, ramMin: Math.max(2.5, 6 - 0.6 * up.plow),
});
export const ZTYPES = {
  walker: { hp: 40,  spd: 2.3, dps: 5,  r: 0.55, cash: 8 },
  runner: { hp: 30,  spd: 6.8, dps: 4,  r: 0.5,  cash: 12 },
  brute:  { hp: 320, spd: 1.9, dps: 16, r: 0.95, cash: 45, heavy: true },
};
// van-local [x, forward]; seat 0 is the driver, the rest stand on the roof
export const SEATS = [[0.55, 1.2], [-0.6, 0.3], [0.6, -0.8], [0, -1.9]];
export const toWorld = (v, lx, lf) => [
  v.x + Math.cos(v.h) * lx + Math.sin(v.h) * lf,
  v.z - Math.sin(v.h) * lx + Math.cos(v.h) * lf,
];

export function makeRoad(seed, trip) {
  const r = rngFrom(seed);
  const n = Math.floor((560 + 160 * Math.min(trip, 12)) / STEP);
  const pts = [];
  let x = 0, z = 0, h = 0, c = 0;
  for (let i = 0; i < n; i++) {
    pts.push({ x, z, h });
    if (i > 10) { c = Math.max(-0.06, Math.min(0.06, (c + (r() - 0.5) * 0.035) * 0.97)); h += c; }
    x += Math.sin(h) * STEP; z += Math.cos(h) * STEP;
  }
  const P = i => pts[Math.max(0, Math.min(n - 1, i))];
  const at = (p, off, jit) => [p.x + Math.cos(p.h) * off + (r() - 0.5) * jit, p.z - Math.sin(p.h) * off + (r() - 0.5) * jit];
  // abandoned cars: m 0 sedan, 1 suv, 2 bus. Some block the lanes, most are dumped on the shoulders
  const wrecks = [];
  for (let i = 25; i < n - 12; i += 7 + Math.floor(r() * 12)) {
    if (r() > 0.3 + 0.03 * trip) continue;
    const [x, z] = at(pts[i], (r() - 0.5) * ROAD_W * 0.75, 0);
    wrecks.push({ x, z, h: pts[i].h + (r() - 0.5) * 2.5, c: Math.floor(r() * 5), m: r() < 0.35 ? 1 : 0 });
  }
  for (let i = 12; i < n - 6; i += 3 + Math.floor(r() * 9)) {
    const side = r() < 0.5 ? -1 : 1, m = r() < 0.08 ? 2 : r() < 0.35 ? 1 : 0;
    const [x, z] = at(pts[i], side * (ROAD_W / 2 + (m === 2 ? 1.5 : 0) + r() * 3), 1);
    wrecks.push({ x, z, h: pts[i].h + (r() - 0.5) * 0.5 + (r() < 0.5 ? Math.PI : 0), c: Math.floor(r() * 5), m });
  }
  // ponytail: O(props × points) clearance scan, fine for <1k points; grid it if roads get huge
  const clear = (px, pz, m) => !pts.some(p => (p.x - px) ** 2 + (p.z - pz) ** 2 < m * m);
  const props = []; // k: 0 tree, 1 bush, 2 ruined building, 3 street lamp, 4 power pole
  const put = (k, [x, z], margin, extra) => { if (clear(x, z, ROAD_W / 2 + margin)) props.push({ x, z, k, s: 0.7 + r() * 0.9, h: r() * 6.283, ...extra }); };
  for (let i = -15; i < n + 15; i++) for (const side of [-1, 1]) {
    if (r() < 0.6) put(r() < 0.65 ? 0 : 1, at(P(i), side * (ROAD_W / 2 + 3 + r() * r() * 70), 8), 2);
  }
  for (let i = -10; i < n + 10; i += 5 + Math.floor(r() * 6)) {
    const side = r() < 0.5 ? -1 : 1, w = 10 + r() * 14, d = 8 + r() * 10, ht = 8 + r() * r() * 40, half = Math.hypot(w, d) / 2;
    put(2, at(P(i), side * (ROAD_W / 2 + 10 + half + r() * 80), 6), half + 3, { w, d, ht, h: P(i).h + (r() < 0.3 ? 0.3 : 0) });
  }
  for (let i = 4, side = 1; i < n; i += 9, side = -side) {
    const [x, z] = at(pts[i], side * (ROAD_W / 2 + 1.3), 0);
    props.push({ x, z, k: 3, s: 1, h: pts[i].h + (side > 0 ? 0 : Math.PI), tilt: r() < 0.25 ? (r() - 0.5) * 0.5 : 0 });
  }
  for (let i = 2; i < n; i += 8) {
    const [x, z] = at(pts[i], -(ROAD_W / 2 + 8), 0);
    props.push({ x, z, k: 4, s: 1, h: pts[i].h, tilt: (r() - 0.5) * 0.12 });
  }
  const obstacles = [];
  for (const w of wrecks) {
    if (w.m === 2) for (const s of [-1, 1]) obstacles.push({ x: w.x + Math.sin(w.h) * 3 * s, z: w.z + Math.cos(w.h) * 3 * s, r: 3.2 });
    else obstacles.push({ x: w.x, z: w.z, r: w.m ? 3.8 : 3.6 });
  }
  for (const p of props) obstacles.push({ x: p.x, z: p.z, r: [1.6 + 0.4 * p.s, 1.4 + 0.8 * p.s, 1.5 + Math.hypot(p.w || 0, p.d || 0) / 2, 1.5, 1.6][p.k] });
  return { pts, wrecks, props, obstacles, n };
}

export function nearestIdx(pts, x, z, hint) {
  let best = hint, bd = Infinity;
  const scan = (a, b) => { for (let i = a; i < b; i++) { const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2; if (d < bd) { bd = d; best = i; } } };
  scan(Math.max(0, hint - 20), Math.min(pts.length, hint + 40));
  if (bd > 1600) scan(0, pts.length); // lost the road entirely
  return [best, Math.sqrt(bd)];
}

const COLORS = ['#ff6b6b', '#ffd93d', '#4dabf7', '#b197fc'];
const int = (v, max) => { v = Math.floor(Number(v)); return Number.isFinite(v) && v > 0 ? Math.min(v, max) : 0; };
const clamp1 = v => (Number.isFinite(+v) ? Math.max(-1, Math.min(1, +v)) : 0);

export function createSim(rnd = Math.random) {
  const freshUp = () => ({ engine: 0, tires: 0, body: 0, armor: 0, plow: 0 });
  const S = { phase: 'lobby', trip: 1, roadTrip: 1, seed: 1, van: null, zs: [], players: {}, order: [], driver: null,
    up: freshUp(), fund: freshUp(), ev: [], stats: { kills: 0 } };
  let road = null, hordes = [], obstacles = [], nextId = 1, spawnT = 3;
  const say = msg => S.ev.push({ k: 'msg', msg });
  const P = () => S.order.map(id => S.players[id]);
  const seatOf = id => (id === S.driver ? 0 : 1 + S.order.filter(o => o !== S.driver).indexOf(id));
  const tripScale = () => 1 + 0.25 * (S.trip - 1);

  function addPlayer(id, name) {
    if (S.order.length >= MAX_PLAYERS || S.players[id]) return false;
    const color = COLORS.find(c => !P().some(p => p.color === c));
    S.players[id] = { id, name, color, money: 150, owned: ['pistol'], weapon: 'pistol', ammo: {}, ready: false, kills: 0,
      in: { thr: 0, steer: 0, brake: false, aim: [0, 10], fire: false }, cool: 0, bj: null, craps: null, roul: null };
    S.order.push(id);
    if (!S.driver) S.driver = id;
    say(`${name} hopped in the van`);
    return true;
  }
  function removePlayer(id) {
    const p = S.players[id];
    if (!p) return;
    delete S.players[id];
    S.order = S.order.filter(o => o !== id);
    if (S.driver === id) S.driver = S.order[0] || null;
    say(`${p.name} bailed`);
    checkReady();
  }

  function startTrip() {
    S.seed = (rnd() * 1e9) | 0; S.roadTrip = S.trip;
    road = makeRoad(S.seed, S.trip);
    obstacles = road.obstacles;
    const st = vanStats(S.up);
    S.van = { x: 0, z: 0, h: 0, spd: 0, hp: st.maxHp, maxHp: st.maxHp, i: 0, off: false };
    S.zs = []; hordes = []; spawnT = 3;
    for (let i = 22; i < road.n - 6; i += 7 + Math.floor(rnd() * 8)) hordes.push({ i, c: 2 + Math.floor(rnd() * (2 + S.trip * 1.3)) });
    for (const p of P()) Object.assign(p, { ready: false, cool: 0.3, bj: null, craps: null, roul: null });
    S.phase = 'drive';
    say(`Trip ${S.trip}: get to stop #${S.trip}!`);
  }
  function restart() {
    S.trip = 1; S.up = freshUp(); S.fund = freshUp(); S.stats = { kills: 0 };
    for (const p of P()) Object.assign(p, { money: 150, owned: ['pistol'], weapon: 'pistol', ammo: {}, kills: 0, bj: null, craps: null, roul: null });
    startTrip();
  }

  function spawnZ(x, z) {
    const r = rnd(), t = r < 0.03 + 0.02 * S.trip ? 'brute' : r < 0.15 + 0.04 * S.trip ? 'runner' : 'walker';
    const hp = ZTYPES[t].hp * (1 + 0.18 * (S.trip - 1));
    S.zs.push({ id: nextId++, t, x, z, h: rnd() * 6.28, y: 0, hp, dead: false, atk: false, ramCd: 0 });
  }
  function hurtVan(n) {
    const v = S.van;
    v.hp -= n * (1 - vanStats(S.up).armor);
    if (v.hp <= 0 && S.phase === 'drive') {
      v.hp = 0; S.phase = 'over';
      say(`The van got overrun on trip ${S.trip}...`);
    }
  }
  function damageZ(z, dmg, pid, dir, ram) {
    if (z.dead) return;
    z.hp -= dmg;
    if (z.hp > 0) { z.x += dir[0] * 0.2; z.z += dir[1] * 0.2; return; }
    const f = ram ? 14 : 5;
    Object.assign(z, { dead: true, dt: 0, vx: dir[0] * f, vz: dir[1] * f, vy: ram ? 9 : 4 });
    const cash = Math.round(ZTYPES[z.t].cash * tripScale()), p = S.players[pid];
    if (p) { p.money += cash; p.kills++; }
    S.stats.kills++;
    S.ev.push({ k: 'kill', x: z.x, z: z.z, p: pid, cash, ram: !!ram });
  }

  function shoot(p, v) {
    let wk = p.weapon;
    if (wk !== 'pistol' && !(p.ammo[wk] > 0)) wk = 'pistol';
    const W = WEAPONS[wk];
    p.cool = 1 / W.rate;
    if (wk !== 'pistol') p.ammo[wk]--;
    const [mx, mz] = toWorld(v, ...SEATS[seatOf(p.id)]);
    const ax = p.in.aim[0] - mx, az = p.in.aim[1] - mz, base = Math.atan2(ax, az), R = 70;
    for (let k = 0; k < W.pellets; k++) {
      const a = base + (rnd() - 0.5) * 2 * W.spread, dx = Math.sin(a), dz = Math.cos(a);
      const hits = [];
      for (const z of S.zs) {
        if (z.dead) continue;
        const rx = z.x - mx, rz = z.z - mz, t = rx * dx + rz * dz;
        if (t > 0 && t < R && Math.abs(rx * dz - rz * dx) < ZTYPES[z.t].r) hits.push([t, z]);
      }
      hits.sort((a, b) => a[0] - b[0]);
      let end = R;
      if (W.splash) {
        end = hits.length ? hits[0][0] : Math.min(R, Math.hypot(ax, az));
        const ex = mx + dx * end, ez = mz + dz * end;
        for (const z of S.zs) {
          const d = Math.hypot(z.x - ex, z.z - ez);
          if (d < W.splash) damageZ(z, W.dmg * (1 - d / W.splash / 2), p.id, [(z.x - ex) / (d || 1), (z.z - ez) / (d || 1)]);
        }
        S.ev.push({ k: 'boom', x: ex, z: ez });
      } else {
        const hs = hits.slice(0, W.pierce);
        for (const [, z] of hs) { damageZ(z, W.dmg, p.id, [dx, dz]); S.ev.push({ k: 'hit', x: z.x, z: z.z }); }
        if (hs.length) end = hs[hs.length - 1][0];
      }
      S.ev.push({ k: 'tr', a: [mx, mz], b: [mx + dx * end, mz + dz * end], w: wk, p: p.id });
    }
  }

  function step(dt) {
    if (S.phase !== 'drive') return;
    const v = S.van, st = vanStats(S.up), inp = S.players[S.driver]?.in || { thr: 0, steer: 0 };
    // --- van ---
    const [ni, nd] = nearestIdx(road.pts, v.x, v.z, v.i);
    v.i = ni; v.off = nd > ROAD_W / 2 + 1;
    const top = st.top * (v.off ? st.offroad : 1);
    if (inp.thr > 0) v.spd += st.accel * dt * (v.spd < 0 ? 3 : 1);
    else if (inp.thr < 0) v.spd -= (v.spd > 0 ? 22 : st.accel * 0.7) * dt;
    else v.spd -= v.spd * 0.6 * dt;
    if (inp.brake) v.spd -= Math.sign(v.spd) * Math.min(Math.abs(v.spd), 30 * dt);
    v.spd = Math.max(-7, v.spd);
    if (v.spd > top) v.spd -= (v.spd - top) * 3 * dt;
    v.h -= inp.steer * st.turn * Math.max(-1, Math.min(1, v.spd / 6)) * dt;
    v.x += Math.sin(v.h) * v.spd * dt; v.z += Math.cos(v.h) * v.spd * dt;
    for (const o of obstacles) { // wrecks, trees, rocks, houses
      const dx = v.x - o.x, dz = v.z - o.z, d = Math.hypot(dx, dz);
      if (d >= o.r || d === 0) continue;
      v.x += (dx / d) * (o.r - d); v.z += (dz / d) * (o.r - d);
      if (Math.abs(v.spd) > 4) { hurtVan(Math.abs(v.spd) * 1.2); S.ev.push({ k: 'crash', x: v.x, z: v.z }); }
      v.spd *= -0.25;
    }
    // --- spawning ---
    for (const hd of hordes) {
      if (hd.done || hd.i > v.i + 32) continue;
      hd.done = true;
      const p = road.pts[hd.i];
      for (let k = 0; k < hd.c; k++) {
        const lat = (rnd() - 0.5) * 2 * (ROAD_W / 2 + 14), along = (rnd() - 0.5) * 10;
        spawnZ(p.x + Math.cos(p.h) * lat + Math.sin(p.h) * along, p.z - Math.sin(p.h) * lat + Math.cos(p.h) * along);
      }
    }
    if ((spawnT -= dt) <= 0 && S.zs.length < 90) {
      spawnT = Math.max(1.5, 6 - 0.4 * S.trip);
      for (let k = 1 + Math.floor(rnd() * (1 + S.trip / 2)); k > 0; k--) {
        const side = rnd() < 0.5 ? -1 : 1;
        spawnZ(...toWorld(v, side * (ROAD_W / 2 + 15 + rnd() * 15), 30 + rnd() * 30));
      }
    }
    // --- zombies ---
    const c = Math.cos(v.h), s = Math.sin(v.h), dps = 1 + 0.1 * (S.trip - 1);
    for (const z of S.zs) {
      if (z.dead) {
        z.dt += dt; z.x += z.vx * dt; z.z += z.vz * dt;
        z.y = Math.max(0, z.y + z.vy * dt); z.vy -= 30 * dt;
        if (!z.y) { z.vx *= 0.9; z.vz *= 0.9; }
        continue;
      }
      const T = ZTYPES[z.t], dx = v.x - z.x, dz = v.z - z.z, d = Math.hypot(dx, dz) || 1;
      const rx = -dx, rz = -dz, lx = rx * c - rz * s, lf = rx * s + rz * c, ex = 1.25 + T.r, ef = 2.75 + T.r;
      z.ramCd -= dt; z.atk = false;
      if (Math.abs(lx) < ex && Math.abs(lf) < ef) {
        if (Math.abs(v.spd) > st.ramMin && z.ramCd <= 0) {
          z.ramCd = 0.4;
          damageZ(z, Math.abs(v.spd) * 6 * st.ram, S.driver, [s * Math.sign(v.spd), c * Math.sign(v.spd)], true);
          v.spd *= T.heavy ? 0.55 : 0.97;
          if (T.heavy) S.ev.push({ k: 'crash', x: z.x, z: z.z });
        }
        if (!z.dead) { // shove out along the shallowest side
          const nl = ex - Math.abs(lx) < ef - Math.abs(lf) ? [Math.sign(lx) * ex, lf] : [lx, Math.sign(lf) * ef];
          [z.x, z.z] = toWorld(v, ...nl);
        }
      }
      if (z.dead) continue;
      if (Math.max(Math.abs(lx) - ex, Math.abs(lf) - ef) < 0.6) { z.atk = true; hurtVan(T.dps * dps * dt); }
      else if (d < 55) { const sp = T.spd * (1 + 0.03 * S.trip); z.x += (dx / d) * sp * dt; z.z += (dz / d) * sp * dt; }
      z.h = Math.atan2(dx, dz);
    }
    S.zs = S.zs.filter(z => (z.dead ? z.dt < 2.5 : Math.hypot(z.x - v.x, z.z - v.z) < 120));
    // --- guns ---
    for (const p of P()) {
      p.cool -= dt;
      if (p.in.fire && p.cool <= 0) shoot(p, v);
    }
    // --- arrival ---
    if (S.phase === 'drive' && v.i >= road.n - 3) {
      const bonus = 80 + 60 * S.trip;
      for (const p of P()) p.money += bonus;
      say(`Made it to stop #${S.trip}! Everyone gets $${bonus}`);
      S.trip++; S.phase = 'shop';
      for (const p of P()) { p.ready = false; p.in.fire = false; }
    }
  }

  function checkReady() {
    if (S.phase === 'shop' && S.order.length && P().every(p => p.ready)) startTrip();
  }
  function payout(p, game, s) {
    if (!s.done || s.paid) return;
    s.paid = true;
    p.money += s.ret;
    const net = s.ret - s.bet;
    if (Math.abs(net) >= 100) say(`${p.name} ${net > 0 ? 'won' : 'lost'} $${Math.abs(net)} at ${game}`);
  }

  // every message from a player comes through here; treat it all as untrusted
  function act(pid, m) {
    const p = S.players[pid];
    if (!p || !m || typeof m !== 'object') return;
    if (m.t === 'in') {
      const aim = Array.isArray(m.aim) && m.aim.every(Number.isFinite) ? [m.aim[0], m.aim[1]] : p.in.aim;
      p.in = { thr: clamp1(m.thr), steer: clamp1(m.steer), brake: !!m.brake, aim, fire: !!m.fire && S.phase === 'drive' };
      return;
    }
    if (m.t === 'equip') { if (p.owned.includes(m.w)) p.weapon = m.w; return; }
    if (m.t === 'at') { p.at = ['bj', 'craps', 'roul'].includes(m.at) ? m.at : null; return; }
    if (S.phase !== 'shop') return;
    const bet = int(m.bet, p.money);
    switch (m.t) {
      case 'fund': {
        if (!UPGRADES[m.k] || S.up[m.k] >= MAX_LVL) return;
        const price = upPrice(m.k, S.up[m.k]), amt = Math.min(int(m.amt, p.money), price - S.fund[m.k]);
        if (amt <= 0) return;
        p.money -= amt; S.fund[m.k] += amt;
        if (S.fund[m.k] >= price) { S.up[m.k]++; S.fund[m.k] = 0; say(`${UPGRADES[m.k].name} upgraded to level ${S.up[m.k]}!`); }
        return;
      }
      case 'buy': {
        const W = WEAPONS[m.w];
        if (!W || p.owned.includes(m.w) || p.money < W.price) return;
        p.money -= W.price; p.owned.push(m.w); p.weapon = m.w; p.ammo[m.w] = W.pack;
        say(`${p.name} bought a ${W.name}!`);
        return;
      }
      case 'ammo': {
        const W = WEAPONS[m.w];
        if (!W || !W.pack || !p.owned.includes(m.w) || p.money < W.packPrice) return;
        p.money -= W.packPrice; p.ammo[m.w] = (p.ammo[m.w] || 0) + W.pack;
        return;
      }
      case 'gift': {
        const to = S.players[m.to], amt = int(m.amt, p.money);
        if (!to || to === p || !amt) return;
        p.money -= amt; to.money += amt;
        say(`${p.name} gave ${to.name} $${amt}`);
        return;
      }
      case 'drive': if (S.driver !== pid) { S.driver = pid; say(`${p.name} takes the wheel`); } return;
      case 'ready': p.ready = !p.ready; checkReady(); return;
      case 'bj':
        if (m.a === 'deal') {
          if ((p.bj && !p.bj.done) || !bet) return;
          p.money -= bet; p.bj = bjDeal(rnd, bet); p.bj.id = nextId++;
        } else if (p.bj && !p.bj.done) {
          if (m.a === 'hit') bjHit(rnd, p.bj);
          else if (m.a === 'stand') bjStand(rnd, p.bj);
          else if (m.a === 'double' && p.bj.p.length === 2 && p.money >= p.bj.bet) { p.money -= p.bj.bet; bjDouble(rnd, p.bj); }
        }
        if (p.bj) payout(p, 'blackjack', p.bj);
        return;
      case 'craps':
        if (m.a === 'bet') {
          if ((p.craps && !p.craps.done) || !bet) return;
          p.money -= bet; p.craps = { bet, point: 0 };
        } else if (!p.craps || p.craps.done) return;
        crapsRoll(rnd, p.craps);
        p.craps.rid = nextId++;
        payout(p, 'craps', p.craps);
        return;
      case 'roul': {
        if (!Array.isArray(m.bets) || !m.bets.length || m.bets.length > 40) return;
        const bets = m.bets.map(b => ({ k: b?.k, n: b?.n, amt: int(b?.amt, 1e9) }));
        const total = bets.reduce((s, b) => s + b.amt, 0);
        if (bets.some(b => !ROUL_KINDS.includes(b.k) || !b.amt || (b.k === 'n' && !(Number.isInteger(b.n) && b.n >= 0 && b.n <= 36)))) return;
        if (total > p.money) return;
        p.money -= total;
        p.roul = { ...rouletteSpin(rnd, bets), bet: total, id: nextId++, done: true };
        payout(p, 'roulette', p.roul);
        return;
      }
    }
  }

  function snapshot() {
    const ev = S.ev; S.ev = [];
    const r2 = n => Math.round(n * 100) / 100;
    const v = S.van;
    return {
      t: 's', ph: S.phase, trip: S.trip, rt: S.roadTrip, seed: S.seed, drv: S.driver, up: S.up, fund: S.fund, stats: S.stats, ev,
      van: v && { x: r2(v.x), z: r2(v.z), h: r2(v.h), spd: r2(v.spd), hp: Math.ceil(v.hp), maxHp: v.maxHp, i: v.i, off: v.off, n: road.n },
      zs: S.zs.map(z => [z.id, z.t, r2(z.x), r2(z.z), r2(z.h), r2(z.y), z.dead ? 1 : z.atk ? 2 : 0]),
      ps: P().map(p => ({ id: p.id, name: p.name, color: p.color, money: p.money, owned: p.owned, weapon: p.weapon, ammo: p.ammo,
        ready: p.ready, kills: p.kills, at: p.at, bj: p.bj, craps: p.craps, roul: p.roul, seat: seatOf(p.id), aim: p.in.aim })),
    };
  }

  return { S, addPlayer, removePlayer, startTrip, restart, step, act, snapshot, get road() { return road; } };
}
