// people.js — realistic rigged humans and zombies (Quaternius Universal Base Characters + outfits, CC0)
// One skeleton per person: outfit and hair meshes are re-bound to the body's bones, so one mixer drives all of it.
import * as THREE from 'three';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { A, NOISE } from './assets.js';

const cache = new Map();
const variant = (src, key, tweak) => {
  const k = `${src.uuid}|${key}`;
  if (!cache.has(k)) { const m = src.clone(); tweak(m); m.customProgramCacheKey = () => key.split(':')[0]; cache.set(k, m); }
  return cache.get(k);
};
// GLSL: cheap value noise in UV space, so stains stick to the cloth while it animates
// zombie skin: drain the colour to a cold grey-green, then add rot and blood
const rot = `float lvL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
  diffuseColor.rgb = vec3(0.5, 0.56, 0.45) * (lvL * 1.15 + 0.05);`;
const grime = (blood, dirt, zombieSkin) => sh => {
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${NOISE}`).replace('#include <map_fragment>', `#include <map_fragment>
  #ifdef USE_MAP
  ${zombieSkin ? rot : ''}
  ${blood > 0.5 ? 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * vec3(1.0, 0.95, 0.85), 0.6);' : ''}
  float lvN = lvNoise(vMapUv * 9.0) * 0.6 + lvNoise(vMapUv * 31.0) * 0.4;
  diffuseColor.rgb *= mix(1.0, 0.55, smoothstep(0.45, 0.8, lvN) * ${dirt.toFixed(2)});
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.03, 0.02), smoothstep(0.74, 0.86, lvNoise(vMapUv * 7.0 + 3.7)) * ${blood.toFixed(2)});
  #endif`);
};
// the outfits replace the base body below the neck: keep only vertices skinned to neck_01 (joint 5) / Head (joint 6)
const headOnly = sh => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vHead;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHead = dot(skinWeight, vec4(equal(skinIndex, vec4(5.0))) + vec4(equal(skinIndex, vec4(6.0))));');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vHead;')
    .replace('void main() {', 'void main() {\n  if (vHead < 0.3) discard;');
};

function dress(mesh, o) {
  const name = mesh.material.name, skin = /Superhero|Regular/.test(name), cloth = /Peasant|Ranger/.test(name);
  if (/Superhero/.test(name)) {
    mesh.material = variant(mesh.material, `head${o.zombie ? 'Z' : ''}:${o.skinTone}`, m => {
      m.color.set(o.skinTone || '#ffffff');
      m.onBeforeCompile = sh => { headOnly(sh); if (o.zombie) grime(0.35, 0.6, true)(sh); };
    });
  } else if (skin) {
    mesh.material = variant(mesh.material, `skin${o.zombie ? 'Z' : ''}:${o.skinTone}`, m => {
      m.color.set(o.skinTone || '#ffffff');
      if (o.zombie) m.onBeforeCompile = grime(0.35, 0.6, true);
    });
  } else if (/Hair/.test(name) && o.hairColor) {
    mesh.material = variant(mesh.material, `hair:${o.hairColor}`, m => m.color.set(o.hairColor));
  } else if (cloth) {
    mesh.material = variant(mesh.material, `cloth${o.zombie ? 'Z' : ''}:${o.tint}`, m => {
      m.color.set(o.tint || '#ffffff');
      m.onBeforeCompile = grime(o.zombie ? 0.8 : 0.1, o.zombie ? 1 : 0.4);
    });
  }
}

export function makePerson(o) {
  // o: { sex: 'Male'|'Female', outfit: 'Peasant'|'Ranger', hair, hairColor, zombie, tint, skinTone, shadows }
  const g = new THREE.Group(), body = skClone(A.chars[`Superhero_${o.sex}_FullBody`].scene);
  g.add(body);
  const bones = {};
  body.traverse(b => { if (b.isBone) bones[b.name] = b; });
  for (const src of [A.chars[`${o.sex}_${o.outfit}`].scene, o.hair && A.chars[o.hair].scene]) {
    if (!src) continue;
    const part = skClone(src), meshes = [], armature = [];
    part.traverse(n => { if (n.isSkinnedMesh) meshes.push(n); if (n.isBone && !n.parent?.isBone) armature.push(n); });
    for (const m of meshes) m.bind(new THREE.Skeleton(m.skeleton.bones.map(b => bones[b.name]), m.skeleton.boneInverses), m.bindMatrix);
    armature.forEach(r => r.parent.remove(r)); // animation must find the body's bones, not these duplicates
    g.add(part);
  }
  g.traverse(m => {
    if (!m.isMesh) return;
    if (/Hood|Pauldron/.test(m.name)) { m.visible = false; return; } // a ranger hood and shoulder armor read as fantasy, not survivor
    dress(m, o);
    m.castShadow = !!o.shadows; m.receiveShadow = true;
  });
  const mixer = new THREE.AnimationMixer(g), actions = {};
  let cur = null;
  return {
    g, bones, mixer,
    get anim() { return cur; },
    play(name, { once = false, fade = 0.25, speed = 1, restart = false } = {}) {
      const a = (actions[name] ||= mixer.clipAction(A.clips[name]));
      a.timeScale = speed;
      if (cur === name && !restart) return a;
      a.reset().setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity).setEffectiveWeight(1);
      a.clampWhenFinished = once;
      a.play();
      if (cur && actions[cur] !== a) actions[cur].crossFadeTo(a, fade, false);
      cur = name;
      return a;
    },
  };
}
