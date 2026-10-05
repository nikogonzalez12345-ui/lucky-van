// casino3d.js — the casino in the back of the van: blackjack, craps and roulette tables you play in 3D
import * as THREE from 'three';
import { lcg, canvasTex, geo, box, rbox, cyl, sphere, mat, mesh, makeGuy, playerShirt, label } from './art.js';
import { RED } from './casino.js';

const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const POCKET = (Math.PI * 2) / 37;
// a flat plane on a table: w runs left→right on screen (+z), h runs away from the player (+x); texture top = far side
const flat = (w, h) => new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2);
export const TABLES = { bj: { z: 4.2, name: 'BLACKJACK' }, craps: { z: 0, name: 'CRAPS' }, roul: { z: -4.2, name: 'ROULETTE' } };
const TOP = 0.86; // felt height

const feltMat = (draw, w, h) => new THREE.MeshStandardMaterial({ map: canvasTex(w, h, draw), roughness: 0.95, transparent: true, alphaTest: 0.5 });
const gold = '#f2d27a';
const text = (g, t, x, y, size, color = gold, rot = 0) => {
  g.save(); g.translate(x, y); g.rotate(rot); g.font = `700 ${size}px Fredoka, Arial, sans-serif`;
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 0, 0); g.restore();
};
const feltFill = (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.6); gr.addColorStop(0, '#2c8c5a'); gr.addColorStop(1, '#1b6340'); return gr; };

// ---------- cards & dice ----------
const SUITS = ['♠', '♥', '♦', '♣'], RANK = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const cardTexCache = {};
const cardMat = key => (cardTexCache[key] ||= new THREE.MeshStandardMaterial({ roughness: 0.5, map: canvasTex(128, 180, (g, w, h) => {
  g.fillStyle = '#fbf8f1'; g.beginPath(); g.roundRect(2, 2, w - 4, h - 4, 12); g.fill();
  if (key === 'back') { g.fillStyle = '#b3262d'; g.beginPath(); g.roundRect(10, 10, w - 20, h - 20, 8); g.fill(); g.strokeStyle = '#f2d27a'; g.lineWidth = 3; for (let i = -h; i < w; i += 14) { g.beginPath(); g.moveTo(i, 10); g.lineTo(i + h, h); g.stroke(); } return; }
  const [rank, suit] = key.split('|'), color = suit === '♥' || suit === '♦' ? '#d42a2a' : '#1d1d1f';
  text(g, rank, 26, 28, 34, color); text(g, suit, 26, 58, 26, color);
  text(g, suit, w / 2, h / 2 + 10, 74, color);
}) }));
const cardGeo = flat(0.22, 0.32);
const pipTex = n => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = '#f7f3ea'; g.fillRect(0, 0, w, h); g.fillStyle = n === 1 ? '#c92a2a' : '#1d1d1f';
  const P = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] }[n];
  for (const [x, y] of P) { g.beginPath(); g.arc(14 + x * 18, 14 + y * 18, n === 1 ? 9 : 6, 0, 7); g.fill(); }
});
// box faces are +x −x +y −y +z −z; these Euler angles ('YXZ') bring face value v to the top
const DIE_FACES = [3, 4, 1, 6, 2, 5];
const DIE_UP = { 1: [0, 0], 6: [Math.PI, 0], 2: [-Math.PI / 2, 0], 5: [Math.PI / 2, 0], 3: [0, Math.PI / 2], 4: [0, -Math.PI / 2] };
const dieMats = DIE_FACES.map(n => new THREE.MeshStandardMaterial({ map: pipTex(n), roughness: 0.35 }));

function chipStack(amt) {
  const g = new THREE.Group(), n = Math.min(10, 1 + Math.floor(Math.log2(Math.max(1, amt / 5))));
  const color = amt >= 1000 ? '#7048e8' : amt >= 250 ? '#1d1d1f' : amt >= 100 ? '#2f9e44' : amt >= 25 ? '#e03131' : '#f1f3f5';
  for (let i = 0; i < n; i++) { const c = mesh(cyl(0.05, 0.05, 0.016, 18), mat(color, { roughness: 0.4 }), false); c.position.y = 0.008 + i * 0.017; c.rotation.y = i; g.add(c); }
  const stripe = mesh(cyl(0.051, 0.051, 0.006, 18), mat('#ffffff'), false); stripe.position.y = n * 0.017 - 0.008; g.add(stripe);
  return g;
}

// ---------- roulette layout: 13 columns × 5 rows (3 number rows, dozens, even-money bets) ----------
const LW = 1040, LH = 440, CW = 80, RH = 88, LAY = { w: 2.1, h: 0.888, x: -0.15, z: -0.78 };
const OUTSIDE = ['low', 'even', 'red', 'black', 'odd', 'high'];
function layoutCell(px, py) {
  const c = Math.floor(px / CW), r = Math.floor(py / RH);
  if (r < 3) return c === 0 ? 'n0' : c <= 12 ? `n${3 * c - r}` : null;
  if (c < 1 || c > 12) return null;
  return r === 3 ? `d${Math.ceil(c / 4)}` : OUTSIDE[Math.floor((c - 1) / 2)];
}
function cellCenter(key) {
  if (key === 'n0') return [CW / 2, RH * 1.5];
  if (key[0] === 'n') { const n = +key.slice(1), c = Math.ceil(n / 3); return [c * CW + CW / 2, (3 * c - n) * RH + RH / 2]; }
  if (key[0] === 'd') return [((+key[1] - 1) * 4 + 1) * CW + CW * 2, RH * 3.5];
  return [(1 + 2 * OUTSIDE.indexOf(key)) * CW + CW, RH * 4.5];
}
const layoutMat = feltMat((g, w, h) => {
  g.fillStyle = feltFill(g, w, h); g.fillRect(0, 0, w, h);
  g.strokeStyle = '#e9e2c8'; g.lineWidth = 3;
  const cell = (x, y, cw, ch, label, fill) => { if (fill) { g.fillStyle = fill; g.fillRect(x + 6, y + 6, cw - 12, ch - 12); } g.strokeRect(x, y, cw, ch); if (label) text(g, label, x + cw / 2, y + ch / 2, label.length > 3 ? 26 : 32, '#f8f4e8'); };
  cell(0, 0, CW, RH * 3, '0', '#2b8a3e');
  for (let c = 1; c <= 12; c++) for (let r = 0; r < 3; r++) { const n = 3 * c - r; cell(c * CW, r * RH, CW, RH, String(n), RED.has(n) ? '#c92a2a' : '#1d1d1f'); }
  ['1st 12', '2nd 12', '3rd 12'].forEach((t, i) => cell((1 + i * 4) * CW, RH * 3, CW * 4, RH, t));
  ['1-18', 'EVEN', '', '', 'ODD', '19-36'].forEach((t, i) => cell((1 + i * 2) * CW, RH * 4, CW * 2, RH, t));
  for (const [i, c] of [[2, '#c92a2a'], [3, '#1d1d1f']]) { const x = (1 + i * 2) * CW + CW, y = RH * 4.5; g.fillStyle = c; g.beginPath(); g.moveTo(x - 40, y); g.lineTo(x, y - 26); g.lineTo(x + 40, y); g.lineTo(x, y + 26); g.fill(); }
}, LW, LH);
const wheelMat = new THREE.MeshStandardMaterial({ roughness: 0.4, map: canvasTex(1024, 1024, (g, w) => {
  const R = w / 2, c = R;
  g.fillStyle = '#5a3a22'; g.beginPath(); g.arc(c, c, R, 0, 7); g.fill();
  WHEEL.forEach((n, i) => { // pocket i spans wheel-angle [i, i+1]·POCKET; canvas angle = π/2 − wheel angle
    const a0 = Math.PI / 2 - (i + 1) * POCKET, a1 = Math.PI / 2 - i * POCKET;
    g.fillStyle = n === 0 ? '#2b8a3e' : RED.has(n) ? '#c92a2a' : '#1d1d1f';
    g.beginPath(); g.moveTo(c, c); g.arc(c, c, R * 0.98, a0, a1); g.closePath(); g.fill();
    g.strokeStyle = '#e8c56a'; g.lineWidth = 3; g.stroke();
    const am = (a0 + a1) / 2; text(g, String(n), c + Math.cos(am) * R * 0.87, c + Math.sin(am) * R * 0.87, 44, '#fff', am + Math.PI / 2);
  });
  g.fillStyle = '#6b4428'; g.beginPath(); g.arc(c, c, R * 0.58, 0, 7); g.fill();
  g.strokeStyle = '#e8c56a'; g.lineWidth = 8; g.beginPath(); g.arc(c, c, R * 0.76, 0, 7); g.stroke();
}) });

// ---------- the room ----------
export function createCasino(renderer) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 60);
  scene.background = new THREE.Color('#1a120d');
  scene.add(new THREE.HemisphereLight('#ffd9a8', '#3a2418', 1.1));
  const add = (m, x, y, z, parent = scene) => { m.position.set(x, y, z); parent.add(m); return m; };

  const carpet = canvasTex(256, 256, (g, w, h) => {
    const r = lcg(77); g.fillStyle = '#8a4b1f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { g.fillStyle = ['#9c5a26', '#7a3f18', '#a8652c', '#6e3714'][i % 4]; g.fillRect(r() * w, r() * h, 2, 2); }
    g.strokeStyle = 'rgba(240,180,80,.35)'; g.lineWidth = 6;
    for (let y = 0; y < h; y += 64) { g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + 32 + Math.sin(x / w * Math.PI * 4) * 14); g.stroke(); }
  }, true);
  carpet.repeat.set(3, 7);
  add(mesh(new THREE.PlaneGeometry(6.6, 15.6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: carpet, roughness: 1 }), false), 0, 0, 0);
  const panel = canvasTex(256, 256, (g, w, h) => {
    const r = lcg(78);
    for (let x = 0; x < w; x += 32) { g.fillStyle = ['#6b4126', '#5e3920', '#734a2b'][(x / 32) % 3]; g.fillRect(x, 0, 32, h); g.fillStyle = '#3d2414'; g.fillRect(x, 0, 2, h); }
    for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(30,15,5,.25)'; g.fillRect(r() * w, r() * h, 1, 6 + r() * 30); }
  }, true);
  panel.repeat.set(5, 1);
  const wallMat = new THREE.MeshStandardMaterial({ map: panel, roughness: 0.8 });
  add(mesh(box(0.2, 3.4, 15.6), wallMat, false), 3.3, 1.7, 0);
  add(mesh(box(0.2, 3.4, 15.6), wallMat, false), -3.3, 1.7, 0);
  for (const z of [7.8, -7.8]) add(mesh(box(6.6, 3.4, 0.2), wallMat, false), 0, 1.7, z);
  add(mesh(new THREE.CylinderGeometry(3.3, 3.3, 15.6, 24, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.25, 1), mat('#e9dcc0', { side: THREE.BackSide, roughness: 0.9 }), false), 0, 3.4, 0);
  const outside = canvasTex(256, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#b9c6c8'); gr.addColorStop(0.6, '#c7cdbf'); gr.addColorStop(1, '#5d6e3a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  for (const z of [6, 2.1, -2.1, -6]) {
    add(mesh(rbox(0.12, 1.0, 1.9, 0.05), mat('#d8c7a0')), 3.2, 2.0, z);
    add(new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.85).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: outside })), 3.13, 2.0, z);
  }
  const neon = add(new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.8).rotateY(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, map: canvasTex(512, 150, (g, w, h) => {
    g.shadowColor = '#ff4fa3'; g.shadowBlur = 24; text(g, 'LUCKY VAN', w / 2, h / 2, 96, '#ffd1ea'); text(g, 'LUCKY VAN', w / 2, h / 2, 96, '#ff7ac0');
  }) })), 3.18, 2.95, 0);
  add(new THREE.PointLight('#ff6fb5', 3, 6, 2), 2.6, 2.9, 0);
  // string lights along the ceiling
  const bulbs = new THREE.Group(); scene.add(bulbs);
  for (const x of [-1.6, 1.6]) for (let z = -7.4; z <= 7.4; z += 0.6) add(mesh(sphere(0.045), new THREE.MeshBasicMaterial({ color: ['#ffd27a', '#ff9f6b', '#fff1c4'][Math.round(z * 10) % 3 & 3] || '#ffd27a' }), false), x, 3.05 - Math.abs(Math.sin(z * 1.1)) * 0.12, z, bulbs);

  // ---------- tables ----------
  const wood = mat('#5a3a22', { roughness: 0.6 }), leather = mat('#3a2416', { roughness: 0.5 }), felt = mat('#1f6b45', { roughness: 0.95 });
  const T = {}, pickables = [];
  for (const [key, def] of Object.entries(TABLES)) {
    const g = new THREE.Group(); g.position.set(0.2, 0, def.z); scene.add(g);
    const lampShade = add(mesh(cyl(0.25, 0.6, 0.35, 24, 1, true), mat('#2f6b45', { side: THREE.DoubleSide })), 0, 2.55, 0, g);
    lampShade.add(new THREE.Mesh(sphere(0.12), new THREE.MeshBasicMaterial({ color: '#fff3c4' })));
    add(mesh(cyl(0.01, 0.01, 0.9, 4), mat('#222')), 0, 3.1, 0, g);
    add(new THREE.PointLight('#ffd9a0', 9, 7, 1.6), 0, 2.3, 0, g);
    const dealer = makeGuy({ zombie: true, seed: def.z * 10 + 50, skin: '#9cbf7a', shirt: mat('#7a1f2b'), pants: '#1d1d1f', hair: '#3b2a1a', shoes: '#111' });
    dealer.g.position.set(1.35, 0, 0); dealer.g.rotation.y = -Math.PI / 2; dealer.g.scale.setScalar(0.92);
    dealer.armL.rotation.x = dealer.armR.rotation.x = -1.0;
    const visor = mesh(cyl(0.5, 0.5, 0.03, 20, 1, false, -Math.PI / 2, Math.PI), mat('#2f9e44', { transparent: true, opacity: 0.7 }), false);
    visor.position.set(0, 0.3, 0.15); dealer.head.add(visor);
    g.add(dealer.g);
    T[key] = { g, dealer };
  }
  // blackjack: half-moon table
  {
    const g = T.bj.g;
    const body = add(mesh(new THREE.CylinderGeometry(1.4, 1.25, TOP, 36, 1, false, Math.PI, Math.PI), wood), 0, TOP / 2, 0, g);
    add(mesh(box(0.5, TOP, 2.8), wood), 0.25, TOP / 2, 0, g);
    add(mesh(flat(2.8, 1.4), feltMat((c, w, h) => {
      c.fillStyle = feltFill(c, w, h); c.beginPath(); c.arc(w / 2, 0, h, 0, Math.PI); c.fill();
      for (const [t, rad, size] of [['BLACKJACK PAYS 3 TO 2', 300, 40], ['DEALER MUST STAND ON 17', 230, 28]]) {
        [...t].forEach((ch, i) => { const a = Math.PI / 2 + ((t.length - 1) / 2 - i) * (size * 0.62 / rad); text(c, ch, w / 2 + Math.cos(a) * rad, Math.sin(a) * rad, size, gold, a - Math.PI / 2); });
      }
      c.strokeStyle = gold; c.lineWidth = 4; c.beginPath(); c.arc(w / 2, 430, 46, 0, 7); c.stroke();
    }, 1024, 512)), -0.7, TOP + 0.001, 0, g);
    add(mesh(flat(2.8, 0.5), felt, false), 0.25, TOP + 0.001, 0, g);
    add(mesh(new THREE.TorusGeometry(1.4, 0.07, 10, 40, Math.PI).rotateX(-Math.PI / 2).rotateY(Math.PI / 2), leather), 0, TOP, 0, g);
    add(mesh(rbox(0.35, 0.22, 0.25, 0.04), mat('#3b5bdb')), 0.35, TOP + 0.11, -1.1, g);
    pickables.push([body, 'bj']);
  }
  // craps: a long tub
  const NUM_BOX = { 4: 0, 5: 1, 6: 2, 8: 3, 9: 4, 10: 5 };
  const crapsLocal = (px, py) => new THREE.Vector3((0.5 - py / 576) * 1.75, TOP + 0.002, (px / 1024 - 0.5) * 3.1);
  {
    const g = T.craps.g;
    const body = add(mesh(rbox(2.0, TOP, 3.4, 0.1), wood), 0, TOP / 2, 0, g);
    add(mesh(flat(3.1, 1.75), feltMat((c, w, h) => {
      c.fillStyle = feltFill(c, w, h); c.fillRect(0, 0, w, h);
      c.strokeStyle = '#e9e2c8'; c.lineWidth = 4;
      ['4', '5', 'SIX', '8', 'NINE', '10'].forEach((t, i) => { c.strokeRect(130 + i * 127, 120, 127, 120); text(c, t, 193 + i * 127, 180, 46, '#f8f4e8'); });
      c.strokeRect(60, 300, w - 120, 70); text(c, "DON'T PASS BAR", w / 2, 335, 34, '#f8f4e8');
      c.strokeRect(30, 400, w - 60, 140); text(c, 'PASS LINE', w / 2, 470, 64, gold);
      text(c, 'COME', w / 2, 60, 40, '#f8f4e8');
    }, 1024, 576)), 0, TOP + 0.001, 0, g);
    for (const s of [1, -1]) { add(mesh(box(0.14, 0.28, 3.4), leather), s * 1.0, TOP + 0.1, 0, g); add(mesh(box(2.0, 0.28, 0.14), leather), 0, TOP + 0.1, s * 1.7, g); }
    pickables.push([body, 'craps']);
  }
  const dice = [0, 1].map(() => { const d = mesh(box(0.13, 0.13, 0.13), dieMats); d.rotation.order = 'YXZ'; d.position.set(0.4, TOP + 0.065, 0); T.craps.g.add(d); return d; });
  dice[1].position.z = 0.25;
  const puck = mesh(cyl(0.08, 0.08, 0.035, 24), [mat('#1d1d1f'), new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); text(g, 'ON', 32, 34, 26, '#1d1d1f'); }) }),
    new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (g) => { g.fillStyle = '#1d1d1f'; g.fillRect(0, 0, 64, 64); text(g, 'OFF', 32, 34, 22, '#fff'); }) })]);
  T.craps.g.add(puck);
  // roulette: layout + wheel
  let layout;
  const wheel = new THREE.Group(), ball = mesh(sphere(0.028), mat('#ffffff', { roughness: 0.2 }));
  {
    const g = T.roul.g;
    const body = add(mesh(rbox(1.8, TOP, 3.6, 0.1), wood), 0, TOP / 2, 0, g);
    layout = add(mesh(flat(LAY.w, LAY.h), layoutMat, false), LAY.x, TOP + 0.001, LAY.z, g);
    add(mesh(cyl(0.68, 0.6, 0.2, 40), wood), 0, TOP + 0.1, 1.1, g);
    add(mesh(cyl(0.58, 0.58, 0.02, 40), mat('#2a1a10')), 0, TOP + 0.2, 1.1, g);
    wheel.position.set(0, TOP + 0.215, 1.1); g.add(wheel);
    wheel.add(new THREE.Mesh(new THREE.CircleGeometry(0.5, 74).rotateX(-Math.PI / 2), wheelMat));
    add(mesh(cyl(0.1, 0.2, 0.08, 24), mat('#c9a14a', { metalness: 0.6, roughness: 0.3 })), 0, 0.04, 0, wheel);
    add(mesh(cyl(0.02, 0.02, 0.18, 8), mat('#c9a14a', { metalness: 0.6, roughness: 0.3 })), 0, 0.12, 0, wheel);
    wheel.add(ball);
    pickables.push([body, 'roul'], [layout, 'roul']);
  }
  const chips = new THREE.Group(); T.roul.g.add(chips);
  const betChips = { bj: new THREE.Group(), craps: new THREE.Group() };
  T.bj.g.add(betChips.bj); betChips.bj.position.set(-1.0, TOP, 0);
  T.craps.g.add(betChips.craps); betChips.craps.position.copy(crapsLocal(800, 470));

  // ---------- friends standing at the tables ----------
  const friends = new Map();
  function placeFriends(players, myId) {
    const slots = { bj: 0, craps: 0, roul: 0 };
    for (const p of players) {
      let f = friends.get(p.id);
      if (p.id === myId || !p.at) { if (f) f.g.visible = false; continue; }
      if (!f) {
        f = makeGuy({ seed: 3, skin: '#e8b48a', shirt: playerShirt(p.color), pants: '#c9a26b', hair: '#3b2a1a' });
        const l = label(p.name, p.color); l.position.y = 3.1; l.scale.multiplyScalar(0.6); f.g.add(l);
        f.armL.rotation.x = f.armR.rotation.x = -0.5;
        scene.add(f.g); friends.set(p.id, f);
      }
      const s = slots[p.at]++;
      f.g.visible = true; f.g.scale.setScalar(0.85);
      const tz = TABLES[p.at].z, x = -0.15 + (s > 1 ? 0.6 : 0), z = tz + (s % 2 ? 2.1 : -2.1);
      f.g.position.set(x, 0, z); f.g.rotation.y = Math.atan2(0.2 - x, tz - z); // stand at the table's ends, facing the felt
    }
    for (const [id, f] of friends) if (!players.some(p => p.id === id)) { scene.remove(f.g); friends.delete(id); }
  }

  // ---------- state → table animation ----------
  let active = 'bj', bjId = null, crId = null, roulId, spin = null, chipSig = '';
  const cards = [];
  const camPos = new THREE.Vector3(-2.4, 2.5, TABLES.bj.z), camLook = new THREE.Vector3(0.2, 0.8, TABLES.bj.z);
  function syncBJ(bj) {
    if (!bj || bj.id !== bjId) { cards.forEach(c => T.bj.g.remove(c.m)); cards.length = 0; bjId = bj?.id ?? null; }
    if (!bj) return;
    const want = [...bj.p.map((v, i) => ['p', v, i]), ...bj.d.map((v, i) => ['d', v, i])];
    for (const [who, v, i] of want) {
      let c = cards.find(c => c.who === who && c.i === i);
      if (!c) { c = { who, i, m: new THREE.Mesh(cardGeo, cardMat('back')) }; c.m.position.set(0.35, TOP + 0.25, -1.1); T.bj.g.add(c.m); cards.push(c); }
      const hidden = who === 'd' && i === 1 && !bj.done;
      c.m.material = cardMat(hidden ? 'back' : `${RANK[v] || v}|${SUITS[(v + i * 3) % 4]}`);
      c.target = new THREE.Vector3(who === 'p' ? -0.75 : 0.15, TOP + 0.003 + i * 0.002, (who === 'p' ? -0.25 : -0.3) + i * 0.24);
    }
    const sig = bj.done ? 0 : bj.bet;
    if (betChips.bj.sig !== sig) { betChips.bj.sig = sig; betChips.bj.clear(); if (sig) betChips.bj.add(chipStack(sig)); }
  }
  function syncCraps(cr) {
    if (cr?.rid && cr.rid !== crId) {
      crId = cr.rid;
      dice.forEach((d, k) => {
        const [rx, rz] = DIE_UP[cr.dice[k]];
        d.anim = { t: 0, from: new THREE.Vector3(-0.85, TOP + 0.4, (k - 0.5) * 0.3), to: new THREE.Vector3(0.35 + Math.random() * 0.3, TOP + 0.065, (Math.random() - 0.5) * 1.6), final: new THREE.Euler(rx, Math.random() * 6.28, rz, 'YXZ'), spin: [8 + Math.random() * 6, 6 + Math.random() * 6, 5 + Math.random() * 6] };
      });
    }
    if (dice.some(d => d.anim)) return; // keep the old puck/chips until the dice stop
    const live = cr && !cr.done && cr.point;
    puck.position.copy(live ? crapsLocal(193 + NUM_BOX[cr.point] * 127, 180) : crapsLocal(80, 60)).setY(TOP + 0.02);
    puck.rotation.x = live ? 0 : Math.PI;
    const sig = cr && !cr.done ? cr.bet : 0;
    if (betChips.craps.sig !== sig) { betChips.craps.sig = sig; betChips.craps.clear(); if (sig) betChips.craps.add(chipStack(sig)); }
  }
  function syncRoul(roul, bets) {
    if (roul && roul.id !== roulId) { roulId = roul.id; spin = { t: 0, target: (WHEEL.indexOf(roul.n) + 0.5) * POCKET, laps: 6 + Math.random() * 2 }; }
    const sig = JSON.stringify(bets);
    if (sig === chipSig) return;
    chipSig = sig; chips.clear();
    for (const [key, amt] of Object.entries(bets)) {
      const [px, py] = cellCenter(key), c = chipStack(amt);
      c.position.set(LAY.x + (0.5 - py / LH) * LAY.h, TOP, LAY.z + (px / LW - 0.5) * LAY.w); chips.add(c);
    }
  }
  ball.position.set(0, 0.03, 0.36);

  return {
    scene, camera, TABLES,
    get active() { return active; },
    setActive(k) { active = k; },
    resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); },
    sync(me, players, myId, bets) {
      placeFriends(players, myId);
      if (!me) return;
      if (roulId === undefined) { roulId = me.roul?.id ?? null; crId = me.craps?.rid ?? null; } // don't replay old results on the first look
      syncBJ(me.bj); syncCraps(me.craps); syncRoul(me.roul, bets);
    },
    spinning: () => !!spin,
    rolling: () => dice.some(d => d.anim),
    // returns { table } or { bet } under the mouse
    pick(ndc) {
      const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(pickables.map(p => p[0]), false);
      if (!hits.length) return null;
      const h = hits[0], table = pickables.find(p => p[0] === h.object)[1];
      if (h.object === layout && active === 'roul') { const key = layoutCell(h.uv.x * LW, (1 - h.uv.y) * LH); if (key) return { bet: key }; }
      return { table };
    },
    update(dt, t) {
      const z = TABLES[active].z, k = 1 - Math.exp(-dt * 4);
      camPos.lerp(new THREE.Vector3(active === 'roul' ? -1.95 : -2.35, active === 'roul' ? 2.55 : 2.45, z), k); camLook.lerp(new THREE.Vector3(0.25, 0.75, z), k);
      camera.position.copy(camPos); camera.lookAt(camLook);
      for (const c of cards) c.m.position.lerp(c.target, 1 - Math.exp(-dt * 9));
      for (const d of dice) {
        const a = d.anim; if (!a) continue;
        a.t = Math.min(1, a.t + dt / 1.1);
        const e = 1 - (1 - a.t) ** 2, left = (1 - a.t) ** 2;
        d.position.lerpVectors(a.from, a.to, e);
        d.position.y = a.to.y + Math.abs(Math.sin(a.t * Math.PI * 2.5)) * 0.35 * (1 - a.t) + (a.from.y - a.to.y) * left;
        d.rotation.set(a.final.x + a.spin[0] * left, a.final.y + a.spin[1] * left, a.final.z + a.spin[2] * left);
        if (a.t >= 1) d.anim = null;
      }
      for (const key in T) { const dl = T[key].dealer; dl.body.position.y = Math.abs(Math.sin(t * 2 + key.length)) * 0.03; dl.head.rotation.z = Math.sin(t * 1.3 + key.length) * 0.15; }
      wheel.rotation.y += dt * (spin ? 2.2 * (1 - spin.t) + 0.4 : 0.4);
      if (spin) {
        spin.t = Math.min(1, spin.t + dt / 3.4);
        const e = 1 - (1 - spin.t) ** 3, rad = spin.t < 0.7 ? 0.47 : 0.47 - (spin.t - 0.7) / 0.3 * 0.11;
        const a = spin.target + (1 - e) * spin.laps * Math.PI * 2;
        ball.position.set(Math.sin(a) * rad, 0.03 + (spin.t > 0.7 ? Math.abs(Math.sin(spin.t * 40)) * 0.03 * (1 - spin.t) : 0.02), Math.cos(a) * rad);
        if (spin.t >= 1) spin = null;
      }
      bulbs.children.forEach((b, i) => b.scale.setScalar(0.8 + 0.3 * Math.sin(t * 3 + i)));
    },
  };
}
