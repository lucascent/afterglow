// Afterglow — the marker posts at the edge of the road: thin pale strips on the gravel, one every forty
// metres on each side, with a patch of reflector near the top. There are no headlamps here to make them
// flare; they only hold a little of the sky. What they give is a beat to the road's passing, and something
// standing at its edge where the forest has drawn back.

import * as THREE from 'three';
import { config } from './config.js';
import { common, shared, num } from './glsl.js';

const { posts: O, ground: G, colour: C } = config;
const PAIRS = 24;                       // posts on each side that exist at once
const LENGTH = O.spacing * PAIRS;

const vertexShader = /* glsl */`
${common}

attribute vec2 aPost;     // which side of the road, how far along

uniform float uPostS;     // where the origin is in the posts' repeat

varying vec2 vUv;
varying vec3 vWorld;
varying float vSun;
varying float vOpen;      // how much sky it has

const float LENGTH = ${num(LENGTH)};
const float BACK = ${num(O.spacing * 0.5)};
const float OUT = ${num(G.paved + 0.55)};

void main() {
  float r = mod(aPost.y - uPostS, LENGTH) - BACK;
  vec3 foot = roadToWorld(aPost.x * OUT, r, 0.0);
  float dx = pathDX(r);
  vec3 across = normalize(vec3(1.0, 0.0, dx));                // square to the road, so it shows its face to what is coming
  vec3 wp = foot + across * position.x * ${num(O.width)} + vec3(0.0, position.y * ${num(O.height)}, 0.0);

  vUv = uv;
  vSun = lastLight(aPost.x * OUT, 0.6, r);
  vOpen = skyView(aPost.x * OUT, r);
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const fragmentShader = /* glsl */`
${common}

uniform vec3 uPost;

varying vec2 vUv;
varying vec3 vWorld;
varying float vSun;
varying float vOpen;

void main() {
  // weathered plastic, a shade darker toward the ground; the reflector takes the sky's own colour ahead
  vec3 col = uPost * mix(0.6, 1.0, vUv.y);
  float patch_ = step(0.74, vUv.y) * step(vUv.y, 0.92) * step(0.15, vUv.x) * step(vUv.x, 0.85);
  col = mix(col, skyGradient(normalize(vec3(uSunDir.x, 0.25, uSunDir.z))) * 0.6, patch_);
  col *= SKYLIGHT * vOpen + uSunWarm * (BEAM_RAKE * BEAM_UPRIGHT * vSun * streaks(vWorld));   // standing up, it takes the low sun squarely
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
}
`;

export function createPosts() {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  const post = new Float32Array(PAIRS * 2 * 2);
  for (let i = 0; i < PAIRS; i++) {
    post.set([-1, i * O.spacing, 1, (i + 0.5) * O.spacing], i * 4);      // the two sides are staggered, as they are set out on a real road
  }
  geometry.setAttribute('aPost', new THREE.InstancedBufferAttribute(post, 2));
  geometry.instanceCount = O.spacing > 0 ? PAIRS * 2 : 0;

  const uniforms = { ...shared, uPostS: { value: 0 }, uPost: { value: new THREE.Color(C.post) } };
  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.DoubleSide }));
  mesh.frustumCulled = false;

  return { mesh, uniforms, length: LENGTH, back: O.spacing * 0.5 };
}
