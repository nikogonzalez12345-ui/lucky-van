// main.js — rendering, input, networking (PeerJS, host-authoritative) and UI
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createSim, makeRoad, ROAD_W, STEP, WEAPONS, UPGRADES, MAX_LVL, upPrice, SEATS, toWorld } from './sim.js';
import { handValue, RED } from './casino.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const fmt = n => Math.round(n).toLocaleString('en-US');
const setHTML = (el, h) => { if (el._h !== h) { el._h = h; el.innerHTML = h; } };
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const lcg = s => () => (s = (s * 16807) % 2147483647) / 2147483647;

// ======================= renderer =======================
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 700);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
scene.background = canvasTex(4, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#3f8fea'); gr.addColorStop(0.6, '#a9d8ff'); gr.addColorStop(1, '#e3f4ff');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
scene.fog = new THREE.Fog('#cfeaff', 90, 260);
scene.add(new THREE.HemisphereLight('#e3f1ff', '#7da35e', 1.5));
const sun = new THREE.DirectionalLight('#fff0d4', 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// ---------- shared geometry / materials ----------
const GC = {}, MC = {};
const geo = (k, make) => (GC[k] ||= make());
const sphere = r => geo('s' + r, () => new THREE.SphereGeometry(r, 20, 14));
const cap = (r, l) => geo(`c${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 14));
const box = (x, y, z) => geo(`b${x},${y},${z}`, () => new THREE.BoxGeometry(x, y, z));
const rbox = (x, y, z, r) => geo(`r${x},${y},${z},${r}`, () => new RoundedBoxGeometry(x, y, z, 4, r));
const cyl = (a, b, h, n = 16) => geo(`y${a},${b},${h},${n}`, () => new THREE.CylinderGeometry(a, b, h, n));
const mat = (c, o = {}) => (MC[c + JSON.stringify(o)] ||= new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, ...o }));
const mesh = (g, m, shadow = true) => { const o = new THREE.Mesh(g, m); o.castShadow = shadow; o.receiveShadow = true; return o; };

function shirtTex(base, flower, leaf, seed) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = lcg(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 22; i++) {
      const x = r() * w, y = r() * h;
      g.fillStyle = leaf; g.beginPath(); g.ellipse(x + 14, y + 8, 18, 7, r() * 3, 0, 7); g.fill();
      g.fillStyle = flower;
      for (let k = 0; k < 5; k++) { const a = k * 1.2566; g.beginPath(); g.arc(x + Math.cos(a) * 8, y + Math.sin(a) * 8, 7, 0, 7); g.fill(); }
      g.fillStyle = '#ffe066'; g.beginPath(); g.arc(x, y, 4.5, 0, 7); g.fill();
    }
  }, true);
}
const rattyTex = (base, seed) => canvasTex(128, 128, (g, w, h) => {
  const r = lcg(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(70,45,20,${0.2 + r() * 0.3})`; g.beginPath(); g.ellipse(r() * w, r() * h, 6 + r() * 14, 4 + r() * 8, r() * 3, 0, 7); g.fill(); }
  g.fillStyle = '#2a2a2a';
  for (let i = 0; i < 5; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y + 14); g.lineTo(x - 6, y + 10); g.fill(); }
}, true);
const Z_SHIRTS = ['#8d6e63', '#6c7a89', '#a1887f', '#7b8d6a', '#9e7b9b', '#c2a878'].map((c, i) => new THREE.MeshStandardMaterial({ map: rattyTex(c, i + 5), roughness: 0.8 }));
const P_SHIRTS = {};
const playerShirt = color => (P_SHIRTS[color] ||= new THREE.MeshStandardMaterial({ map: shirtTex(color, '#ffffff', '#2f9e44', color.length * 97 + color.charCodeAt(1)), roughness: 0.7 }));
const grassTex = canvasTex(128, 128, (g, w, h) => {
  const r = lcg(11); g.fillStyle = '#7cc35a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 400; i++) { g.fillStyle = r() < 0.5 ? '#6db54e' : '#8fd06a'; g.fillRect(r() * w, r() * h, 2, 4); }
}, true);
const roadTex = canvasTex(256, 256, (g, w, h) => {
  const r = lcg(3); g.fillStyle = '#50535c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? '#46494f' : '#5b5e67'; g.fillRect(r() * w, r() * h, 3, 3); }
  g.fillStyle = '#f4f1e8'; g.fillRect(12, 0, 8, h); g.fillRect(w - 20, 0, 8, h);
  g.fillStyle = '#ffc93c'; g.fillRect(w / 2 - 5, 30, 10, h / 2);
}, true);
const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95 });
const roadMat = new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.85, side: THREE.DoubleSide });
const dirtMat = new THREE.MeshStandardMaterial({ color: '#c49a63', roughness: 1, side: THREE.DoubleSide });
const crownMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });

function label(text, color) {
  const tex = canvasTex(256, 64, (g, w, h) => {
    g.font = '700 38px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 8; g.strokeStyle = '#1b2340'; g.strokeText(text, w / 2, h / 2);
    g.fillStyle = color; g.fillText(text, w / 2, h / 2);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  s.scale.set(3, 0.75, 1); s.renderOrder = 10;
  return s;
}

// ======================= characters =======================
const eyeW = mat('#ffffff', { roughness: 0.2 }), eyeB = mat('#111111', { roughness: 0.2 });
function makeGuy(o) {
  const g = new THREE.Group(), body = new THREE.Group(), sh = !o.zombie;
  g.add(body);
  const skin = mat(o.skin), pants = mat(o.pants);
  const limb = (m, r, len, x, y) => {
    const p = new THREE.Group(); p.position.set(x, y, 0); p.rotation.order = 'YXZ';
    const l = mesh(cap(r, len), m, sh); l.position.y = -len / 2 - r * 0.3; p.add(l);
    p.tip = -len - r * 0.6; body.add(p); return p;
  };
  const legL = limb(pants, 0.15, 0.42, 0.18, 0.8), legR = limb(pants, 0.15, 0.42, -0.18, 0.8);
  for (const leg of [legL, legR]) {
    const shoe = mesh(sphere(0.17), mat(o.shoes || '#7a4a24'), sh);
    shoe.scale.set(1, 0.6, 1.4); shoe.position.set(0, leg.tip + 0.04, 0.07); leg.add(shoe);
  }
  const torso = mesh(cap(0.34, 0.42), o.shirt, sh); torso.position.y = 1.28; torso.scale.set(1.05, 1, 0.85); body.add(torso);
  const armL = limb(o.shirt, 0.11, 0.48, 0.47, 1.66), armR = limb(o.shirt, 0.11, 0.48, -0.47, 1.66);
  for (const a of [armL, armR]) { const hand = mesh(sphere(0.13), skin, sh); hand.position.y = a.tip; a.add(hand); }
  const head = new THREE.Group(); head.position.y = 2.18; body.add(head);
  const skull = mesh(sphere(0.44), skin, sh); skull.scale.set(1, 1.08, 0.95); head.add(skull);
  const r = lcg(o.seed || 1);
  for (const s of [1, -1]) { // big googly eyes
    const eye = mesh(sphere(0.17), eyeW, false); eye.position.set(0.16 * s, 0.08, 0.33); head.add(eye);
    const pu = mesh(sphere(o.zombie && s < 0 ? 0.04 : 0.065), eyeB, false);
    pu.position.set(0.16 * s + (o.zombie ? (r() - 0.5) * 0.1 : 0), 0.08 + (o.zombie ? (r() - 0.5) * 0.1 : 0), 0.49); head.add(pu);
  }
  const nose = mesh(sphere(0.09), skin, false); nose.position.set(0, -0.06, 0.43); head.add(nose);
  if (o.zombie) {
    const m = mesh(sphere(0.12), mat('#3a1020'), false); m.scale.set(1.2, 0.7, 0.5); m.position.set(0, -0.24, 0.36); head.add(m);
  } else {
    const m = mesh(geo('smile', () => new THREE.TorusGeometry(0.12, 0.025, 6, 14, Math.PI)), mat('#5c1f1f'), false);
    m.rotation.z = Math.PI; m.position.set(0, -0.2, 0.39); head.add(m);
  }
  if (o.hair) { const h = mesh(sphere(0.46), mat(o.hair), sh); h.scale.set(1.02, 0.6, 1.02); h.position.set(0, 0.24, -0.12); head.add(h); }
  return { g, body, legL, legR, armL, armR, head, torso, ph: r() * 6 };
}

const blobGeo = new THREE.CircleGeometry(0.75, 18).rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false });
const ZSKINS = ['#9ccc65', '#8fbf8f', '#a9c26b', '#7fb38a', '#b5c98a'], ZPANTS = ['#4c5a78', '#5b4636', '#3d3d3d', '#6b5b45'];
function zombieMesh(id, t) {
  const r = lcg(id * 7919 + 13), pick = a => a[Math.floor(r() * a.length)];
  const z = makeGuy({ zombie: true, seed: id + 1, skin: pick(ZSKINS), shirt: pick(Z_SHIRTS), pants: pick(ZPANTS),
    hair: r() < 0.5 ? pick(['#3b2a1a', '#666', '#6d4c2f']) : null, shoes: '#3a3a3a' });
  z.armL.rotation.x = -1.45; z.armR.rotation.x = -1.35;
  z.head.rotation.z = (r() - 0.5) * 0.5;
  if (t === 'brute') { z.g.scale.setScalar(1.55); z.torso.scale.x = 1.4; }
  if (t === 'runner') { z.g.scale.setScalar(0.92); z.body.rotation.x = 0.35; }
  z.g.add(new THREE.Mesh(blobGeo, blobMat));
  z.t = t; z.spin = 0;
  scene.add(z.g);
  return z;
}

const GUNS = { pistol: [0.32, '#343a40'], smg: [0.55, '#495057'], shotgun: [0.85, '#8a5a35'], rifle: [1.05, '#5c4033'], minigun: [0.9, '#868e96'], rocket: [1.15, '#2f9e44'] };
function gunMesh(w) {
  const [L, c] = GUNS[w];
  const m = mesh(w === 'rocket' || w === 'minigun' ? cyl(w === 'rocket' ? 0.14 : 0.11, w === 'rocket' ? 0.14 : 0.11, L, 12) : box(0.12, L, 0.18), mat(c, { metalness: 0.3 }));
  m.position.y = -0.55 - L / 2 + 0.15;
  return m;
}

// ======================= van =======================
const van = (() => {
  const g = new THREE.Group(), ride = new THREE.Group(), steel = mat('#adb5bd', { metalness: 0.6, roughness: 0.35 });
  g.add(ride);
  const add = (m, x, y, z, parent = ride) => { m.position.set(x, y, z); parent.add(m); return m; };
  add(mesh(rbox(2.4, 1.0, 5.4, 0.3), mat('#fff3d6')), 0, 1.05, 0);
  add(mesh(rbox(2.34, 1.25, 5.2, 0.4), mat('#33b5c7')), 0, 2.0, 0);
  const glass = mat('#27406e', { roughness: 0.1, metalness: 0.4 });
  add(mesh(box(2.0, 0.7, 0.1), glass), 0, 2.1, 2.6).rotation.x = -0.12;
  for (const s of [1, -1]) {
    add(mesh(box(0.08, 0.55, 3.6), glass), 1.17 * s, 2.15, -0.5);
    add(mesh(sphere(0.2), mat('#fff3b0', { emissive: '#ffe066', emissiveIntensity: 0.6 })), 0.8 * s, 1.25, 2.66);
    add(mesh(box(0.08, 0.08, 4.2), steel), 1.0 * s, 2.75, -0.3);
  }
  add(mesh(box(1.8, 0.5, 0.08), glass), 0, 2.15, -2.62);
  add(mesh(cyl(0.32, 0.32, 0.08, 20), mat('#ffffff')), 0, 1.45, 2.72).rotation.x = Math.PI / 2;
  add(mesh(box(2.5, 0.28, 0.35), mat('#2b2d33')), 0, 0.65, 2.7);
  add(mesh(box(2.5, 0.28, 0.35), mat('#2b2d33')), 0, 0.65, -2.7);
  const wheels = [[1.1, 1.7], [-1.1, 1.7], [1.1, -1.7], [-1.1, -1.7]].map(([x, z]) => {
    const w = new THREE.Group(); w.rotation.order = 'YXZ';
    const t = mesh(cyl(0.52, 0.52, 0.42, 20), mat('#2b2d33')); t.rotation.z = Math.PI / 2;
    const hub = mesh(cyl(0.26, 0.26, 0.44, 12), mat('#e9ecef')); hub.rotation.z = Math.PI / 2;
    w.add(t, hub); return add(w, x, 0.52, z, g);
  });
  // upgrade visuals
  const plow = new THREE.Group(); add(plow, 0, 0, 0);
  add(mesh(box(2.9, 1.0, 0.18), steel), 0, 0.85, 3.05, plow).rotation.x = -0.35;
  const spikes = [-1.2, 1.2, -0.7, 0.7, -0.2, 0.2].map(x => { const c = add(mesh(geo('spike', () => new THREE.ConeGeometry(0.1, 0.5, 8)), steel), x, 0.9, 3.35, plow); c.rotation.x = Math.PI / 2; return c; });
  const armor = new THREE.Group(); add(armor, 0, 0, 0);
  for (const s of [1, -1]) add(mesh(box(0.1, 0.8, 4.4), mat('#868e96', { metalness: 0.5 })), 1.27 * s, 1.2, 0, armor);
  const grates = new THREE.Group(); add(grates, 0, 0, 0);
  for (const s of [1, -1]) add(mesh(geo('grate', () => new THREE.BoxGeometry(0.04, 0.6, 3.6, 1, 3, 14)), mat('#343a40', { wireframe: true })), 1.24 * s, 2.15, -0.5, grates);
  const stacks = new THREE.Group(); add(stacks, 0, 0, 0);
  for (const s of [1, -1]) add(mesh(cyl(0.1, 0.12, 1, 10), steel), 0.85 * s, 2.9, -2.3, stacks);
  const spare = add(mesh(cyl(0.45, 0.45, 0.3, 18), mat('#2b2d33')), 0, 1.6, -2.85); spare.rotation.x = Math.PI / 2;
  const cargo = add(mesh(rbox(1.4, 0.5, 1.2, 0.1), mat('#e8590c')), 0, 2.95, -1.0);
  function looks(up) {
    plow.visible = up.plow > 0; plow.scale.x = 1 + 0.04 * up.plow;
    spikes.forEach((c, i) => (c.visible = i < up.plow));
    armor.visible = up.armor > 0; grates.visible = up.armor >= 3;
    stacks.visible = up.engine > 0; stacks.scale.y = 0.6 + 0.25 * up.engine; stacks.position.y = 0.3 * up.engine - 0.3;
    spare.visible = up.body > 0; cargo.visible = up.body >= 3;
    const ws = 1 + 0.07 * up.tires;
    wheels.forEach(w => { w.scale.setScalar(ws); w.position.y = 0.52 * ws; });
    ride.position.y = 0.52 * (ws - 1);
  }
  looks({ engine: 0, tires: 0, body: 0, armor: 0, plow: 0 });
  scene.add(g);
  return { g, ride, wheels, looks, spin: 0 };
})();

// ======================= world =======================
let world = null, worldGeos = [], builtSeed = null;
const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
function ribbon(pts, half, y, m) {
  const pos = [], uv = [], idx = [];
  pts.forEach((p, i) => {
    const cx = Math.cos(p.h), sz = -Math.sin(p.h), v = (i * STEP) / 10;
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
function buildWorld(rd, trip) {
  if (world) { scene.remove(world); worldGeos.forEach(g => g.dispose()); }
  worldGeos = []; world = new THREE.Group(); scene.add(world);
  const own = g => (worldGeos.push(g), g);
  const xs = rd.pts.map(p => p.x), zs = rd.pts.map(p => p.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const sw = Math.max(...xs) - Math.min(...xs) + 600, sh = Math.max(...zs) - Math.min(...zs) + 600;
  const ground = mesh(own(new THREE.PlaneGeometry(sw, sh)), grassMat, false);
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, 0, cz); grassTex.repeat.set(sw / 6, sh / 6);
  world.add(ground, ribbon(rd.pts, ROAD_W / 2 + 1.6, 0.02, dirtMat), ribbon(rd.pts, ROAD_W / 2, 0.05, roadMat));

  const trees = rd.props.filter(p => p.k === 0), rocks = rd.props.filter(p => p.k === 1), houses = rd.props.filter(p => p.k === 2);
  const trunk = new THREE.InstancedMesh(own(new THREE.CylinderGeometry(0.22, 0.32, 2.4, 7)), mat('#8a5a35'), trees.length);
  const crown = new THREE.InstancedMesh(own(new THREE.SphereGeometry(1.5, 14, 10)), crownMat, trees.length * 2);
  trees.forEach((t, i) => {
    const set = (m, j, x, y, z, s) => { dummy.position.set(x, y, z); dummy.rotation.set(0, t.h, 0); dummy.scale.setScalar(s); dummy.updateMatrix(); m.setMatrixAt(j, dummy.matrix); };
    set(trunk, i, t.x, 1.2 * t.s, t.z, t.s);
    set(crown, i * 2, t.x, 3.0 * t.s, t.z, t.s * 1.1);
    set(crown, i * 2 + 1, t.x + 0.6 * t.s, 4.1 * t.s, t.z + 0.3 * t.s, t.s * 0.75);
    crown.setColorAt(i * 2, tmpC.setHSL(0.26 + (t.h % 1) * 0.08, 0.55, 0.4));
    crown.setColorAt(i * 2 + 1, tmpC.setHSL(0.27 + (t.h % 1) * 0.08, 0.6, 0.48));
  });
  const rock = new THREE.InstancedMesh(own(new THREE.DodecahedronGeometry(1, 0)), mat('#a3a8ad', { flatShading: true, roughness: 0.9 }), rocks.length);
  rocks.forEach((t, i) => { dummy.position.set(t.x, 0.3 * t.s, t.z); dummy.rotation.set(0, t.h, 0); dummy.scale.set(t.s * 1.3, t.s * 0.8, t.s); dummy.updateMatrix(); rock.setMatrixAt(i, dummy.matrix); });
  for (const m of [trunk, crown, rock]) { m.castShadow = m.receiveShadow = true; world.add(m); }

  const roofGeo = geo('roof', () => new THREE.ConeGeometry(4.9, 2.4, 4).rotateY(Math.PI / 4));
  for (const p of houses) {
    const h = new THREE.Group(), c = ['#ffd8a8', '#ffc9c9', '#d0ebff', '#d3f9d8', '#fff3bf'][Math.floor(p.h * 10) % 5];
    const add = (m, x, y, z) => { m.position.set(x, y, z); h.add(m); return m; };
    add(mesh(box(6, 3.4, 5), mat(c)), 0, 1.7, 0);
    add(mesh(roofGeo, mat('#d9480f')), 0, 4.6, 0).scale.z = 0.85;
    add(mesh(box(1.1, 2, 0.1), mat('#7a4b2a')), 0, 1, 2.52);
    for (const s of [1, -1]) add(mesh(box(1.1, 1, 0.1), mat('#a5d8ff', { roughness: 0.2 })), 1.9 * s, 2, 2.52);
    h.position.set(p.x, 0, p.z); h.rotation.y = p.h; h.scale.setScalar(0.8 + p.s * 0.3);
    world.add(h);
  }
  const WRECK = ['#b5655b', '#6f84c9', '#8f969c', '#c98a4b', '#5d6670'];
  for (const w of rd.wrecks) {
    const car = new THREE.Group();
    const b = mesh(rbox(2.1, 1.1, 4.3, 0.35), mat(WRECK[w.c])); b.position.y = 0.75; car.add(b);
    const top = mesh(rbox(1.8, 0.8, 2.2, 0.3), mat('#3b4252')); top.position.set(0, 1.55, -0.2); car.add(top);
    car.position.set(w.x, 0, w.z); car.rotation.set(0, w.h, (w.c - 2) * 0.05);
    world.add(car);
  }
  // the stop at the end of the road
  const end = rd.pts[rd.n - 1], st = new THREE.Group();
  st.position.set(end.x + Math.sin(end.h) * 6, 0, end.z + Math.cos(end.h) * 6); st.rotation.y = end.h;
  const add = (m, x, y, z) => { m.position.set(x, y, z); st.add(m); return m; };
  add(mesh(box(26, 0.1, 24), mat('#6c727a'), false), 0, 0.06, 0);
  add(mesh(rbox(16, 0.8, 11, 0.3), mat('#ff6b6b')), 0, 5.6, 0);
  add(mesh(box(16.1, 0.25, 11.1), mat('#ffffff')), 0, 5.15, 0);
  for (const [x, z] of [[6, 4], [-6, 4], [6, -4], [-6, -4]]) add(mesh(cyl(0.3, 0.3, 5.2), mat('#ffffff')), x, 2.6, z);
  for (const x of [-2.5, 2.5]) add(mesh(rbox(1, 1.6, 0.8, 0.15), mat('#ffd43b')), x, 0.8, 0);
  add(mesh(cyl(0.2, 0.2, 7), mat('#ffffff')), 9, 3.5, 7);
  const sign = add(mesh(box(4.4, 2.2, 0.3), mat('#ffd43b')), 9, 7.6, 7);
  const signTex = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#e03131'; g.fillRect(0, 0, w, h);
    g.font = '700 64px Fredoka, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    g.fillText(`STOP #${trip}`, w / 2, h / 2 + 4);
  });
  const face = new THREE.Mesh(own(new THREE.PlaneGeometry(4, 1.9)), new THREE.MeshBasicMaterial({ map: signTex }));
  face.position.z = -0.16; face.rotation.y = Math.PI; sign.add(face);
  add(new THREE.Mesh(cyl(3, 3, 80, 24), new THREE.MeshBasicMaterial({ color: '#ffd43b', transparent: true, opacity: 0.16, depthWrite: false })), 0, 40, 0);
  world.add(st);
}

// ======================= effects =======================
const tracerMat = { def: new THREE.MeshBasicMaterial({ color: '#fff3a0' }), rocket: new THREE.MeshBasicMaterial({ color: '#ff922b' }) };
const tracers = [], particles = [], pops = [];
function addTracer(e, fromY) {
  let t = tracers.find(t => t.life <= 0);
  if (!t) { t = { m: new THREE.Mesh(box(1, 1, 1), tracerMat.def) }; scene.add(t.m); tracers.push(t); }
  const a = new THREE.Vector3(e.a[0], fromY, e.a[1]), b = new THREE.Vector3(e.b[0], 1.1, e.b[1]);
  const w = e.w === 'rocket' ? 0.3 : e.w === 'rifle' ? 0.1 : 0.06;
  t.m.material = e.w === 'rocket' ? tracerMat.rocket : tracerMat.def;
  t.m.position.copy(a).add(b).multiplyScalar(0.5); t.m.lookAt(b);
  t.m.scale.set(w, w, a.distanceTo(b)); t.m.visible = true; t.life = e.w === 'rocket' ? 0.12 : 0.06;
}
function burst(x, y, z, n, color, spd, size = 1) {
  for (let i = 0; i < n; i++) {
    let p = particles.find(p => p.life <= 0);
    if (!p) { if (particles.length > 260) return; p = { m: mesh(sphere(0.14), mat(color), false) }; scene.add(p.m); particles.push(p); }
    p.m.material = mat(color); p.m.visible = true; p.m.position.set(x, y, z);
    p.v = [(Math.random() - 0.5) * spd, Math.random() * spd * 0.8 + 2, (Math.random() - 0.5) * spd];
    p.life = 0.5 + Math.random() * 0.4; p.size = size * (0.6 + Math.random() * 0.8);
  }
}
function popup(text, x, z, color) {
  const el = document.createElement('div');
  el.className = 'cash out'; el.textContent = text; if (color) el.style.color = color;
  document.body.appendChild(el);
  pops.push({ el, p: new THREE.Vector3(x, 3, z), t: 0 });
}
let shake = 0;
function feed(msg) {
  const d = document.createElement('div'); d.textContent = msg; $('feed').appendChild(d);
  while ($('feed').children.length > 6) $('feed').firstChild.remove();
  setTimeout(() => d.remove(), 7000);
}

// ======================= audio (synthesized, no files) =======================
let AC = null, engine = null, noiseBuf = null, lastShot = 0;
addEventListener('pointerdown', () => {
  if (AC) return;
  AC = new AudioContext();
  const o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain();
  o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 380; g.gain.value = 0;
  o.connect(f).connect(g).connect(AC.destination); o.start();
  engine = { o, g };
});
function tone(freq, dur, type = 'square', vol = 0.06, to) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(AC.destination); o.start(); o.stop(t + dur);
}
function noise(dur, vol, freq) {
  if (!AC) return;
  noiseBuf ||= (() => { const b = AC.createBuffer(1, AC.sampleRate, AC.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; })();
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), t = AC.currentTime;
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(AC.destination); s.start(); s.stop(t + dur);
}
const SFX = {
  shot: (w, mine) => noise(w === 'rocket' ? 0.5 : w === 'shotgun' ? 0.25 : 0.08, (w === 'rocket' ? 0.5 : 0.2) * (mine ? 1 : 0.5), w === 'rifle' ? 3500 : 1800),
  kill: () => tone(240, 0.15, 'square', 0.05, 80),
  coin: () => { tone(988, 0.08, 'square', 0.04); setTimeout(() => tone(1319, 0.15, 'square', 0.04), 70); },
  crash: () => noise(0.4, 0.6, 500),
  boom: () => noise(0.9, 0.7, 350),
  click: () => tone(700, 0.04, 'triangle', 0.05),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'square', 0.05), i * 90)),
  lose: () => tone(320, 0.45, 'sawtooth', 0.05, 110),
};

// ======================= networking =======================
const PREFIX = 'luckyvan-v1-';
const net = { conns: new Map(), conn: null, code: '' };
let sim = null, myId = 'host', view = null, me = null, pendingEv = [];
const send = m => (sim ? sim.act(myId, m) : net.conn?.open && net.conn.send(m));
const myName = () => ($('name').value.trim() || 'Driver').slice(0, 14);
const tmsg = t => ($('tmsg').textContent = t);

function hostGame(solo) {
  sim = createSim();
  sim.addPlayer(myId, myName());
  if (solo) sim.startTrip(); else openRoom();
}
function openRoom() {
  const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)]).join('');
  const peer = new Peer(PREFIX + code);
  $('lcode').textContent = '…';
  peer.on('open', () => {
    net.code = code;
    $('lcode').textContent = code;
    $('llink').value = `${location.origin}${location.pathname}?room=${code}`;
  });
  peer.on('error', e => (e.type === 'unavailable-id' ? (peer.destroy(), openRoom()) : net.code ? console.warn('peer', e) : ($('lcode').textContent = `offline (${e.type})`)));
  peer.on('disconnected', () => { try { peer.reconnect(); } catch (_) { /* gone for good */ } });
  peer.on('connection', conn => {
    conn.on('data', d => {
      if (d?.t === 'join') {
        if (!sim.addPlayer(conn.peer, String(d.name || 'Friend').slice(0, 14))) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); return; }
        net.conns.set(conn.peer, conn);
        conn.send({ t: 'hello', id: conn.peer });
      } else if (net.conns.has(conn.peer)) sim.act(conn.peer, d);
    });
    const gone = () => { if (net.conns.delete(conn.peer)) sim.removePlayer(conn.peer); };
    conn.on('close', gone); conn.on('error', gone);
  });
}
function joinGame(code) {
  code = code.trim().toUpperCase();
  if (code.length !== 4) return tmsg('Codes are 4 letters');
  tmsg('Connecting…');
  const peer = new Peer();
  let ok = false;
  peer.on('open', () => {
    const conn = peer.connect(PREFIX + code, { reliable: true });
    net.conn = conn;
    conn.on('open', () => { ok = true; conn.send({ t: 'join', name: myName() }); });
    conn.on('data', d => {
      if (d.t === 'hello') myId = d.id;
      else if (d.t === 's') onSnap(d);
      else if (d.t === 'full') tmsg('That van is full (4 max)');
    });
    conn.on('close', () => { view = null; showPhase(null); tmsg('Lost connection to the host'); });
  });
  peer.on('error', e => tmsg(`Couldn't connect (${e.type})`));
  setTimeout(() => { if (!ok) tmsg('No van found with that code'); }, 12000);
}

// ======================= input =======================
const keys = new Set(), mouse = new THREE.Vector2(), aim = new THREE.Vector3(0, 0, 20);
let firing = false;
const typing = e => e.target.tagName === 'INPUT';
addEventListener('keydown', e => {
  if (typing(e)) return;
  keys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
  if (!me) return;
  if (e.code === 'KeyQ') send({ t: 'equip', w: me.owned[(me.owned.indexOf(me.weapon) + 1) % me.owned.length] });
  const d = /^Digit([1-6])$/.exec(e.code);
  if (d && me.owned[d[1] - 1]) send({ t: 'equip', w: me.owned[d[1] - 1] });
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); firing = false; });
canvas.addEventListener('pointermove', e => mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
canvas.addEventListener('pointerdown', e => { if (e.button === 0) firing = true; });
addEventListener('pointerup', () => (firing = false));
canvas.addEventListener('contextmenu', e => e.preventDefault());
const k = c => keys.has(c);
const localInput = () => ({
  t: 'in',
  thr: (k('KeyW') || k('ArrowUp')) - (k('KeyS') || k('ArrowDown')),
  steer: (k('KeyD') || k('ArrowRight')) - (k('KeyA') || k('ArrowLeft')),
  brake: k('Space'), aim: [aim.x, aim.z], fire: firing && view?.ph === 'drive',
});

// ======================= snapshot → scene =======================
const zm = new Map(), pm = new Map(), vd = { x: 0, z: 0, h: 0, spd: 0 };
let lastUp = '';
function onSnap(s) {
  const prev = view?.ph;
  view = s; me = s.ps.find(p => p.id === myId);
  if (s.van && s.seed !== builtSeed) {
    builtSeed = s.seed;
    buildWorld(makeRoad(s.seed, s.rt), s.rt);
    Object.assign(vd, s.van); snapCam = true;
  }
  const up = JSON.stringify(s.up);
  if (up !== lastUp) { lastUp = up; van.looks(s.up); }
  const shooterY = id => (id === s.drv ? 1.9 : 4.0);
  for (const e of s.ev) {
    const mine = e.p === myId;
    if (e.k === 'tr') {
      addTracer(e, shooterY(e.p));
      if (performance.now() - lastShot > 35 || e.w === 'rocket') { lastShot = performance.now(); SFX.shot(e.w, mine); }
    } else if (e.k === 'hit') burst(e.x, 1.4, e.z, 4, '#76c442', 5);
    else if (e.k === 'kill') {
      burst(e.x, 1.2, e.z, e.ram ? 18 : 10, '#76c442', e.ram ? 12 : 7, 1.3);
      SFX.kill();
      if (mine) { popup(`+$${e.cash}`, e.x, e.z); SFX.coin(); }
    } else if (e.k === 'boom') { burst(e.x, 1, e.z, 26, '#ff922b', 14, 2.2); burst(e.x, 1, e.z, 10, '#ffd43b', 8, 2.6); SFX.boom(); shake = Math.max(shake, 0.5); }
    else if (e.k === 'crash') { SFX.crash(); shake = Math.max(shake, 0.6); }
    else if (e.k === 'msg') feed(e.msg);
  }
  // zombies
  const seen = new Set();
  for (const [id, t, x, z, h, y, st] of s.zs) {
    seen.add(id);
    let m = zm.get(id);
    if (!m) { m = zombieMesh(id, t); m.g.position.set(x, y, z); zm.set(id, m); }
    Object.assign(m, { tx: x, tz: z, ty: y, th: h, st });
  }
  for (const [id, m] of zm) if (!seen.has(id)) { scene.remove(m.g); zm.delete(id); }
  // crew on the van
  for (const p of s.ps) {
    let c = pm.get(p.id);
    if (!c || c.color !== p.color) {
      if (c) van.g.remove(c.g);
      const r = lcg(p.id.length * 31 + p.id.charCodeAt(0));
      c = makeGuy({ seed: 3, skin: ['#ffd3b0', '#e8b48a', '#c68d63', '#8d5a3b'][Math.floor(r() * 4)], shirt: playerShirt(p.color), pants: '#c9a26b', hair: ['#3b2a1a', '#e0c068', '#7a3e1d', '#222'][Math.floor(r() * 4)] });
      c.color = p.color;
      c.armR.rotation.x = -Math.PI / 2; c.armL.rotation.set(-1.25, -0.5, 0);
      c.g.scale.setScalar(0.85);
      c.label = label(p.name, p.color); c.label.position.y = 3.3; c.g.add(c.label);
      van.g.add(c.g); pm.set(p.id, c);
    }
    c.p = p;
    let w = p.weapon;
    if (w !== 'pistol' && !(p.ammo[w] > 0)) w = 'pistol';
    if (c.gunKey !== w) { if (c.gun) c.armR.remove(c.gun); c.gun = gunMesh(w); c.armR.add(c.gun); c.gunKey = w; }
  }
  for (const [id, c] of pm) if (!s.ps.some(p => p.id === id)) { van.g.remove(c.g); pm.delete(id); }
  if (s.ph !== prev) showPhase(s.ph);
  if (s.ph === 'drive') updateHud(s);
  else if (s.ph === 'shop') renderShop(s);
  else if (s.ph === 'lobby') renderLobby(s);
  else if (s.ph === 'over') setHTML($('oStats'), `Made it to trip ${s.trip} · ${fmt(s.stats.kills)} zombies splatted`);
}

// ======================= frame =======================
const camPos = new THREE.Vector3(14, 9, -14), camLook = new THREE.Vector3(), ray = new THREE.Raycaster(), aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2);
const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.7, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd43b', transparent: true, opacity: 0.8, depthWrite: false }));
scene.add(aimRing);
let snapCam = true, orbit = 0, last = performance.now(), netT = 0, sendT = 0, clock = 0;
buildWorld(makeRoad(7, 1), 1); // scenery behind the title screen

// The host simulates on a Worker timer: rAF stops in background tabs, and the host alt-tabbing must not freeze everyone.
const ticker = new Worker(URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 16)'])));
let lastTick = performance.now();
ticker.onmessage = () => {
  const now = performance.now(), dt = Math.min(0.05, (now - lastTick) / 1000);
  lastTick = now;
  if (!sim) return;
  sim.act(myId, localInput());
  sim.step(dt);
  const s = sim.snapshot();
  if (net.conns.size) {
    pendingEv.push(...s.ev);
    if ((netT += dt) >= 0.05) {
      netT = 0;
      const out = { ...s, ev: pendingEv };
      for (const c of net.conns.values()) if (c.open) c.send(out);
      pendingEv = [];
    }
  }
  onSnap(s);
};

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; clock += dt;
  if (!sim && net.conn?.open && view && (sendT += dt) >= 1 / 30) { sendT = 0; net.conn.send(localInput()); }
  render(dt);
}

function render(dt) {
  const v = view?.van, smooth = 1 - Math.exp(-dt * (sim ? 30 : 12));
  if (v) {
    vd.x += (v.x - vd.x) * smooth; vd.z += (v.z - vd.z) * smooth; vd.h += angDiff(v.h, vd.h) * smooth; vd.spd = v.spd;
  }
  van.g.position.set(vd.x, 0, vd.z); van.g.rotation.y = vd.h;
  van.spin += (vd.spd * dt) / 0.55;
  van.wheels.forEach(w => (w.rotation.x = van.spin));
  van.ride.rotation.x = Math.sin(clock * 9) * 0.006 * Math.min(1, Math.abs(vd.spd) / 5);
  if (engine) { engine.g.gain.value = view?.ph === 'drive' ? 0.035 : 0; engine.o.frequency.value = 45 + Math.abs(vd.spd) * 5; }

  // camera: chase while driving, slow orbit otherwise
  const f = new THREE.Vector3(Math.sin(vd.h), 0, Math.cos(vd.h)), vp = new THREE.Vector3(vd.x, 0, vd.z);
  let want, look;
  if (view?.ph === 'drive') {
    want = vp.clone().addScaledVector(f, -(13 + Math.abs(vd.spd) * 0.2)).setY(7.5);
    look = vp.clone().addScaledVector(f, 8).setY(1.5);
  } else {
    orbit += dt * 0.15;
    want = vp.clone().add(new THREE.Vector3(Math.sin(orbit) * 17, 10, Math.cos(orbit) * 17));
    look = vp.clone().setY(2);
  }
  const kc = snapCam ? 1 : 1 - Math.exp(-dt * 4);
  camPos.lerp(want, kc); camLook.lerp(look, snapCam ? 1 : 1 - Math.exp(-dt * 6)); snapCam = false;
  shake = Math.max(0, shake - dt * 1.5);
  camera.position.copy(camPos).add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
  camera.lookAt(camLook);
  sun.position.set(vd.x + 30, 55, vd.z + 20); sun.target.position.set(vd.x, 0, vd.z);

  // aim point = mouse ray on a plane at zombie chest height
  ray.setFromCamera(mouse, camera);
  if (!ray.ray.intersectPlane(aimPlane, aim) || aim.distanceTo(vp) > 80) aim.copy(ray.ray.direction).setY(0).normalize().multiplyScalar(60).add(vp);
  aimRing.position.set(aim.x, 0.08, aim.z);
  aimRing.visible = view?.ph === 'drive';
  if (me) aimRing.material.color.set(me.color);

  // crew
  for (const c of pm.values()) {
    const seat = SEATS[c.p.seat] || SEATS[3], driver = c.p.seat === 0;
    c.body.visible = !driver; // the driver sits inside the cab; only their name tag shows
    c.g.position.set(seat[0], driver ? 1.6 : 2.62 + van.ride.position.y, seat[1]);
    const [wx, wz] = toWorld(vd, seat[0], seat[1]);
    const a = c.p.id === myId ? [aim.x, aim.z] : c.p.aim;
    c.g.rotation.y = driver ? 0 : Math.atan2(a[0] - wx, a[1] - wz) - vd.h;
    c.body.position.y = Math.abs(Math.sin(clock * 6 + c.ph)) * 0.04;
  }

  // zombies
  const kz = 1 - Math.exp(-dt * (sim ? 30 : 14));
  for (const z of zm.values()) {
    const p = z.g.position, ox = p.x, oz = p.z;
    p.x += (z.tx - p.x) * kz; p.z += (z.tz - p.z) * kz; p.y += (z.ty - p.y) * kz;
    if (z.st === 1) { // dead: tumble, then lie flat
      if (p.y > 0.05) z.spin += dt * 12; else z.spin += (-Math.PI / 2 - (z.spin % (Math.PI * 2))) * Math.min(1, dt * 8);
      z.body.rotation.x = z.spin;
      continue;
    }
    z.g.rotation.y += angDiff(z.th, z.g.rotation.y) * Math.min(1, dt * 10);
    const spd = Math.hypot(p.x - ox, p.z - oz) / Math.max(dt, 1e-3);
    z.ph += dt * (3 + spd * 2.2);
    const sw = Math.sin(z.ph) * Math.min(0.8, spd * 0.25);
    z.legL.rotation.x = sw; z.legR.rotation.x = -sw;
    const flail = z.st === 2 ? Math.sin(clock * 14 + z.ph) * 0.5 : Math.sin(z.ph) * 0.1;
    z.armL.rotation.x = -1.45 + flail; z.armR.rotation.x = -1.35 - flail;
  }

  for (const t of tracers) if (t.life > 0 && (t.life -= dt) <= 0) t.m.visible = false;
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt; p.v[1] -= 20 * dt;
    p.m.position.x += p.v[0] * dt; p.m.position.y = Math.max(0.1, p.m.position.y + p.v[1] * dt); p.m.position.z += p.v[2] * dt;
    p.m.scale.setScalar(Math.max(0, p.life) * p.size * 1.6);
    if (p.life <= 0) p.m.visible = false;
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const q = pops[i];
    q.t += dt; q.p.y += dt * 2.5;
    const sp = q.p.clone().project(camera);
    q.el.style.left = `${(sp.x * 0.5 + 0.5) * innerWidth}px`; q.el.style.top = `${(-sp.y * 0.5 + 0.5) * innerHeight}px`;
    q.el.style.opacity = 1 - q.t;
    if (q.t > 1) { q.el.remove(); pops.splice(i, 1); }
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
if (location.hostname === 'localhost') window.lv = { get sim() { return sim; }, get view() { return view; }, zm, camera };

// ======================= UI =======================
function showPhase(ph) {
  $('title').classList.toggle('hidden', !!ph);
  $('lobby').classList.toggle('hidden', ph !== 'lobby');
  $('hud').classList.toggle('hidden', ph !== 'drive');
  $('shop').classList.toggle('hidden', ph !== 'shop');
  $('over').classList.toggle('hidden', ph !== 'over');
  $('bAgain').classList.toggle('hidden', !sim); $('oWait').classList.toggle('hidden', !!sim);
  if (ph === 'shop') { $('rlTotal').textContent = ''; renderRoul(); }
  firing = false;
}
function renderLobby(s) {
  setHTML($('lplayers'), s.ps.map(p => `<div class="pl"><span class="dot" style="background:${p.color}"></span><b>${esc(p.name)}</b>${p.id === myId ? ' (you)' : ''}</div>`).join(''));
  $('bStart').classList.toggle('hidden', !sim); $('lwait').classList.toggle('hidden', !!sim);
}
const effWeapon = p => (p.weapon !== 'pistol' && !(p.ammo[p.weapon] > 0) ? 'pistol' : p.weapon);
function crewHTML(s) {
  return s.ps.map(p => `<div class="pl"><span class="dot" style="background:${p.color}"></span><b style="flex:1">${esc(p.name)}</b>${p.id === s.drv ? '<small>DRIVER</small> ' : ''}<span class="money">$${fmt(p.money)}</span></div>`).join('');
}
function updateHud(s) {
  const v = s.van, hp = v.hp / v.maxHp;
  setHTML($('htrip'), `TRIP ${s.rt} → STOP #${s.rt}`);
  $('hprog').style.width = `${(v.i / (v.n - 1)) * 100}%`;
  setHTML($('hdist'), `${fmt(Math.max(0, (v.n - 1 - v.i) * STEP))} m to go`);
  $('hhp').style.width = `${hp * 100}%`;
  $('hhp').style.background = hp < 0.3 ? 'var(--red)' : hp < 0.6 ? 'var(--sun)' : 'var(--green)';
  setHTML($('hhpt'), `HULL ${fmt(v.hp)} / ${fmt(v.maxHp)}`);
  setHTML($('hspd'), `${Math.round(Math.abs(v.spd) * 3.6)} <small>km/h</small>${v.off ? ' <span id="offroad">OFF-ROAD</span>' : ''}`);
  setHTML($('crew'), crewHTML(s));
  if (!me) return;
  const w = effWeapon(me);
  setHTML($('gunbox'), `<b>${WEAPONS[w].name}</b>${w === 'pistol' ? '∞' : fmt(me.ammo[w])} ammo · Q / 1–${me.owned.length} swap${me.weapon !== w ? '<br><span style="color:var(--red)">OUT OF AMMO</span>' : ''}`);
  setHTML($('role'), s.drv === myId ? 'YOU\'RE DRIVING · WASD steer · Space brake · mouse to shoot' : 'ON THE ROOF · aim with the mouse · hold click to shoot');
}

// ---------- shop ----------
let rlBets = {}, lastRoul = 0, lastBj = '', lastCr = '';
const RANK = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const cardHTML = (c, i, hidden) => {
  if (hidden) return '<div class="pc back"></div>';
  const suit = '♠♥♦♣'[(c + i * 3) % 4];
  return `<div class="pc ${suit === '♥' || suit === '♦' ? 'r' : ''}">${RANK[c] || c}<span>${suit}</span></div>`;
};
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieHTML = d => `<div class="die roll">${Array.from({ length: 9 }, (_, i) => (PIPS[d].includes(i) ? '<i></i>' : '<span></span>')).join('')}</div>`;
const netText = s => { const n = s.ret - s.bet; return n > 0 ? `+$${fmt(n)}` : n < 0 ? `-$${fmt(-n)}` : '$0'; };

function renderShop(s) {
  if (!me) return;
  setHTML($('sTitle'), `PIT STOP · next up: trip ${s.trip}`);
  setHTML($('sMoney'), `$${fmt(me.money)}`);
  const ready = s.ps.filter(p => p.ready).length;
  setHTML($('bReady'), `${me.ready ? 'READY ✓' : 'READY UP'} (${ready}/${s.ps.length})`);
  $('bReady').className = `btn big ${me.ready ? 'green' : ''}`;

  setHTML($('sGarage'), Object.entries(UPGRADES).map(([k, U]) => {
    const lvl = s.up[k], pips = Array.from({ length: MAX_LVL }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    if (lvl >= MAX_LVL) return `<div class="card"><div class="row"><h3 style="flex:1">${U.name}</h3><div class="pips">${pips}</div></div><div class="desc">${U.desc}</div><div class="owned">MAXED OUT</div></div>`;
    const price = upPrice(k, lvl), f = s.fund[k], need = price - f;
    return `<div class="card"><div class="row"><h3 style="flex:1">${U.name}</h3><div class="pips">${pips}</div></div><div class="desc">${U.desc}</div>
      <div class="bar"><i style="width:${(f / price) * 100}%"></i><span>$${fmt(f)} / $${fmt(price)}</span></div>
      <div class="btns">${[25, 100, 500].map(a => `<button class="btn sm blue" data-a="fund" data-k="${k}" data-amt="${a}" ${me.money < 1 ? 'disabled' : ''}>+$${a}</button>`).join('')}
      <button class="btn sm green" data-a="fund" data-k="${k}" data-amt="${need}" ${me.money < need ? 'disabled' : ''}>FINISH $${fmt(need)}</button></div></div>`;
  }).join(''));

  setHTML($('sArmory'), Object.entries(WEAPONS).map(([w, W]) => {
    const own = me.owned.includes(w);
    const stats = `<div class="stat">${W.dmg}${W.pellets > 1 ? `×${W.pellets}` : ''} dmg · ${W.rate}/s${W.pierce > 1 ? ` · pierces ${W.pierce}` : ''}${W.splash ? ' · explodes' : ''}</div>`;
    const btns = !own
      ? `<button class="btn sm" data-a="buy" data-w="${w}" ${me.money < W.price ? 'disabled' : ''}>BUY $${fmt(W.price)}</button>`
      : `${me.weapon === w ? '<span class="owned">EQUIPPED</span>' : `<button class="btn sm blue" data-a="equip" data-w="${w}">EQUIP</button>`}
         ${W.pack ? `<span class="stat">${fmt(me.ammo[w] || 0)} ammo</span><button class="btn sm green" data-a="ammo" data-w="${w}" ${me.money < W.packPrice ? 'disabled' : ''}>+${W.pack} for $${W.packPrice}</button>` : '<span class="stat">∞ ammo</span>'}`;
    return `<div class="card"><h3>${W.name}</h3>${stats}<div class="btns" style="align-items:center">${btns}</div></div>`;
  }).join(''));

  setHTML($('sCrew'), s.ps.map(p => `<div class="card"><div class="row"><span class="dot" style="background:${p.color}"></span><h3 style="flex:1;margin:0">${esc(p.name)}${p.id === myId ? ' (you)' : ''}</h3>${p.ready ? '<span class="owned">READY</span>' : ''}</div>
    <div class="stat">${p.id === s.drv ? 'DRIVER' : 'GUNNER'} · ${fmt(p.kills)} kills · <span class="money">$${fmt(p.money)}</span> · ${WEAPONS[p.weapon].name}</div>
    <div class="btns">${p.id === myId
      ? (p.id === s.drv ? '<span class="stat">You have the wheel</span>' : '<button class="btn sm" data-a="drive">TAKE THE WHEEL</button>')
      : [50, 250, 1000].map(a => `<button class="btn sm blue" data-a="gift" data-to="${esc(p.id)}" data-amt="${a}" ${me.money < a ? 'disabled' : ''}>GIVE $${a}</button>`).join('')}</div></div>`).join(''));

  // blackjack
  const bj = me.bj;
  setHTML($('bjT'), bj ? `<div class="lbl">DEALER ${bj.done ? handValue(bj.d) : ''}</div><div class="hand">${bj.d.map((c, i) => cardHTML(c, i, !bj.done && i === 1)).join('')}</div>
    <div class="lbl">YOU ${handValue(bj.p)} · bet $${fmt(bj.bet)}</div><div class="hand">${bj.p.map((c, i) => cardHTML(c, i + 2)).join('')}</div>
    <div class="result">${bj.done ? `${bj.msg} ${netText(bj)}` : ''}</div>` : '<div class="result" style="margin-top:80px">Dealer stands on 17 · Blackjack pays 3:2</div>');
  setHTML($('bjBtns'), bj && !bj.done
    ? `<button class="btn sm green" data-a="bj" data-x="hit">HIT</button> <button class="btn sm red" data-a="bj" data-x="stand">STAND</button> ${bj.p.length === 2 && me.money >= bj.bet ? '<button class="btn sm" data-a="bj" data-x="double">DOUBLE</button>' : ''}`
    : '<button class="btn sm green" data-a="bj" data-x="deal">DEAL</button> <button class="btn sm ghost" data-a="allin" data-for="bjBet">ALL IN</button>');
  const bjSig = JSON.stringify(bj);
  if (bjSig !== lastBj) { if (bj?.done && lastBj) (bj.ret > bj.bet ? SFX.win : bj.ret < bj.bet ? SFX.lose : SFX.click)(); lastBj = bjSig; }

  // craps
  const cr = me.craps, crLive = cr && !cr.done;
  setHTML($('crT'), `<div class="dice">${cr?.dice ? cr.dice.map(dieHTML).join('') : '<span class="lbl">7 or 11 wins · 2, 3, 12 loses · anything else sets the point</span>'}</div>
    <div class="puck">${crLive ? `POINT: ${cr.point}` : 'POINT: OFF'}</div>
    <div class="result">${cr ? `${cr.msg}${cr.done ? ` ${netText(cr)}` : ''}` : ''}</div>`);
  setHTML($('crBtns'), crLive
    ? `<span class="lbl">bet $${fmt(cr.bet)}</span> <button class="btn sm green" data-a="craps" data-x="roll">ROLL</button>`
    : '<button class="btn sm green" data-a="craps" data-x="bet">BET & ROLL</button> <button class="btn sm ghost" data-a="allin" data-for="crBet">ALL IN</button>');
  const crSig = JSON.stringify(cr);
  if (crSig !== lastCr) { if (cr?.done && lastCr) (cr.ret > cr.bet ? SFX.win : SFX.lose)(); else if (cr) SFX.click(); lastCr = crSig; }

  // roulette result (animated spin)
  if (me.roul && me.roul.id !== lastRoul) {
    lastRoul = me.roul.id;
    const r = me.roul; let t = 0;
    const tick = setInterval(() => {
      const done = ++t >= 16, n = done ? r.n : Math.floor(Math.random() * 37);
      setWheel(n, done ? `${n} ${n === 0 ? 'GREEN' : RED.has(n) ? 'RED' : 'BLACK'} · ${netText(r)}` : '');
      if (done) { clearInterval(tick); (r.ret > r.bet ? SFX.win : SFX.lose)(); } else SFX.click();
    }, 70 + t * 6);
  }
}
function setWheel(n, text) {
  $('rlT').innerHTML = `<div class="wheel ${n === 0 ? 'g' : RED.has(n) ? 'r' : ''}">${n}</div><div class="result">${text}</div>`;
}
function renderRoul() {
  const chip = key => (rlBets[key] ? `<b>${fmt(rlBets[key])}</b>` : '');
  let h = `<button class="g" style="grid-column:1;grid-row:1/4" data-a="rbet" data-k="n" data-n="0">0${chip('n0')}</button>`;
  for (let n = 1; n <= 36; n++) {
    h += `<button class="${RED.has(n) ? 'r' : 'k'}" style="grid-column:${Math.ceil(n / 3) + 1};grid-row:${3 - ((n - 1) % 3)}" data-a="rbet" data-k="n" data-n="${n}">${n}${chip('n' + n)}</button>`;
  }
  $('rlGrid').innerHTML = h;
  $('rlOut').innerHTML = [['red', 'RED'], ['black', 'BLACK'], ['odd', 'ODD'], ['even', 'EVEN'], ['low', '1–18'], ['high', '19–36'], ['d1', '1st 12'], ['d2', '2nd 12'], ['d3', '3rd 12']]
    .map(([k, t]) => `<button data-a="rbet" data-k="${k}">${t}${chip(k)}</button>`).join('');
  const total = Object.values(rlBets).reduce((a, b) => a + b, 0);
  $('rlTotal').textContent = total ? `on the table: $${fmt(total)}` : '';
  if (!$('rlT').innerHTML) $('rlT').innerHTML = '<div class="wheel">?</div><div class="result">Click the felt to place chips</div>';
}

$('shop').addEventListener('click', e => {
  const b = e.target.closest('[data-a],[data-tab]');
  if (!b || b.disabled) return;
  const d = b.dataset;
  SFX.click();
  if (d.tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t === b));
    document.querySelectorAll('.pane').forEach(p => p.classList.toggle('hidden', p.id !== `p-${d.tab}`));
    return;
  }
  switch (d.a) {
    case 'fund': send({ t: 'fund', k: d.k, amt: +d.amt }); break;
    case 'buy': case 'ammo': case 'equip': send({ t: d.a, w: d.w }); break;
    case 'gift': send({ t: 'gift', to: d.to, amt: +d.amt }); break;
    case 'drive': send({ t: 'drive' }); break;
    case 'bj': send({ t: 'bj', a: d.x, bet: +$('bjBet').value }); break;
    case 'craps': send({ t: 'craps', a: d.x, bet: +$('crBet').value }); break;
    case 'allin': $(d.for).value = me?.money || 0; break;
    case 'rbet': {
      const key = d.k === 'n' ? `n${d.n}` : d.k;
      rlBets[key] = (rlBets[key] || 0) + Math.max(1, Math.floor(+$('rlChip').value || 0));
      renderRoul(); break;
    }
    case 'rclear': rlBets = {}; renderRoul(); break;
    case 'spin': {
      const bets = Object.entries(rlBets).map(([key, amt]) => (key[0] === 'n' ? { k: 'n', n: +key.slice(1), amt } : { k: key, amt }));
      if (!bets.length) break;
      if (bets.reduce((a, b) => a + b.amt, 0) > (me?.money || 0)) { feed('Not enough cash for those chips'); break; }
      send({ t: 'roul', bets }); rlBets = {}; renderRoul(); break;
    }
  }
});
$('bReady').onclick = () => send({ t: 'ready' });

// ---------- title / lobby / over ----------
try { $('name').value = localStorage.getItem('luckyvan.name') || ''; } catch (_) { /* storage blocked */ }
const saveName = () => { try { localStorage.setItem('luckyvan.name', myName()); } catch (_) { /* storage blocked */ } };
const room = new URLSearchParams(location.search).get('room');
if (room) $('code').value = room;
$('bSolo').onclick = () => { saveName(); hostGame(true); };
$('bHost').onclick = () => { saveName(); hostGame(false); };
$('bJoin').onclick = () => { saveName(); joinGame($('code').value); };
$('code').addEventListener('keydown', e => e.key === 'Enter' && $('bJoin').click());
$('bStart').onclick = () => sim?.startTrip();
$('bAgain').onclick = () => sim?.restart();
$('bCopy').onclick = () => { navigator.clipboard?.writeText($('llink').value); $('bCopy').textContent = 'COPIED'; };
