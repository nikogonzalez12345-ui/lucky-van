// casino.js — pure gambling rules. The host calls these with its own rng, so clients can't cheat.
// Every result carries `ret` = total paid back to the player (stake included, 0 on a loss).

export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const card = rng => 1 + Math.floor(rng() * 13); // ponytail: infinite shoe, no card counting; real shoe if anyone cares

// ---------- blackjack: dealer stands on 17, blackjack pays 3:2, double on first two cards ----------
export function handValue(h) {
  let t = 0, aces = 0;
  for (const c of h) { t += Math.min(c, 10); if (c === 1) aces++; }
  return aces && t + 10 <= 21 ? t + 10 : t;
}
export function bjDeal(rng, bet) {
  const s = { bet, p: [card(rng), card(rng)], d: [card(rng), card(rng)], done: false, ret: 0, msg: '' };
  if (handValue(s.p) === 21 || handValue(s.d) === 21) settle(s);
  return s;
}
export function bjHit(rng, s) {
  s.p.push(card(rng));
  const v = handValue(s.p);
  return v > 21 ? bust(s) : v === 21 ? bjStand(rng, s) : s;
}
export function bjDouble(rng, s) {
  s.bet *= 2;
  s.p.push(card(rng));
  return handValue(s.p) > 21 ? bust(s) : bjStand(rng, s);
}
export function bjStand(rng, s) {
  while (handValue(s.d) < 17) s.d.push(card(rng));
  return settle(s);
}
function bust(s) { s.done = true; s.ret = 0; s.msg = 'BUST'; return s; }
function settle(s) {
  const p = handValue(s.p), d = handValue(s.d);
  const pbj = p === 21 && s.p.length === 2, dbj = d === 21 && s.d.length === 2;
  s.done = true;
  if (pbj && !dbj) { s.ret = s.bet * 2.5; s.msg = 'BLACKJACK!'; }
  else if (dbj && !pbj) { s.ret = 0; s.msg = 'DEALER BLACKJACK'; }
  else if (d > 21 || p > d) { s.ret = s.bet * 2; s.msg = d > 21 ? 'DEALER BUSTS' : 'YOU WIN'; }
  else if (p === d) { s.ret = s.bet; s.msg = 'PUSH'; }
  else { s.ret = 0; s.msg = 'DEALER WINS'; }
  return s;
}

// ---------- craps: pass line only ----------
export function crapsRoll(rng, s) {
  const a = 1 + Math.floor(rng() * 6), b = 1 + Math.floor(rng() * 6), t = a + b;
  s.dice = [a, b]; s.done = false; s.ret = 0;
  if (!s.point) {
    if (t === 7 || t === 11) { s.done = true; s.ret = s.bet * 2; s.msg = `NATURAL ${t}!`; }
    else if (t === 2 || t === 3 || t === 12) { s.done = true; s.msg = `CRAPS ${t}`; }
    else { s.point = t; s.msg = `POINT IS ${t}`; }
  } else if (t === s.point) { s.done = true; s.ret = s.bet * 2; s.msg = `HIT THE ${t}!`; }
  else if (t === 7) { s.done = true; s.msg = 'SEVEN OUT'; }
  else s.msg = `ROLLED ${t}, NEED ${s.point}`;
  return s;
}

// ---------- roulette: single-zero wheel ----------
export const ROUL_KINDS = ['red', 'black', 'odd', 'even', 'low', 'high', 'd1', 'd2', 'd3', 'n'];
export function rouletteMult(b, n) {
  if (b.k === 'n') return b.n === n ? 36 : 0;
  if (n === 0) return 0;
  const win = {
    red: RED.has(n), black: !RED.has(n), odd: n % 2 === 1, even: n % 2 === 0,
    low: n <= 18, high: n >= 19, d1: n <= 12, d2: n > 12 && n <= 24, d3: n > 24,
  }[b.k];
  return win ? (b.k[0] === 'd' ? 3 : 2) : 0;
}
export function rouletteSpin(rng, bets) {
  const n = Math.floor(rng() * 37);
  return { n, ret: bets.reduce((sum, b) => sum + b.amt * rouletteMult(b, n), 0) };
}
