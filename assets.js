// assets.js — loads the realistic CC0 assets (Quaternius characters/animations, Poly Haven props/textures/sky).
// Everything is preloaded once on the title screen; the rest of the game reads from A.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const A = { chars: {}, clips: {}, props: {}, tex: {}, hdr: null };

const CHARS = ['Superhero_Male_FullBody', 'Superhero_Female_FullBody', 'Male_Peasant', 'Female_Peasant', 'Male_Ranger', 'Female_Ranger',
  'Hair_SimpleParted', 'Hair_Buzzed', 'Hair_Long', 'Hair_Beard', 'Hair_Buns'];
const PROPS = ['covered_car', 'street_lamp_01', 'Barrel_01', 'trashbag', 'fern_02', 'weed_plant_02', 'shrub_03', 'metal_trash_can', 'concrete_road_barrier_02', 'dead_tree_trunk'];
// PBR sets: diffuse + normal + arm (ambient occlusion / roughness / metalness)
const PBR = ['aerial_asphalt_01', 'grass_ground', 'brown_mud_leaves_01', 'rust_coarse_01', 'bark_brown_02', 'concrete_wall_008'];

export async function loadAssets(onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_, done, total) => onProgress?.(done / total);
  const gltf = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder), texL = new THREE.TextureLoader(manager);
  const tex = (url, srgb) => texL.loadAsync(url).then(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; });
  await Promise.all([
    ...CHARS.map(async n => { A.chars[n] = await gltf.loadAsync(`assets/chars/${n}.glb`); }),
    gltf.loadAsync('assets/chars/anims.glb').then(g => { for (const c of g.animations) A.clips[c.name] = c; }),
    ...PROPS.map(async n => { A.props[n] = (await gltf.loadAsync(`assets/props/${n}.glb`)).scene; }),
    ...PBR.map(async n => {
      const [map, normalMap, arm] = await Promise.all([tex(`assets/tex/${n}_Diffuse.jpg`, true), tex(`assets/tex/${n}_nor_gl.jpg`), tex(`assets/tex/${n}_arm.jpg`)]);
      A.tex[n] = { map, normalMap, aoMap: arm, roughnessMap: arm };
    }),
    Promise.all([tex('assets/tex/tree_small_02_leaves_diff.jpg', true), tex('assets/tex/tree_small_02_leaves_alpha.jpg'), tex('assets/tex/tree_small_02_leaves_nor_gl.jpg')])
      .then(([map, alphaMap, normalMap]) => { A.tex.leaves = { map, alphaMap, normalMap }; }),
    new RGBELoader(manager).loadAsync('assets/env/farm_road_2k.hdr').then(t => { t.mapping = THREE.EquirectangularReflectionMapping; A.hdr = t; }),
  ]);
  return A;
}

// a PBR material from one of the texture sets, tiled `rep` times
export function pbr(name, rep = [1, 1], extra = {}) {
  const s = A.tex[name], clone = t => { const c = t.clone(); c.repeat.set(...rep); c.needsUpdate = true; return c; };
  return new THREE.MeshStandardMaterial({ map: clone(s.map), normalMap: clone(s.normalMap), aoMap: clone(s.aoMap), roughnessMap: clone(s.roughnessMap), ...extra });
}

// GLSL: cheap value noise in UV space, so stains and rust stick to surfaces while they move
export const NOISE = `float lvHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lvNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lvHash(i), lvHash(i + vec2(1, 0)), f.x), mix(lvHash(i + vec2(0, 1)), lvHash(i + vec2(1, 1)), f.x), f.y); }`;

// faded paint with rust breaking through in patches
export function rustyPaint(color, rust) {
  const R = A.tex.rust_coarse_01, m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.3, normalMap: R.normalMap, normalScale: new THREE.Vector2(0.3, 0.3) });
  m.onBeforeCompile = sh => {
    sh.uniforms.rustMap = { value: R.map };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D rustMap;
${NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      float rn = lvNoise(vNormalMapUv * 5.0) * 0.65 + lvNoise(vNormalMapUv * 17.0) * 0.35;
      diffuseColor.rgb = mix(diffuseColor.rgb, texture2D(rustMap, vNormalMapUv * 2.0).rgb, smoothstep(0.52, 0.66, rn) * ${rust.toFixed(2)});`);
  };
  m.customProgramCacheKey = () => `rustypaint${rust}`;
  return m;
}
