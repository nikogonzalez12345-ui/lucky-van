// art.js — shared mesh/material/texture helpers and the cartoon characters
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const lcg = s => () => (s = (s * 16807) % 2147483647) / 2147483647;

export function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- shared geometry / materials ----------
export const GC = {}, MC = {};
export const geo = (k, make) => (GC[k] ||= make());
export const sphere = r => geo('s' + r, () => new THREE.SphereGeometry(r, 20, 14));
export const cap = (r, l) => geo(`c${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 14));
export const box = (x, y, z) => geo(`b${x},${y},${z}`, () => new THREE.BoxGeometry(x, y, z));
export const rbox = (x, y, z, r) => geo(`r${x},${y},${z},${r}`, () => new RoundedBoxGeometry(x, y, z, 4, r));
export const cyl = (a, b, h, n = 16) => geo(`y${a},${b},${h},${n}`, () => new THREE.CylinderGeometry(a, b, h, n));
export const mat = (c, o = {}) => (MC[c + JSON.stringify(o)] ||= new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, ...o }));
export const mesh = (g, m, shadow = true) => { const o = new THREE.Mesh(g, m); o.castShadow = shadow; o.receiveShadow = true; return o; };

export function shirtTex(base, flower, leaf, seed) {
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
export const rattyTex = (base, seed) => canvasTex(128, 128, (g, w, h) => {
  const r = lcg(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(70,45,20,${0.2 + r() * 0.3})`; g.beginPath(); g.ellipse(r() * w, r() * h, 6 + r() * 14, 4 + r() * 8, r() * 3, 0, 7); g.fill(); }
  g.fillStyle = '#2a2a2a';
  for (let i = 0; i < 5; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y + 14); g.lineTo(x - 6, y + 10); g.fill(); }
}, true);
export const Z_SHIRTS = ['#8d6e63', '#6c7a89', '#a1887f', '#7b8d6a', '#9e7b9b', '#c2a878'].map((c, i) => new THREE.MeshStandardMaterial({ map: rattyTex(c, i + 5), roughness: 0.8 }));
export const P_SHIRTS = {};
export const playerShirt = color => (P_SHIRTS[color] ||= new THREE.MeshStandardMaterial({ map: shirtTex(color, '#ffffff', '#2f9e44', color.length * 97 + color.charCodeAt(1)), roughness: 0.7 }));

export function label(text, color) {
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
export const eyeW = mat('#ffffff', { roughness: 0.2 }), eyeB = mat('#111111', { roughness: 0.2 });
export function makeGuy(o) {
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
