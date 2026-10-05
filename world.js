// world.js — the trip: an abandoned, overgrown highway under misty mountains
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { lcg, canvasTex, geo, box, rbox, cyl, mat, mesh } from './art.js';
import { ROAD_W, STEP } from './sim.js';

const HAZE = '#c4cbc5';

export function setupAtmosphere(scene, renderer) {
  renderer.toneMappingExposure = 1.0;
  scene.background = canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#7f95a3'); gr.addColorStop(0.5, '#b7c2c2'); gr.addColorStop(1, HAZE);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  scene.fog = new THREE.Fog(HAZE, 45, 340);
  scene.add(new THREE.HemisphereLight('#e2e8ea', '#4a5434', 1.35));
  const sun = new THREE.DirectionalLight('#fff0d6', 2.2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  return sun;
}

// ---------- textures ----------
const noiseDots = (g, w, h, r, n, cols, size) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r())); } };
const asphaltTex = canvasTex(512, 1024, (g, w, h) => { // 12 m wide × 24 m long
  const r = lcg(21);
  g.fillStyle = '#45484b'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.5 ? 'rgba(30,32,34,.25)' : 'rgba(110,112,108,.18)'; g.beginPath(); g.ellipse(r() * w, r() * h, 20 + r() * 90, 20 + r() * 120, r() * 3, 0, 7); g.fill(); }
  noiseDots(g, w, h, r, 9000, ['#3b3e41', '#55585a', '#4c4f4f', '#5f625f'], 2);
  for (let c = 0; c < 26; c++) { // cracks with moss growing in them
    let x = r() * w, y = r() * h, a = r() * 6.28;
    const pts = [];
    for (let s = 0; s < 18 + r() * 30; s++) { pts.push([x, y]); a += (r() - 0.5) * 1.2; x += Math.cos(a) * 9; y += Math.sin(a) * 9; }
    g.strokeStyle = '#26282a'; g.lineWidth = 1.5 + r() * 2; g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
    if (r() < 0.6) for (const [px, py] of pts) { g.fillStyle = r() < 0.5 ? '#5d7a34' : '#7a8f45'; g.fillRect(px - 3 + r() * 6, py - 3 + r() * 6, 3 + r() * 4, 3 + r() * 4); }
  }
  g.globalAlpha = 0.7;
  g.fillStyle = '#b9993f'; for (let y = 0; y < h; y += 4) if (r() < 0.9) g.fillRect(26, y, 12, 4); // faded yellow edge line
  g.fillStyle = '#c9c6b8'; for (let y = 0; y < h; y += 4) if (r() < 0.85) g.fillRect(w - 38, y, 10, 4);
  for (const y0 of [60, 572]) for (let y = y0; y < y0 + 128; y += 4) if (r() < 0.8) g.fillRect(w / 2 - 6, y, 12, 4); // faded lane dashes
  g.globalAlpha = 1;
  for (const x0 of [0, w]) for (let y = 0; y < h; y += 6) { // grass creeping in from the edges
    const reach = 6 + Math.abs(Math.sin(y * 0.013) * 30) + r() * 14;
    g.fillStyle = r() < 0.5 ? '#55702f' : '#6b8338'; g.fillRect(x0 ? w - reach : 0, y, reach, 7);
  }
}, true);
const groundTex = canvasTex(256, 256, (g, w, h) => {
  const r = lcg(5);
  g.fillStyle = '#5b6e36'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 30; i++) { g.fillStyle = ['rgba(122,110,70,.35)', 'rgba(70,92,40,.4)', 'rgba(140,140,80,.25)'][i % 3]; g.beginPath(); g.ellipse(r() * w, r() * h, 10 + r() * 40, 10 + r() * 30, r() * 3, 0, 7); g.fill(); }
  noiseDots(g, w, h, r, 5000, ['#4c5f2c', '#6f8240', '#83904b', '#55693a', '#7b7350'], 2);
}, true);
const gravelTex = canvasTex(128, 128, (g, w, h) => {
  const r = lcg(9); g.fillStyle = '#5f6150'; g.fillRect(0, 0, w, h);
  noiseDots(g, w, h, r, 2500, ['#4d4f42', '#77786a', '#55693a', '#6b6b5c'], 2);
}, true);
const bladeTex = canvasTex(128, 128, (g, w, h) => {
  const r = lcg(13);
  for (let i = 0; i < 46; i++) {
    const x = 10 + r() * 108, top = 10 + r() * 70, lean = (r() - 0.5) * 40;
    g.strokeStyle = ['#56722e', '#6f8a3a', '#85994a', '#4a6328', '#9aa35a'][Math.floor(r() * 5)];
    g.lineWidth = 2 + r() * 3; g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + lean * 0.3, (h + top) / 2, x + lean, top); g.stroke();
  }
});
const facadeTex = (base, seed) => canvasTex(256, 256, (g, w, h) => { // 4×4 windows = 12 m square
  const r = lcg(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  noiseDots(g, w, h, r, 1500, ['rgba(0,0,0,.08)', 'rgba(255,255,255,.08)'], 3);
  for (let fy = 0; fy < 4; fy++) {
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, fy * 64 + 58, w, 6);
    for (let fx = 0; fx < 4; fx++) {
      const x = fx * 64 + 14, y = fy * 64 + 14, broken = r() < 0.35;
      g.fillStyle = '#d8d4c8'; g.fillRect(x - 3, y - 3, 42, 38);
      g.fillStyle = broken ? '#0d0f10' : ['#2a3540', '#36434d', '#22292f'][Math.floor(r() * 3)]; g.fillRect(x, y, 36, 32);
      if (!broken && r() < 0.5) { g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + 4, y + 3, 10, 26); }
    }
  }
  for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(40,35,25,.18)'; g.fillRect(r() * w, r() * 60, 3 + r() * 8, 60 + r() * 190); } // water streaks
  for (let i = 0; i < 5; i++) { // ivy climbing from the ground and hanging from the roof
    const x = r() * w, fromTop = r() < 0.4;
    for (let k = 0; k < 90; k++) {
      const y = fromTop ? r() * r() * 160 : h - r() * r() * 220;
      g.fillStyle = ['#3f5a24', '#56742e', '#2f4a1c', '#6a8a36'][k % 4];
      g.beginPath(); g.arc(x + (r() - 0.5) * 50 * (1 - Math.abs(y - h / 2) / h), y, 3 + r() * 6, 0, 7); g.fill();
    }
  }
}, true);
const FACADES = [['#b9b2a2', 31], ['#9c9a92', 32], ['#c7b79a', 33], ['#8e8a80', 34], ['#a99c8b', 35]].map(([c, s]) => new THREE.MeshStandardMaterial({ map: facadeTex(c, s), roughness: 0.95 }));
const rustTex = (paint, seed) => canvasTex(128, 128, (g, w, h) => {
  const r = lcg(seed);
  g.fillStyle = paint; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { g.fillStyle = ['rgba(122,74,42,.7)', 'rgba(94,59,34,.75)', 'rgba(60,50,40,.35)', 'rgba(150,100,60,.5)'][i % 4]; g.beginPath(); g.ellipse(r() * w, r() * h, 3 + r() * 16, 3 + r() * 10, r() * 3, 0, 7); g.fill(); }
  noiseDots(g, w, h, r, 1200, ['rgba(0,0,0,.12)', 'rgba(120,80,50,.3)', 'rgba(255,255,255,.07)'], 2);
  g.fillStyle = 'rgba(80,70,50,.35)'; g.fillRect(0, h * 0.75, w, h * 0.25); // dirt splash low on the body
});
const RUST = ['#7d8a93', '#8b5a4a', '#a39a7a', '#5d6b5a', '#9a9da0'].map((c, i) => new THREE.MeshStandardMaterial({ map: rustTex(c, 40 + i), roughness: 0.9, metalness: 0.15 }));
const signTex = (lines, bg = '#2f6b45') => canvasTex(512, 220, (g, w, h) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#e8eee6'; g.lineWidth = 8; g.strokeRect(12, 12, w - 24, h - 24);
  g.fillStyle = '#e8eee6'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([t, size, y]) => { g.font = `700 ${size}px Fredoka, Arial, sans-serif`; g.fillText(t, w / 2, y); });
  const r = lcg(lines.length * 7 + 1); // weathering
  noiseDots(g, w, h, r, 600, ['rgba(60,50,30,.25)', 'rgba(255,255,255,.08)', 'rgba(110,70,40,.35)'], 4);
});
const ADS = [['SUNNY COLA', '#c0392b', 'ice cold since 1962'], ['BIG JIM\'S AUTO', '#d4a017', 'we finance anyone'], ['VISIT LAKEVIEW', '#2e86ab', 'the friendliest town'], ['DR. SMILE DENTAL', '#7d3c98', 'brighter tomorrow']].map(([t, c, sub], i) =>
  new THREE.MeshStandardMaterial({ roughness: 0.9, map: canvasTex(512, 256, (g, w, h) => {
    const r = lcg(60 + i);
    g.fillStyle = c; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f5efe0'; g.textAlign = 'center'; g.font = '700 70px Fredoka, Arial, sans-serif'; g.fillText(t, w / 2, 120);
    g.font = '600 34px Fredoka, Arial, sans-serif'; g.fillText(sub, w / 2, 185);
    for (let k = 0; k < 9; k++) { g.fillStyle = '#d9d2bf'; g.fillRect(r() * w, r() * h, 30 + r() * 90, 20 + r() * 60); } // peeled paper
    noiseDots(g, w, h, r, 1500, ['rgba(0,0,0,.2)', 'rgba(255,255,255,.1)'], 4);
  }) }));

const groundMat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 });
const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92, side: THREE.DoubleSide });
const gravelMat = new THREE.MeshStandardMaterial({ map: gravelTex, roughness: 1, side: THREE.DoubleSide });
const leafMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
const grassMat = new THREE.MeshStandardMaterial({ map: bladeTex, alphaTest: 0.45, roughness: 1 });
const lumpy = (r, detail, seed) => { // a leafy, uneven blob
  const ico = new THREE.IcosahedronGeometry(r, detail); ico.deleteAttribute('normal'); ico.deleteAttribute('uv');
  const g = mergeVertices(ico), p = g.attributes.position, rnd = lcg(seed), v = new THREE.Vector3();
  const bumps = Array.from({ length: 6 }, () => new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize());
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const k = 1 + bumps.reduce((s, b) => s + Math.max(0, v.dot(b)) ** 3 * 0.35, 0) + (rnd() - 0.5) * 0.12;
    p.setXYZ(i, v.x * r * k, v.y * r * k * 0.85, v.z * r * k);
  }
  g.computeVertexNormals();
  return g;
};
const tuftGeo = (() => {
  // three crossed cards, each doubled back-to-back so every face is front-facing with an upward normal
  const a = new THREE.PlaneGeometry(1.2, 0.9).translate(0, 0.45, 0);
  const g = mergeGeometries([0, 1, 2].flatMap(i => [a.clone().rotateY((i * Math.PI) / 3), a.clone().rotateY((i * Math.PI) / 3 + Math.PI)])), n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0); // light it like the ground under it
  return g;
})();
const crownGeo = lumpy(1.6, 3, 3), bushGeo = lumpy(1.2, 2, 4);
const pineGeo = mergeGeometries([0, 1, 2].map(i => new THREE.ConeGeometry(1.7 - i * 0.45, 2.4, 9).translate(0, 2.4 + i * 1.4, 0)));

// ---------- builders ----------
let world = null, worldGeos = [], crows = null, crowCenter = new THREE.Vector3();
const dummy = new THREE.Object3D(), tmpC = new THREE.Color();

function ribbon(pts, half, y, m, vScale) {
  const pos = [], uv = [], idx = [];
  pts.forEach((p, i) => {
    const cx = Math.cos(p.h), sz = -Math.sin(p.h), v = (i * STEP) / vScale;
    pos.push(p.x + cx * half, y, p.z + sz * half, p.x - cx * half, y, p.z - sz * half);
    uv.push(0, v, 1, v);
    if (i) { const a = i * 2 - 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  worldGeos.push(g);
  return mesh(g, m, false);
}

function mountains(cx, cz) {
  const g = new THREE.Group();
  const range = (R, base, amp, rock, seed) => {
    const r = lcg(seed), ph = [r() * 6, r() * 6, r() * 6, r() * 6], segs = 520, pos = [], col = [], idx = [];
    const haze = new THREE.Color(HAZE), rk = new THREE.Color(rock), snow = new THREE.Color('#e4e9ea');
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const n = 0.5 + 0.28 * Math.sin(a * 3 + ph[0]) + 0.2 * Math.sin(a * 7 + ph[1]) + 0.12 * Math.abs(Math.sin(a * 13 + ph[2])) + 0.1 * Math.abs(Math.sin(a * 31 + ph[3])) + 0.05 * Math.abs(Math.sin(a * 67 + ph[0])) - 0.12; // abs() terms make sharp ridgelines
      const top = base + amp * Math.max(0, n) ** 1.6, sx = Math.sin(a), sz = Math.cos(a);
      for (const [f, y] of [[1, -30], [1.01, top * 0.55], [1.02, top]]) pos.push(sx * R * f, y, sz * R * f);
      col.push(...haze.toArray(), ...haze.clone().lerp(rk, 0.55).toArray(), ...(top > base + amp * 0.55 ? snow : rk).toArray());
      if (i) { const b = (i - 1) * 3; idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5); }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geom.setIndex(idx); worldGeos.push(geom);
    return new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  };
  g.add(range(900, 140, 360, '#8a979b', 1), range(620, 50, 170, '#55665c', 2));
  g.position.set(cx, 0, cz);
  return g;
}

function wreckMesh(w) {
  const car = new THREE.Group(), paint = RUST[w.c], glass = mat('#1e2428', { roughness: 0.3 }), tire = mat('#1f1f1f', { roughness: 1 });
  const add = (m, x, y, z) => { m.position.set(x, y, z); car.add(m); return m; };
  if (w.m === 2) { // city bus
    add(mesh(rbox(2.6, 2.7, 10, 0.3), paint), 0, 1.6, 0);
    for (const s of [1, -1]) add(mesh(box(0.06, 0.9, 8.2), glass), 1.31 * s, 2.2, 0.2);
    add(mesh(box(2.3, 1.1, 0.06), glass), 0, 2.1, 5.01);
    for (const z of [3.4, -3.4]) for (const s of [1, -1]) add(mesh(cyl(0.5, 0.5, 0.35, 12), tire), 1.15 * s, 0.4, z).rotation.z = Math.PI / 2;
    add(mesh(bushGeo, mat('#3d5a24', { roughness: 0.9 })), 0.3, 3.1, -2.5).scale.set(1, 0.6, 1.6);
  } else {
    const tall = w.m === 1;
    add(mesh(rbox(2.0, tall ? 1.0 : 0.75, tall ? 4.6 : 4.4, 0.28), paint), 0, tall ? 0.85 : 0.68, 0);
    const cab = add(mesh(rbox(1.8, tall ? 0.85 : 0.68, tall ? 2.9 : 2.2, 0.25), paint), 0, tall ? 1.75 : 1.35, tall ? -0.5 : -0.2);
    const win = mesh(box(1.84, tall ? 0.5 : 0.42, tall ? 2.5 : 1.8), glass, false); win.position.y = 0.05; cab.add(win);
    for (const z of [1.4, -1.4]) for (const s of [1, -1]) { const t = add(mesh(cyl(0.38, 0.38, 0.3, 12), tire), 0.95 * s, 0.3, z); t.rotation.z = Math.PI / 2; t.scale.set(1, 1, 0.75); }
    if ((w.c + w.m) % 3 === 0) add(mesh(bushGeo, mat('#4a6a2a', { roughness: 0.9 })), 0.4, 1.2, 1.4).scale.setScalar(0.6);
  }
  car.position.set(w.x, -0.08, w.z); car.rotation.set(0, w.h, (w.c - 2) * 0.03);
  return car;
}

function building(p) {
  const g = new THREE.BoxGeometry(p.w, p.ht, p.d), uv = g.attributes.uv;
  const dims = [[p.d, p.ht], [p.d, p.ht], [p.w, p.d], [p.w, p.d], [p.w, p.ht], [p.w, p.ht]];
  for (let i = 0; i < uv.count; i++) { const [fw, fh] = dims[Math.floor(i / 4)]; uv.setXY(i, (uv.getX(i) * fw) / 12, (uv.getY(i) * fh) / 12); }
  worldGeos.push(g);
  const roof = mat('#5f5d55', { roughness: 1 }), facade = FACADES[Math.floor(p.s * 10) % FACADES.length];
  const b = new THREE.Group(), body = mesh(g, [facade, facade, roof, roof, facade, facade]);
  body.position.y = p.ht / 2; b.add(body);
  const r = lcg(Math.floor(p.x * 13 + p.z * 7) & 0xffff || 1);
  const ac = mesh(box(2.2, 1.2, 1.6), mat('#8d8b84')); ac.position.set((r() - 0.5) * p.w * 0.5, p.ht + 0.6, (r() - 0.5) * p.d * 0.5); b.add(ac);
  for (let i = 0; i < 3; i++) { const bush = mesh(bushGeo, mat('#3f5d25', { roughness: 0.9 })); bush.position.set((r() - 0.5) * p.w * 0.7, p.ht + 0.3, (r() - 0.5) * p.d * 0.7); bush.scale.set(1.3, 0.7, 1.3); b.add(bush); }
  if (r() < 0.35) { // rooftop billboard
    const bb = new THREE.Group(); bb.position.y = p.ht;
    for (const x of [-2.5, 2.5]) { const leg = mesh(box(0.25, 4, 0.25), mat('#4a4a46')); leg.position.set(x, 2, 0); bb.add(leg); }
    const board = mesh(box(8, 4, 0.3), mat('#3a3a36')); board.position.y = 5.5; bb.add(board);
    const face = new THREE.Mesh(geo('ad', () => new THREE.PlaneGeometry(7.6, 3.6)), ADS[Math.floor(r() * ADS.length)]); face.position.set(0, 5.5, 0.16); bb.add(face);
    bb.rotation.y = Math.PI; b.add(bb);
  }
  b.position.set(p.x, -0.1, p.z); b.rotation.y = p.h;
  return b;
}

function lamp(p) {
  const g = new THREE.Group(), metal = mat('#6d6e69', { metalness: 0.4, roughness: 0.6 });
  const pole = mesh(cyl(0.11, 0.16, 8, 8), metal); pole.position.y = 4; g.add(pole);
  const arm = mesh(box(2.6, 0.12, 0.12), metal); arm.position.set(-1.25, 7.9, 0); arm.rotation.z = -0.08; g.add(arm);
  const head = mesh(box(0.8, 0.18, 0.4), mat('#4b4c48')); head.position.set(-2.5, 7.75, 0); g.add(head);
  g.position.set(p.x, 0, p.z); g.rotation.set(0, p.h, p.tilt);
  return g;
}

function pole(p) {
  const g = new THREE.Group(), wood = mat('#5a4632', { roughness: 1 });
  const post = mesh(cyl(0.14, 0.2, 9.5, 7), wood); post.position.y = 4.75; g.add(post);
  const bar = mesh(box(2.4, 0.16, 0.16), wood); bar.position.y = 8.6; g.add(bar);
  g.position.set(p.x, 0, p.z); g.rotation.set(0, p.h, p.tilt);
  return g;
}

function gantry(p, trip, mi) {
  const g = new THREE.Group(), steel = mat('#7c7f7b', { metalness: 0.4, roughness: 0.7 });
  for (const s of [1, -1]) { const leg = mesh(cyl(0.18, 0.22, 7.5, 8), steel); leg.position.set(s * (ROAD_W / 2 + 1.8), 3.75, 0); g.add(leg); }
  const truss = mesh(box(ROAD_W + 4.4, 0.5, 0.5), steel); truss.position.y = 7.4; g.add(truss);
  const board = mesh(box(6, 2.6, 0.2), mat('#2f6b45')); board.position.set(-1.5, 8.9, 0); board.rotation.z = 0.02; g.add(board);
  const face = new THREE.Mesh(geo('gantryFace', () => new THREE.PlaneGeometry(5.8, 2.5)), new THREE.MeshStandardMaterial({ roughness: 0.8, map: signTex([['NORTH', 54, 62], [`STOP #${trip}`, 70, 128], [`${mi} MI`, 44, 188]]) }));
  face.position.z = -0.11; face.rotation.y = Math.PI; board.add(face);
  g.position.set(p.x, 0, p.z); g.rotation.y = p.h;
  return g;
}

function instanced(geom, material, list, place, colorFn) {
  const m = new THREE.InstancedMesh(geom, material, Math.max(1, list.length));
  m.count = list.length;
  list.forEach((t, i) => { place(t, i); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); if (colorFn) m.setColorAt(i, colorFn(t, i)); });
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function buildWorld(scene, rd, trip, seed) {
  if (world) { scene.remove(world); worldGeos.forEach(g => g.dispose()); }
  worldGeos = []; world = new THREE.Group(); scene.add(world);
  const own = g => (worldGeos.push(g), g), r = lcg((seed % 2147483646) + 1);
  const xs = rd.pts.map(p => p.x), zs = rd.pts.map(p => p.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const sw = Math.max(...xs) - Math.min(...xs) + 900, sh = Math.max(...zs) - Math.min(...zs) + 900;
  const ground = mesh(own(new THREE.PlaneGeometry(sw, sh)), groundMat, false);
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, 0, cz); groundTex.repeat.set(sw / 9, sh / 9);
  world.add(ground, ribbon(rd.pts, ROAD_W / 2 + 2, 0.02, gravelMat, 6), ribbon(rd.pts, ROAD_W / 2, 0.05, roadMat, 24), mountains(cx, cz));

  const P = k => rd.props.filter(p => p.k === k);
  const pines = P(0).filter(t => t.h % 1 < 0.3), broad = P(0).filter(t => t.h % 1 >= 0.3);
  const set = (x, y, z, sx, sy = sx, sz = sx, ry = 0) => { dummy.position.set(x, y, z); dummy.rotation.set(0, ry, 0); dummy.scale.set(sx, sy, sz); };
  world.add(
    instanced(own(new THREE.CylinderGeometry(0.2, 0.34, 3, 7)), mat('#4e3d2c', { roughness: 1 }), broad, t => set(t.x, 1.5 * t.s, t.z, t.s)),
    instanced(crownGeo, leafMat, broad.flatMap(t => [[t, 0], [t, 1], [t, 2]]), ([t, j]) => set(t.x + [0, 1, -0.9][j] * t.s, [3.6, 4.4, 4.0][j] * t.s, t.z + [0, 0.6, 0.7][j] * t.s, t.s * [1.2, 0.85, 0.8][j], undefined, undefined, t.h + j),
      ([t, j]) => tmpC.setHSL(0.21 + (t.h % 0.08), 0.42 + j * 0.05, 0.17 + j * 0.035)),
    instanced(pineGeo, leafMat, pines, t => set(t.x, 0, t.z, t.s * 1.1, t.s * 1.5), t => tmpC.setHSL(0.3, 0.3, 0.19 + (t.h % 0.1))),
    instanced(bushGeo, leafMat, P(1), t => set(t.x, 0.5 * t.s, t.z, t.s * 1.4, t.s, t.s * 1.4, t.h), t => tmpC.setHSL(0.22 + (t.h % 0.08), 0.45, 0.16 + (t.s % 0.06))),
  );
  // grass tufts: thick on the shoulders, poking through the cracks, scattered in the fields
  const tufts = [];
  rd.pts.forEach(p => {
    for (let k = 0; k < 14; k++) {
      const z = r(), off = z < 0.15 ? (r() - 0.5) * ROAD_W : z < 0.65 ? (r() < 0.5 ? -1 : 1) * (ROAD_W / 2 - 1.5 + r() * 5) : (r() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 3 + r() * 40);
      const along = (r() - 0.5) * STEP;
      tufts.push({ x: p.x + Math.cos(p.h) * off + Math.sin(p.h) * along, z: p.z - Math.sin(p.h) * off + Math.cos(p.h) * along, s: 0.6 + r() * (Math.abs(off) < ROAD_W / 2 - 1 ? 0.6 : 1.4), h: r() * 6.28, c: r() });
    }
  });
  const grass = instanced(tuftGeo, grassMat, tufts, t => set(t.x, 0, t.z, t.s, t.s * (0.8 + t.c * 0.6), t.s, t.h), t => tmpC.setHSL(0.16 + t.c * 0.1, 0.35, 0.55 + t.c * 0.25));
  grass.castShadow = false; world.add(grass);

  for (const p of P(2)) world.add(building(p));
  for (const p of P(3)) world.add(lamp(p));
  for (const w of rd.wrecks) world.add(wreckMesh(w));
  const poles = P(4);
  poles.forEach(p => world.add(pole(p)));
  const wire = [];
  for (let i = 1; i < poles.length; i++) for (const off of [-1, 0, 1]) { // sagging power lines
    const a = poles[i - 1], b = poles[i];
    const ax = a.x + Math.cos(a.h) * off, az = a.z - Math.sin(a.h) * off, bx = b.x + Math.cos(b.h) * off, bz = b.z - Math.sin(b.h) * off;
    for (let s = 0; s < 8; s++) {
      const t0 = s / 8, t1 = (s + 1) / 8, sag = t => 8.7 - Math.sin(t * Math.PI) * 1.3;
      wire.push(ax + (bx - ax) * t0, sag(t0), az + (bz - az) * t0, ax + (bx - ax) * t1, sag(t1), az + (bz - az) * t1);
    }
  }
  const wg = own(new THREE.BufferGeometry()); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
  world.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#2b2b28' })));
  for (let i = 40; i < rd.n - 20; i += 45) world.add(gantry(rd.pts[i], trip, (((rd.n - i) * STEP) / 1609).toFixed(1)));

  // the stop: an overgrown gas station
  const end = rd.pts[rd.n - 1], st = new THREE.Group();
  st.position.set(end.x + Math.sin(end.h) * 6, 0, end.z + Math.cos(end.h) * 6); st.rotation.y = end.h;
  const add = (m, x, y, z) => { m.position.set(x, y, z); st.add(m); return m; };
  add(mesh(box(26, 0.1, 24), mat('#7d7f78', { roughness: 1 }), false), 0, 0.06, 0);
  add(mesh(box(16, 0.8, 11), RUST[1]), 0, 5.6, 0);
  add(mesh(box(16.1, 0.3, 11.1), mat('#cfc8b8')), 0, 5.1, 0);
  for (const [x, z] of [[6, 4], [-6, 4], [6, -4], [-6, -4]]) add(mesh(cyl(0.3, 0.3, 5.2), mat('#cfc8b8')), x, 2.6, z);
  for (const x of [-2.5, 2.5]) add(mesh(box(1, 1.6, 0.8), RUST[2]), x, 0.8, 0);
  for (let i = 0; i < 4; i++) add(mesh(bushGeo, mat('#3f5d25', { roughness: 0.9 })), (r() - 0.5) * 16, 6.1, (r() - 0.5) * 9).scale.set(1.4, 0.6, 1.4);
  add(mesh(cyl(0.2, 0.2, 7), mat('#6d6e69')), 9, 3.5, 7);
  const sign = add(mesh(box(4.4, 2.2, 0.3), mat('#3a3a36')), 9, 7.6, 7);
  const face = new THREE.Mesh(own(new THREE.PlaneGeometry(4.2, 2)), new THREE.MeshStandardMaterial({ roughness: 0.9, map: signTex([['FUEL · FOOD', 46, 70], [`STOP #${trip}`, 76, 145]], '#8f3b33') }));
  face.position.z = -0.16; face.rotation.y = Math.PI; sign.add(face);
  add(new THREE.Mesh(cyl(3, 3, 80, 24), new THREE.MeshBasicMaterial({ color: '#ffd43b', transparent: true, opacity: 0.12, depthWrite: false })), 0, 40, 0);
  world.add(st);

  // a flock of crows wheeling over the road
  const wing = own(new THREE.BufferGeometry());
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, -0.6, 0.1, -0.1, 0, 0, -0.2, 0, 0, 0.25, 0.6, 0.1, -0.1, 0, 0, -0.2], 3));
  crows = new THREE.InstancedMesh(wing, new THREE.MeshBasicMaterial({ color: '#16181a', side: THREE.DoubleSide }), 28);
  crows.birds = Array.from({ length: 28 }, () => ({ a: r() * 6.28, rad: 8 + r() * 18, y: 22 + r() * 12, sp: 0.3 + r() * 0.4, f: r() * 6 }));
  const mid = rd.pts[Math.floor(rd.n * 0.35)];
  crowCenter.set(mid.x, 0, mid.z);
  world.add(crows);
}

export function updateWorld(dt, t) {
  if (!crows) return;
  crows.birds.forEach((b, i) => {
    b.a += b.sp * dt;
    dummy.position.set(crowCenter.x + Math.sin(b.a) * b.rad, b.y + Math.sin(t * 0.7 + b.f) * 2, crowCenter.z + Math.cos(b.a) * b.rad);
    dummy.rotation.set(0, b.a + Math.PI / 2, 0);
    dummy.scale.set(1, 1 + Math.sin(t * 9 + b.f) * 0.9, 1);
    dummy.updateMatrix(); crows.setMatrixAt(i, dummy.matrix);
  });
  crows.instanceMatrix.needsUpdate = true;
}
