// Afterglow — the far range, as real mountains.
//
// The mountains on the horizon are a landscape in their own right: a height for every point on the map,
// from ten kilometres off to thirty-six. It is built the way "Elevated" (Iñigo Quilez) builds its terrain:
// layers of noise, each one held back where the layers before it are already steep, which is what water
// does to rock. The result has ridges, shoulders and valleys rather than lumps.
//
// Finding where a line of sight meets such a landscape takes a hundred steps or more, far too many to take
// for every pixel of every frame. But the range is so far away that it does not change as the camera moves:
// what is seen depends only on which way one looks. So it is worked out once, for every direction, into a
// long picture of the horizon (a panorama) that records, for each direction, how far off the mountain is and
// which way its surface faces there. Each frame the sky only looks that up and lights it (sky.js): the sun
// can be moved, the snowline raised, the air thickened, and none of it has to be worked out again.
// It is worked out again only when the mountains themselves change shape: Relief and Detail in the panel.

import * as THREE from 'three';
import { config } from './config.js';
import { shared, hash, num } from './glsl.js';

const R = config.range;
const AZ_MAX = 105 * Math.PI / 180;     // the panorama reaches this far to either side of straight ahead
const TY_LOW = -0.03, TY_HIGH = 0.40;   // and from just under the horizon to this high, as tangents of elevation
const STRIPS = 16;

// The landscape itself, shared by the pass that draws the panorama and by the sky, which walks over a
// coarse copy of it to find where one mountain's shadow falls on another. Lengths are kilometres here.
export const rangeChunk = /* glsl */`
const float AZ_MAX = ${num(AZ_MAX)};
const float RANGE_FROM = ${num(R.from)};
const float RANGE_TO = ${num(R.to)};
const float RANGE_H = ${num(R.height)};
const float RANGE_HERO = ${num(config.colour.hero)};
const mat2 RANGE_TURN = mat2(0.8, -0.6, 0.6, 0.8);

// value noise, and with it which way it is sloping: (value, d/dx, d/dy)
vec3 noised(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 du = 30.0 * f * f * (f * (f - 2.0) + 1.0);
  float a = hash12(i), b = hash12(i + vec2(1.0, 0.0)), c = hash12(i + vec2(0.0, 1.0)), d = hash12(i + vec2(1.0, 1.0));
  return vec3(a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y,
              du * (vec2(b - a, c - a) + (a - b - c + d) * u.yx));
}

// Height of the far range at x (km east and south of the camera), in km above the valley floor.
float rangeH(vec2 x, int octaves) {
  float rise = smoothstep(7.5, 12.5, length(x));          // the mountains begin beyond the valley's own walls
  if (rise <= 0.0) return 0.0;

  vec2 p = x / 5.2 + vec2(13.7, 4.1);
  float a = 0.0, b = 1.0;
  vec2 d = vec2(0.0);
  for (int i = 0; i < octaves; i++) {
    vec3 n = noised(p);
    d += n.yz;
    a += b * n.x / (1.0 + dot(d, d));                     // a finer layer is held back wherever the slope is already steep
    b *= 0.5;
    p = RANGE_TURN * p * 2.0;
  }

  // one massif stands above the rest, ahead
  vec2 c = x - vec2(sin(RANGE_HERO), -cos(RANGE_HERO)) * 14.0;
  float hero = exp(-dot(c, c) / 14.0);
  return RANGE_H * uRelief * rise * pow(a, 1.35) * (1.0 + 0.35 * hero);
}
`;

const vertexShader = /* glsl */`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// One pixel of the panorama: walk out along its direction until the landscape is met.
const fragmentShader = /* glsl */`
uniform float uRelief;
uniform float uDetail;
uniform vec2 uSize;
uniform vec2 uTy;

${hash}
${rangeChunk}

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  float az = (uv.x - 0.5) * 2.0 * AZ_MAX;
  vec3 dir = normalize(vec3(sin(az), mix(uTy.x, uTy.y, uv.y), -cos(az)));

  int octaves = 3 + int(uDetail);
  float top = RANGE_H * 2.0 * uRelief;                    // nothing stands higher than this
  float t = RANGE_FROM, before = RANGE_FROM;
  bool met = false;

  for (int i = 0; i < 240; i++) {
    vec3 p = dir * t;
    if (dir.y > 0.0 && p.y > top) break;
    float clear = p.y - rangeH(p.xz, octaves);            // how far above the ground the line of sight is here
    if (clear < 0.0012 * t) { met = true; break; }
    before = t;
    t += max(0.35 * clear, 0.003 * t);                    // the more room, the longer the next step
    if (t > RANGE_TO) break;
  }

  if (!met) { gl_FragColor = vec4(0.5, 0.5, 1.0, 0.0); return; }

  // close in on the surface, between the last step that was clear and the one that was not
  for (int i = 0; i < 5; i++) {
    float mid = 0.5 * (before + t);
    vec3 p = dir * mid;
    if (p.y - rangeH(p.xz, octaves) < 0.0) t = mid; else before = mid;
  }

  // which way the ground faces there, from its height a little to each side. Two more layers of noise
  // than the walk used: light picks out what a silhouette cannot
  vec2 x = (dir * t).xz;
  float e = 0.0012 * t;
  int fine = octaves + 2;
  vec3 n = normalize(vec3(
    rangeH(x - vec2(e, 0.0), fine) - rangeH(x + vec2(e, 0.0), fine),
    2.0 * e,
    rangeH(x - vec2(0.0, e), fine) - rangeH(x + vec2(0.0, e), fine)));

  gl_FragColor = vec4(n.xz * 0.5 + 0.5, (t - RANGE_FROM) / (RANGE_TO - RANGE_FROM), 1.0);
}
`;

export function createRange(renderer) {
  // as fine as a large screen can show; a phone is given a quarter of it, which is still more than it can
  const large = renderer.capabilities.maxTextureSize >= 8192 && Math.max(screen.width, screen.height) * (window.devicePixelRatio || 1) >= 1800;
  const width = large ? 8192 : 4096, height = width / 8;

  // Half floats where the card can draw into them: the distance to the mountain has to be known to within
  // a few metres for a photograph of rock to be laid on it without slipping.
  const target = new THREE.WebGLRenderTarget(width, height, {
    type: renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  target.scissorTest = true;

  const uniforms = {
    uRelief: shared.uRelief,
    uDetail: shared.uDetail,
    uSize: { value: new THREE.Vector2(width, height) },
    uTy: { value: new THREE.Vector2(TY_LOW, TY_HIGH) },   // the band of sky the panorama covers; the sky reads it too
  };

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false }));
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.Camera();

  let drawn = '';

  // Work the panorama out, if the mountains have changed shape since it last was. It is done a strip at a
  // time, so that no single piece of work is long enough for a slow graphics card to give up on. The smaller
  // copies the sky reads it through at a distance are made once, from the whole picture, after the last strip:
  // left to itself, every strip would make them all again.
  function bake() {
    const shape = `${shared.uRelief.value}|${shared.uDetail.value}`;
    if (shape === drawn) return false;
    drawn = shape;

    uniforms.uTy.value.y = TY_HIGH * Math.max(shared.uRelief.value, 0.5);    // taller mountains need a taller picture
    const before = renderer.getRenderTarget();
    for (let i = 0; i < STRIPS; i++) {
      target.scissor.set(i * width / STRIPS, 0, width / STRIPS, height);
      target.texture.generateMipmaps = i === STRIPS - 1;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    }
    renderer.setRenderTarget(before);
    return true;
  }

  return { texture: target.texture, uniforms, bake };
}
