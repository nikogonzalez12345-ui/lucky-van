// world.js — the trip: an abandoned, overgrown highway under misty mountains.
// Real CC0 textures/props (Poly Haven) dressed onto procedural layout from sim.js's makeRoad.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lcg, canvasTex, geo, box, cyl, mat, mesh } from './art.js';
import { A, pbr, rustyPaint } from './assets.js';
import { ROAD_W, STEP } from './sim.js';

const HAZE = '#b7bbb4';
let hemi = null;

export function setupAtmosphere(scene, renderer) {
  renderer.toneMappingExposure = 0.95;
  scene.background = new THREE.Color(HAZE);
  scene.fog = new THREE.Fog(HAZE, 40, 330);
  hemi = new THREE.HemisphereLight('#e2e8ea', '#4a5434', 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d6', 2.0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  return sun;
}
// overcast HDRI sky for the background and for image-based lighting
export function applySky(scene, renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromEquirectangular(A.hdr).texture;
  scene.background = A.hdr;
  hemi.intensity = 0.35;
}

// ---------- canvas textures that still make sense to draw ----------
const noiseDots = (g, w, h, r, n, cols, size) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r())); } };
const markingsTex = canvasTex(256, 1024, (g, w, h) => { // faded paint over the asphalt: 12 m wide × 24 m long, transparent elsewhere
  const r = lcg(21);
  g.globalAlpha = 0.75;
  g.fillStyle = '#b9993f'; for (let y = 0; y < h; y += 4) if (r() < 0.85) g.fillRect(12, y, 6, 4);
  g.fillStyle = '#c9c6b8'; for (let y = 0; y < h; y += 4) if (r() < 0.8) g.fillRect(w - 19, y, 5, 4);
  for (const y0 of [60, 572]) for (let y = y0; y < y0 + 128; y += 4) if (r() < 0.75) g.fillRect(w / 2 - 3, y, 6, 4);
  g.globalAlpha = 1;
  for (let c = 0; c < 22; c++) { // cracks with moss in them
    let x = r() * w, y = r() * h, a = r() * 6.28;
    g.strokeStyle = 'rgba(20,22,20,0.8)'; g.lineWidth = 1 + r() * 1.5; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 16 + r() * 26; s++) {
      a += (r() - 0.5) * 1.2; x += Math.cos(a) * 7; y += Math.sin(a) * 7; g.lineTo(x, y);
      if (r() < 0.4) { g.fillStyle = r() < 0.5 ? 'rgba(80,105,45,.9)' : 'rgba(110,125,60,.9)'; g.fillRect(x - 2, y - 2, 2 + r() * 4, 2 + r() * 4); }
    }
    g.stroke();
  }
  for (const x0 of [0, w]) for (let y = 0; y < h; y += 6) { // grass creeping in from the edges
    const reach = 3 + Math.abs(Math.sin(y * 0.013) * 16) + r() * 8;
    g.fillStyle = r() < 0.5 ? 'rgba(70,92,40,.95)' : 'rgba(95,112,52,.95)'; g.fillRect(x0 ? w - reach : 0, y, reach, 7);
  }
}, true);
const bladeTex = canvasTex(128, 128, (g, w, h) => {
  const r = lcg(13);
  for (let i = 0; i < 52; i++) {
    const x = 10 + r() * 108, top = 6 + r() * 70, lean = (r() - 0.5) * 40;
    g.strokeStyle = ['#56722e', '#6f8a3a', '#85994a', '#4a6328', '#a39f62', '#8b8450'][Math.floor(r() * 6)];
    g.lineWidth = 1.5 + r() * 2.5; g.beginPath(); g.moveTo(x, h); g.quadraticCurveTo(x + lean * 0.3, (h + top) / 2, x + lean, top); g.stroke();
  }
});
const signTex = (lines, bg = '#2f6b45') => canvasTex(512, 220, (g, w, h) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#e8eee6'; g.lineWidth = 8; g.strokeRect(12, 12, w - 24, h - 24);
  g.fillStyle = '#e8eee6'; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach(([t, size, y]) => { g.font = `700 ${size}px Arial, sans-serif`; g.fillText(t, w / 2, y); });
  noiseDots(g, w, h, lcg(lines.length * 7 + 1), 600, ['rgba(60,50,30,.3)', 'rgba(255,255,255,.08)', 'rgba(110,70,40,.4)'], 4);
});
const ADS = [['SUNNY COLA', '#a8322a', 'ice cold since 1962'], ['BIG JIM\'S AUTO', '#b48a17', 'we finance anyone'], ['VISIT LAKEVIEW', '#2e6e8b', 'the friendliest town']];
let facadeMats = null, adMats = null;
function lazyMats() { // built after assets load: real concrete photographed under painted window grids
  if (facadeMats) return;
  const concrete = A.tex.concrete_wall_008;
  facadeMats = ['#d9d2c4', '#c4c0b6', '#d6c7aa', '#b5b0a5'].map((tint, i) => {
    const t = canvasTex(512, 512, (g, w, h) => {
      const r = lcg(31 + i);
      g.drawImage(concrete.map.image, 0, 0, w, h);
      g.fillStyle = tint; g.globalCompositeOperation = 'multiply'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
      for (let fy = 0; fy < 4; fy++) {
        g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, fy * 128 + 116, w, 10);
        for (let fx = 0; fx < 4; fx++) {
          const x = fx * 128 + 28, y = fy * 128 + 26, broken = r() < 0.4;
          g.fillStyle = 'rgba(40,38,34,.5)'; g.fillRect(x - 5, y - 5, 82, 76);
          g.fillStyle = broken ? '#090a0b' : ['#29323a', '#333e46', '#1f262b'][Math.floor(r() * 3)]; g.fillRect(x, y, 72, 66);
          if (!broken && r() < 0.5) { g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(x + 8, y + 6, 18, 54); }
        }
      }
      for (let k = 0; k < 14; k++) { g.fillStyle = 'rgba(30,25,15,.22)'; g.fillRect(r() * w, r() * 120, 3 + r() * 10, 120 + r() * 380); }
      for (let v = 0; v < 6; v++) { // ivy
        const x = r() * w, fromTop = r() < 0.35;
        for (let k = 0; k < 220; k++) {
          const y = fromTop ? r() * r() * 300 : h - r() * r() * 440;
          g.fillStyle = ['#2f4a1c', '#3f5a24', '#4b6a2a', '#263d17'][k % 4];
          g.beginPath(); g.arc(x + (r() - 0.5) * 110, y, 3 + r() * 7, 0, 7); g.fill();
        }
      }
    }, true);
    return new THREE.MeshStandardMaterial({ map: t, normalMap: concrete.normalMap, roughness: 0.95 });
  });
  adMats = ADS.map(([t, c, sub], i) => new THREE.MeshStandardMaterial({ roughness: 0.9, map: canvasTex(512, 256, (g, w, h) => {
    const r = lcg(60 + i);
    g.fillStyle = c; g.fillRect(0, 0, w, h);
    g.fillStyle = '#efe8d6'; g.textAlign = 'center'; g.font = '700 70px Arial, sans-serif'; g.fillText(t, w / 2, 120);
    g.font = '600 34px Arial, sans-serif'; g.fillText(sub, w / 2, 185);
    for (let k = 0; k < 9; k++) { g.fillStyle = '#cfc8b4'; g.fillRect(r() * w, r() * h, 30 + r() * 90, 20 + r() * 60); }
    noiseDots(g, w, h, r, 2500, ['rgba(0,0,0,.25)', 'rgba(255,255,255,.08)', 'rgba(90,60,30,.3)'], 4);
  }) }));
}

const leafMat = () => {
  const m = new THREE.MeshStandardMaterial({ ...A.tex.leaves, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
  m.onBeforeCompile = sh => { // dither leaves away near the camera so the chase cam never ends up inside a crown
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `void main() {
      float lvNear = smoothstep(4.0, 8.0, length(vViewPosition));
      if (lvNear < fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453)) discard;`);
  };
  return m;
};
const grassMat = new THREE.MeshStandardMaterial({ map: bladeTex, alphaTest: 0.45, roughness: 1 });
// a leaf card cut from the twig region of Poly Haven's tree_small_02 leaf atlas
const cardGeo = (() => {
  const g = new THREE.PlaneGeometry(1.3, 1.85), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.4 + uv.getX(i) * 0.46, 0.32 + uv.getY(i) * 0.65);
  return g;
})();
const tuftGeo = (() => { // three crossed cards, doubled back-to-back so the normals all point up
  const a = new THREE.PlaneGeometry(1.2, 0.9).translate(0, 0.45, 0);
  const g = mergeGeometries([0, 1, 2].flatMap(i => [a.clone().rotateY((i * Math.PI) / 3), a.clone().rotateY((i * Math.PI) / 3 + Math.PI)])), n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  return g;
})();
const trunkGeo = new THREE.CylinderGeometry(0.16, 0.32, 1, 9, 1, true).translate(0, 0.5, 0);

// ---------- builders ----------
let world = null, worldGeos = [], crows = null;
const crowCenter = new THREE.Vector3(), dummy = new THREE.Object3D(), tmpC = new THREE.Color(), tmpM = new THREE.Matrix4();

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
    const haze = new THREE.Color(HAZE), rk = new THREE.Color(rock), snow = new THREE.Color('#dde2e3');
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const n = 0.5 + 0.28 * Math.sin(a * 3 + ph[0]) + 0.2 * Math.sin(a * 7 + ph[1]) + 0.12 * Math.abs(Math.sin(a * 13 + ph[2])) + 0.1 * Math.abs(Math.sin(a * 31 + ph[3])) + 0.05 * Math.abs(Math.sin(a * 67 + ph[0])) - 0.12;
      const top = base + amp * Math.max(0, n) ** 1.6, sx = Math.sin(a), sz = Math.cos(a);
      for (const [f, y] of [[1, -30], [1.01, top * 0.55], [1.02, top]]) pos.push(sx * R * f, y, sz * R * f);
      col.push(...haze.toArray(), 0, ...haze.clone().lerp(rk, 0.6).toArray(), 0.75, ...(top > base + amp * 0.55 ? snow : rk).toArray(), 0.95);
      if (i) { const b = (i - 1) * 3; idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4, b + 1, b + 4, b + 2, b + 2, b + 4, b + 5); }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); // alpha fades the foot of the range into the haze
    geom.setIndex(idx); worldGeos.push(geom);
    return new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, transparent: true, depthWrite: false }));
  };
  g.add(range(900, 140, 360, '#7d878a', 1), range(620, 50, 170, '#4f5c55', 2));
  g.position.set(cx, 0, cz);
  return g;
}

// instance every mesh of a loaded prop; place(item) sets `dummy` for each item
function instProp(name, list, place, shadows = true) {
  const out = [], src = A.props[name];
  src.updateMatrixWorld(true);
  src.traverse(m => {
    if (!m.isMesh || !list.length) return;
    const im = new THREE.InstancedMesh(m.geometry, m.material, list.length);
    list.forEach((it, i) => { place(it, i); dummy.updateMatrix(); im.setMatrixAt(i, tmpM.multiplyMatrices(dummy.matrix, m.matrixWorld)); });
    im.castShadow = shadows; im.receiveShadow = true;
    im.computeBoundingSphere();
    out.push(im);
  });
  return out;
}
const placeAt = (x, y, z, s, ry = 0, rz = 0) => { dummy.position.set(x, y, z); dummy.rotation.set(0, ry, rz); dummy.scale.setScalar(s); };

let wreckPaint = null;
function wreckMesh(w) {
  wreckPaint ||= ['#6d7880', '#7a4f42', '#8f876c', '#56614f', '#878a8c'].map((c, i) => rustyPaint(c, 0.75 + i * 0.04));
  const car = new THREE.Group(), paint = wreckPaint[w.c], glass = mat('#1a1f22', { roughness: 0.25, metalness: 0.3 }), tire = mat('#1d1d1d', { roughness: 1 });
  const add = (m, x, y, z) => { m.position.set(x, y, z); car.add(m); return m; };
  if (w.m === 2) { // city bus
    add(mesh(geo('busBody', () => new THREE.BoxGeometry(2.6, 2.7, 10)), paint), 0, 1.6, 0);
    for (const s of [1, -1]) add(mesh(box(0.06, 0.9, 8.2), glass), 1.31 * s, 2.2, 0.2);
    add(mesh(box(2.3, 1.1, 0.06), glass), 0, 2.1, 5.01);
    for (const z of [3.4, -3.4]) for (const s of [1, -1]) add(mesh(cyl(0.5, 0.5, 0.35, 12), tire), 1.15 * s, 0.4, z).rotation.z = Math.PI / 2;
  } else {
    const tall = w.m === 1;
    add(mesh(geo(`carBody${tall}`, () => new THREE.BoxGeometry(2.0, tall ? 1.0 : 0.75, tall ? 4.6 : 4.4)), paint), 0, tall ? 0.85 : 0.68, 0);
    const cab = add(mesh(geo(`carCab${tall}`, () => new THREE.BoxGeometry(1.8, tall ? 0.85 : 0.68, tall ? 2.9 : 2.2)), paint), 0, tall ? 1.75 : 1.35, tall ? -0.5 : -0.2);
    const win = mesh(box(1.84, tall ? 0.5 : 0.42, tall ? 2.5 : 1.8), glass, false); win.position.y = 0.05; cab.add(win);
    for (const z of [1.4, -1.4]) for (const s of [1, -1]) { const t = add(mesh(cyl(0.38, 0.38, 0.3, 12), tire), 0.95 * s, 0.3, z); t.rotation.z = Math.PI / 2; t.scale.set(1, 1, 0.75); }
  }
  car.position.set(w.x, -0.08, w.z); car.rotation.set(0, w.h, (w.c - 2) * 0.03);
  return car;
}

function building(p) {
  const g = new THREE.BoxGeometry(p.w, p.ht, p.d), uv = g.attributes.uv;
  const dims = [[p.d, p.ht], [p.d, p.ht], [p.w, p.d], [p.w, p.d], [p.w, p.ht], [p.w, p.ht]];
  for (let i = 0; i < uv.count; i++) { const [fw, fh] = dims[Math.floor(i / 4)]; uv.setXY(i, (uv.getX(i) * fw) / 12, (uv.getY(i) * fh) / 12); }
  worldGeos.push(g);
  const roof = mat('#57554e', { roughness: 1 }), facade = facadeMats[Math.floor(p.s * 10) % facadeMats.length];
  const b = new THREE.Group(), body = mesh(g, [facade, facade, roof, roof, facade, facade]);
  body.position.y = p.ht / 2; b.add(body);
  const r = lcg((Math.floor(p.x * 13 + p.z * 7) & 0xffff) || 1);
  const ac = mesh(box(2.2, 1.2, 1.6), rustyPaint('#8d8b84', 0.6)); ac.position.set((r() - 0.5) * p.w * 0.5, p.ht + 0.6, (r() - 0.5) * p.d * 0.5); b.add(ac);
  if (r() < 0.35) { // rooftop billboard
    const bb = new THREE.Group(); bb.position.y = p.ht;
    for (const x of [-2.5, 2.5]) { const leg = mesh(box(0.25, 4, 0.25), rustyPaint('#4a4a46', 0.8)); leg.position.set(x, 2, 0); bb.add(leg); }
    const board = mesh(box(8, 4, 0.3), mat('#3a3a36')); board.position.y = 5.5; bb.add(board);
    const face = new THREE.Mesh(geo('ad', () => new THREE.PlaneGeometry(7.6, 3.6)), adMats[Math.floor(r() * adMats.length)]); face.position.set(0, 5.5, 0.16); bb.add(face);
    bb.rotation.y = Math.PI; b.add(bb);
  }
  b.position.set(p.x, -0.1, p.z); b.rotation.y = p.h;
  return b;
}

function gantry(p, trip, mi) {
  const g = new THREE.Group(), steel = rustyPaint('#7c7f7b', 0.5);
  for (const s of [1, -1]) { const leg = mesh(cyl(0.18, 0.22, 7.5, 8), steel); leg.position.set(s * (ROAD_W / 2 + 1.8), 3.75, 0); g.add(leg); }
  const truss = mesh(box(ROAD_W + 4.4, 0.5, 0.5), steel); truss.position.y = 7.4; g.add(truss);
  const board = mesh(box(6, 2.6, 0.2), mat('#2f6b45')); board.position.set(-1.5, 8.9, 0); board.rotation.z = 0.02; g.add(board);
  const face = new THREE.Mesh(geo('gantryFace', () => new THREE.PlaneGeometry(5.8, 2.5)), new THREE.MeshStandardMaterial({ roughness: 0.8, map: signTex([['NORTH', 54, 62], [`STOP #${trip}`, 70, 128], [`${mi} MI`, 44, 188]]) }));
  face.position.z = -0.11; face.rotation.y = Math.PI; board.add(face);
  g.position.set(p.x, 0, p.z); g.rotation.y = p.h;
  return g;
}

function instanced(geom, material, list, place, colorFn, shadows = true) {
  const m = new THREE.InstancedMesh(geom, material, Math.max(1, list.length));
  m.count = list.length;
  list.forEach((t, i) => { place(t, i); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); if (colorFn) m.setColorAt(i, colorFn(t, i)); });
  m.castShadow = shadows; m.receiveShadow = true;
  m.computeBoundingSphere();
  return m;
}

export function buildWorld(scene, rd, trip, seed) {
  lazyMats();
  if (world) { scene.remove(world); worldGeos.forEach(g => g.dispose()); }
  worldGeos = []; world = new THREE.Group(); scene.add(world);
  const own = g => (worldGeos.push(g), g), r = lcg((seed % 2147483646) + 1);
  const xs = rd.pts.map(p => p.x), zs = rd.pts.map(p => p.z);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  const sw = Math.max(...xs) - Math.min(...xs) + 900, sh = Math.max(...zs) - Math.min(...zs) + 900;
  const ground = mesh(own(new THREE.PlaneGeometry(sw, sh)), pbr('grass_ground', [sw / 5, sh / 5], { roughness: 1, color: '#a9c27e' }), false);
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, 0, cz);
  const asphalt = pbr('aerial_asphalt_01', [2.5, 1], { side: THREE.DoubleSide, color: '#8f8f8a' });
  const markings = new THREE.MeshStandardMaterial({ map: markingsTex, transparent: true, depthWrite: false, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  world.add(ground, ribbon(rd.pts, ROAD_W / 2 + 2.2, 0.02, pbr('brown_mud_leaves_01', [2, 1], { side: THREE.DoubleSide }), 6),
    ribbon(rd.pts, ROAD_W / 2, 0.05, asphalt, 5), ribbon(rd.pts, ROAD_W / 2, 0.06, markings, 24), mountains(cx, cz));

  // ---- trees: bark trunks + crowns of real leaf cards; dead trees lying around ----
  const P = k => rd.props.filter(p => p.k === k), trees = P(0);
  world.add(instanced(trunkGeo, pbr('bark_brown_02', [1, 3]), trees, t => { dummy.position.set(t.x, 0, t.z); dummy.rotation.set((t.h % 0.2) - 0.1, t.h, 0); dummy.scale.set(t.s * 1.3, t.s * 6.5, t.s * 1.3); }));
  const cards = [];
  for (const t of trees) {
    const rr = lcg(Math.floor(t.h * 1e4) + 1), n = 26 + Math.floor(t.s * 22), cy = t.s * 6.2, rad = t.s * 2.6;
    for (let k = 0; k < n; k++) {
      const a = rr() * 6.28, el = rr() * 2 - 1, d = Math.cbrt(rr());
      cards.push({ x: t.x + Math.cos(a) * rad * d * Math.sqrt(1 - el * el), y: cy + el * rad * 0.75 * d, z: t.z + Math.sin(a) * rad * d * Math.sqrt(1 - el * el), ry: rr() * 6.28, rx: (rr() - 0.5) * 1.6, s: t.s * (1 + rr() * 0.8), c: rr() });
    }
  }
  world.add(instanced(cardGeo, leafMat(), cards, c => { dummy.position.set(c.x, c.y, c.z); dummy.rotation.set(c.rx, c.ry, 0); dummy.scale.setScalar(c.s); }, c => tmpC.setHSL(0.18 + c.c * 0.07, 0.25 + c.c * 0.25, 0.55 + c.c * 0.3)));
  const deadTrees = trees.filter(t => t.h % 1 < 0.12);
  world.add(...instProp('dead_tree_trunk', deadTrees, t => placeAt(t.x + 3, 0.1, t.z + 2, 0.8 + t.s * 0.3, t.h)));

  // ---- undergrowth: shrubs, ferns, weeds (real models), plus grass tufts everywhere ----
  const bush = P(1);
  world.add(...instProp('shrub_03', bush.filter((_, i) => i % 3 === 0), t => placeAt(t.x, 0, t.z, 1.4 + t.s, t.h)),
    ...instProp('fern_02', bush.filter((_, i) => i % 3 === 1), t => placeAt(t.x, 0, t.z, 1.2 + t.s * 0.8, t.h)),
    ...instProp('weed_plant_02', bush.filter((_, i) => i % 3 === 2), t => placeAt(t.x, 0, t.z, 1.6 + t.s, t.h)));
  const tufts = [], weeds = [];
  rd.pts.forEach(p => {
    for (let k = 0; k < 16; k++) {
      const z = r(), off = z < 0.12 ? (r() - 0.5) * ROAD_W : z < 0.62 ? (r() < 0.5 ? -1 : 1) * (ROAD_W / 2 - 1.5 + r() * 5) : (r() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 3 + r() * 40);
      const along = (r() - 0.5) * STEP, x = p.x + Math.cos(p.h) * off + Math.sin(p.h) * along, zz = p.z - Math.sin(p.h) * off + Math.cos(p.h) * along;
      tufts.push({ x, z: zz, s: 0.6 + r() * (Math.abs(off) < ROAD_W / 2 - 1 ? 0.5 : 1.3), h: r() * 6.28, c: r() });
    }
    if (r() < 0.35) { const off = (r() - 0.5) * (ROAD_W - 2); weeds.push({ x: p.x + Math.cos(p.h) * off, z: p.z - Math.sin(p.h) * off, h: r() * 6.28 }); }
  });
  world.add(instanced(tuftGeo, grassMat, tufts, t => { dummy.position.set(t.x, 0, t.z); dummy.rotation.set(0, t.h, 0); dummy.scale.set(t.s, t.s * (0.8 + t.c * 0.7), t.s); }, t => tmpC.setHSL(0.15 + t.c * 0.1, 0.3, 0.5 + t.c * 0.25), false));
  world.add(...instProp('weed_plant_02', weeds, w => placeAt(w.x, 0.05, w.z, 1.2, w.h), false));

  // ---- roadside junk: concrete barriers, barrels, bins, trash bags (decor only) ----
  const barriers = [], junk = [[], [], []];
  for (let i = 10; i < rd.n - 8; i += 6 + Math.floor(r() * 10)) {
    const p = rd.pts[i], side = r() < 0.5 ? -1 : 1;
    if (r() < 0.35) for (let k = 0; k < 2 + Math.floor(r() * 4); k++) {
      const q = rd.pts[Math.min(rd.n - 1, i + k)], off = side * (ROAD_W / 2 + 1.4);
      barriers.push({ x: q.x + Math.cos(q.h) * off, z: q.z - Math.sin(q.h) * off, h: q.h + (r() - 0.5) * 0.25 + Math.PI / 2 });
    }
    if (r() < 0.5) {
      const off = side * (ROAD_W / 2 + 3 + r() * 6);
      for (let k = 0; k < 1 + Math.floor(r() * 4); k++) junk[Math.floor(r() * 3)].push({ x: p.x + Math.cos(p.h) * off + (r() - 0.5) * 3, z: p.z - Math.sin(p.h) * off + (r() - 0.5) * 3, h: r() * 6.28, tip: r() < 0.3 });
    }
  }
  world.add(...instProp('concrete_road_barrier_02', barriers, b => placeAt(b.x, 0, b.z, 1, b.h)),
    ...instProp('Barrel_01', junk[0], b => placeAt(b.x, b.tip ? 0.3 : 0, b.z, 1, b.h, b.tip ? Math.PI / 2 : 0)),
    ...instProp('metal_trash_can', junk[1], b => placeAt(b.x, 0, b.z, 1, b.h)),
    ...instProp('trashbag', junk[2], b => placeAt(b.x, 0, b.z, 1.1, b.h)));

  // ---- built stuff ----
  for (const p of P(2)) world.add(building(p));
  world.add(...instProp('street_lamp_01', P(3), p => placeAt(p.x, 0, p.z, 1.9, p.h + Math.PI / 2, p.tilt)));
  const covered = rd.wrecks.filter(w => w.m === 0 && w.c % 2 === 0);
  for (const w of rd.wrecks) if (!covered.includes(w)) world.add(wreckMesh(w));
  world.add(...instProp('covered_car', covered, w => placeAt(w.x, 0, w.z, 1, w.h)));
  const poles = P(4), wood = pbr('bark_brown_02', [1, 4]);
  for (const p of poles) {
    const g = new THREE.Group();
    const post = mesh(cyl(0.14, 0.2, 9.5, 8), wood); post.position.y = 4.75; g.add(post);
    const bar = mesh(box(2.4, 0.16, 0.16), wood); bar.position.y = 8.6; g.add(bar);
    g.position.set(p.x, 0, p.z); g.rotation.set(0, p.h, p.tilt); world.add(g);
  }
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
  world.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#1f1f1d' })));
  for (let i = 40; i < rd.n - 20; i += 45) world.add(gantry(rd.pts[i], trip, (((rd.n - i) * STEP) / 1609).toFixed(1)));

  // ---- the stop: an overgrown gas station ----
  const end = rd.pts[rd.n - 1], st = new THREE.Group();
  st.position.set(end.x + Math.sin(end.h) * 6, 0, end.z + Math.cos(end.h) * 6); st.rotation.y = end.h;
  const add = (m, x, y, z) => { m.position.set(x, y, z); st.add(m); return m; };
  add(mesh(box(26, 0.1, 24), pbr('aerial_asphalt_01', [6, 6]), false), 0, 0.06, 0);
  add(mesh(box(16, 0.8, 11), rustyPaint('#8f3b33', 0.6)), 0, 5.6, 0);
  add(mesh(box(16.1, 0.3, 11.1), rustyPaint('#cfc8b8', 0.4)), 0, 5.1, 0);
  for (const [x, z] of [[6, 4], [-6, 4], [6, -4], [-6, -4]]) add(mesh(cyl(0.3, 0.3, 5.2), rustyPaint('#cfc8b8', 0.5)), x, 2.6, z);
  for (const x of [-2.5, 2.5]) add(mesh(box(1, 1.6, 0.8), rustyPaint('#a5893f', 0.7)), x, 0.8, 0);
  add(mesh(cyl(0.2, 0.2, 7), rustyPaint('#6d6e69', 0.7)), 9, 3.5, 7);
  const sign = add(mesh(box(4.4, 2.2, 0.3), mat('#3a3a36')), 9, 7.6, 7);
  const face = new THREE.Mesh(own(new THREE.PlaneGeometry(4.2, 2)), new THREE.MeshStandardMaterial({ roughness: 0.9, map: signTex([['FUEL · FOOD', 46, 70], [`STOP #${trip}`, 76, 145]], '#8f3b33') }));
  face.position.z = -0.16; face.rotation.y = Math.PI; sign.add(face);
  add(new THREE.Mesh(cyl(3, 3, 80, 24), new THREE.MeshBasicMaterial({ color: '#ffd43b', transparent: true, opacity: 0.1, depthWrite: false })), 0, 40, 0);
  world.add(st);
  st.updateMatrixWorld(true);
  const stJunk = [[-9, -6], [-10, -4], [8, -8], [-7, 9]].map(([x, z]) => new THREE.Vector3(x, 0, z).applyMatrix4(st.matrixWorld));
  world.add(...instProp('Barrel_01', stJunk.slice(0, 2), v => placeAt(v.x, 0, v.z, 1, v.x)), ...instProp('shrub_03', stJunk.slice(2), v => placeAt(v.x, 0, v.z, 2.2, v.z)));

  // ---- a flock of crows wheeling over the road ----
  const wingGeo = own(new THREE.BufferGeometry());
  wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, -0.6, 0.1, -0.1, 0, 0, -0.2, 0, 0, 0.25, 0.6, 0.1, -0.1, 0, 0, -0.2], 3));
  crows = new THREE.InstancedMesh(wingGeo, new THREE.MeshBasicMaterial({ color: '#16181a', side: THREE.DoubleSide }), 28);
  crows.birds = Array.from({ length: 28 }, () => ({ a: r() * 6.28, rad: 8 + r() * 18, y: 22 + r() * 12, sp: 0.3 + r() * 0.4, f: r() * 6 }));
  crows.frustumCulled = false;
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
