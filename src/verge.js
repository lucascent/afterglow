// Afterglow — the grass that stands up. The ground's own grass is a photograph laid flat (ground.js);
// seen from a road, at a low angle, flat is what gives it away. So along the verge and out across the
// meadows there are tufts as well: small crossed sheets with blades painted on them, thirty thousand,
// kept in the stretch of road just around the camera.

import * as THREE from 'three';
import { config } from './config.js';
import { common, shared, num } from './glsl.js';

const { verge: V, colour: C, quality: Q, forest: F } = config;
const KINDS = 4;

function mulberry32(a) {
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Four tufts side by side. Each blade is a thin curved wedge from the root, paler toward its tip.
// (index.html?atlas shows this canvas too.)
export function paintTufts(size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / KINDS;
  const ctx = canvas.getContext('2d');
  const rnd = mulberry32(F.seed + 7);
  const cell = size / KINDS;

  for (let k = 0; k < KINDS; k++) {
    const cx = k * cell + cell / 2, foot = cell;
    ctx.save();
    ctx.beginPath();
    ctx.rect(k * cell, 0, cell, cell);
    ctx.clip();
    const blades = 34 + Math.floor(rnd() * 20);
    for (let i = 0; i < blades; i++) {
      const lean = (rnd() - 0.5) * 2;                                   // -1 hard left … +1 hard right
      const tall = cell * (0.35 + 0.6 * rnd()) * (1 - 0.35 * Math.abs(lean));
      const x0 = cx + (rnd() - 0.5) * cell * 0.3;
      const tx = x0 + lean * cell * 0.42, ty = foot - tall;
      const mx = x0 + lean * cell * 0.1, my = foot - tall * 0.6;        // it stands, then bends over
      const w = cell * (0.008 + 0.012 * rnd());
      const g = Math.round(255 * (0.35 + 0.65 * rnd()));
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.beginPath();
      ctx.moveTo(x0 - w, foot);
      ctx.quadraticCurveTo(mx - w * 0.6, my, tx, ty);
      ctx.quadraticCurveTo(mx + w * 0.6, my, x0 + w, foot);
      ctx.fill();
    }
    ctx.restore();
  }
  return canvas;
}

const vertexShader = /* glsl */`
${common}

attribute vec4 aTuft;     // how far out from the shoulder toward the trees (its sign is the side of the road), along, height, turn
attribute vec2 aLook;     // which painting, how dark

uniform float uTuftS;     // where the origin is in the tufts' repeat

varying vec2 vUv;
varying vec3 vWorld;
varying float vUp;
varying float vTint;
varying float vSun;
varying float vOpen;      // how much sky it has

const float LENGTH = ${num(V.length)};
const float BACK = ${num(V.back)};
const float KINDS = ${num(KINDS)};

void main() {
  float r = mod(aTuft.y - uTuftS, LENGTH) - BACK;
  float side = sign(aTuft.x);
  float edge = clearing(side, r);
  float d = side * mix(SHOULDER + 0.3, edge + 4.0, pow(abs(aTuft.x), 1.5));     // thickest where the gravel ends

  float tall = aTuft.z;
  tall *= smoothstep(0.0, 5.0, r + BACK) * (1.0 - smoothstep(LENGTH - BACK - 60.0, LENGTH - BACK, r));   // they grow in at the far end, never appear
  tall *= mix(1.0, 0.5, smoothstep(edge - 1.0, edge + 4.0, abs(d)));                                     // and are thin in the shade of the trees
  tall *= 1.0 + 1.3 * smoothstep(0.55, 0.8, pnoise(vec2(d, r + uNoiseS) / 16.0 + vec2(7.7, 0.0), NOISE_P / 16.0));   // in patches it has been left to grow long

  vec3 foot = roadToWorld(d, r, terrainH(d, r) - 0.03);
  float c = cos(aTuft.w), s = sin(aTuft.w);
  vec3 q = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c);
  vec3 wp = foot + vec3(q.x * tall * 1.7, q.y * tall, q.z * tall * 1.7);

  vUv = vec2((aLook.x + mix(0.02, 0.98, uv.x)) / KINDS, uv.y);
  vUp = uv.y;
  vTint = aLook.y;
  vSun = lastLight(d, 0.5, r);
  vOpen = skyView(d, r);
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const fragmentShader = /* glsl */`
${common}

uniform sampler2D uTufts;
uniform vec3 uGrass;

varying vec2 vUv;
varying vec3 vWorld;
varying float vUp;
varying float vTint;
varying float vSun;
varying float vOpen;

void main() {
  vec4 paint = texture2D(uTufts, vUv);
  float a = clamp((paint.a - 0.5) / max(fwidth(paint.a), 1e-3) + 0.5, 0.0, 1.0);
  if (a < ${Q.samples > 0 ? '0.02' : '0.5'}) discard;

  vec3 col = uGrass * (0.45 + 1.1 * paint.r) * vTint * mix(0.5, 1.25, vUp);      // dark at the root, where blades shade each other
  col += uSkyZenith * 0.035 * vUp * paint.r;                                     // the tips still have the sky
  // lit by the sky as the ground under it is; and where the last sun comes down, by that, which a blade
  // standing up takes more squarely than the ground does. The tips have most of it.
  col *= SKYLIGHT * vOpen + uSunWarm * (BEAM_RAKE * BEAM_UPRIGHT * vSun * streaks(vWorld) * (0.25 + 0.9 * vUp * vUp));
  gl_FragColor = vec4(applyFog(col, vWorld), a);
}
`;

export function createVerge() {
  const position = [], uv = [], index = [];
  for (let i = 0; i < 2; i++) {
    const a = i * Math.PI / 2, x = 0.5 * Math.cos(a), z = 0.5 * Math.sin(a), o = i * 4;
    position.push(-x, 0, -z, x, 0, z, x, 1, z, -x, 1, -z);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    index.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);

  const rnd = mulberry32(F.seed + 3);
  const tuft = new Float32Array(V.count * 4), look = new Float32Array(V.count * 2);
  for (let i = 0; i < V.count; i++) {
    tuft.set([(rnd() < 0.5 ? -1 : 1) * (0.001 + 0.999 * rnd()), rnd() * V.length, 0.22 + 0.4 * rnd() * rnd() + 0.1 * rnd(), rnd() * Math.PI], i * 4);
    look.set([Math.floor(rnd() * KINDS), 0.7 + 0.6 * rnd()], i * 2);
  }
  geometry.setAttribute('aTuft', new THREE.InstancedBufferAttribute(tuft, 4));
  geometry.setAttribute('aLook', new THREE.InstancedBufferAttribute(look, 2));
  geometry.instanceCount = V.count;

  const tufts = new THREE.CanvasTexture(paintTufts());
  tufts.colorSpace = THREE.NoColorSpace;
  tufts.minFilter = THREE.LinearMipmapLinearFilter;

  const uniforms = {
    ...shared,
    uTuftS: { value: 0 },
    uTufts: { value: tufts },
    uGrass: { value: new THREE.Color(C.grass) },
  };
  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.DoubleSide, alphaToCoverage: Q.samples > 0 }));
  mesh.frustumCulled = false;

  return { mesh, uniforms };
}
