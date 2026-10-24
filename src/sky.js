// Afterglow — everything too far away to be worth building: the sky, its clouds, and three ranges of
// mountains. All of it is painted by one shader onto the inside of a box around the camera.
//
// The furthest range is real mountains, worked out beforehand (range.js) and lit here. The two nearer,
// forested ones are drawn the way "Up in the Cloud Sea" (mdb, on ShaderToy) draws its clouds: each layer is
// one line of noise, and whatever lies under the line belongs to the layer. There the line runs across the
// screen; here it runs round the horizon, so the mountains stay where they are when the road turns.

import * as THREE from 'three';
import { config } from './config.js';
import { common, shared, num } from './glsl.js';
import { rangeChunk } from './range.js';
import { loadMap } from './maps.js';

const C = config.colour, R = config.range;

const vertexShader = /* glsl */`
varying vec3 vDir;

void main() {
  vDir = position;
  vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);   // turns with the camera, never moves with it
  gl_Position = p.xyww;                                                 // as far away as anything can be
}
`;

const fragmentShader = /* glsl */`
${common}
${rangeChunk}

varying vec3 vDir;
uniform float uTime;
uniform sampler2D uRange;   // the far range: which way each point of it faces, and how far off it is
uniform vec2 uRangeTy;      // the band of sky that picture covers, as tangents of elevation
uniform float uSnowline;    // km above the valley floor
uniform float uPeaks;       // km above the valley floor: below this the far range has lost the sun too
uniform sampler2D uRockMap; // a photographed rock face: its colour,
uniform sampler2D uRockNor; //   and which way each block and crack of it faces
uniform sampler2D uSnowNor; // photographed snow: which way its surface leans
uniform float uStone;       // 0 until those photographs have arrived, then up to 1
uniform vec3 uForestLit;
uniform float uCloud;       // how much of the sky is cloud
uniform vec3 uDrift;        // how far each range has slid along the horizon, from the camera's own sideways travel
uniform vec3 uSnowLit;
uniform vec3 uSnowShade;
uniform vec3 uRockLit;
uniform vec3 uRockShade;
uniform vec3 uRidgeFar;
uniform vec3 uRidgeNear;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;

const float ROCK_KM = ${num(R.rock.tile)};
const float ROCK_PX = ${num(R.rock.px)};
const float ROCK_BUMP = ${num(R.rock.bump)};
const float SNOW_KM = ${num(R.snow.tile)};
const float SNOW_BUMP = ${num(R.snow.bump)};
const float CLOUD = ${num(C.cloud)};

// as many octaves as uDetail asks for: each one adds a finer wrinkle
float fbm(vec2 p) {
  float amp = 0.5, total = 0.0, weight = 0.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= uDetail) break;
    total += amp * vnoise(p);
    weight += amp;
    p = p * 2.03 + 17.1;
    amp *= 0.5;
  }
  return total / weight;
}

// How much of the sun reaches a point on the far range: a few long steps toward it, over a coarse copy of
// the mountains, noting how nearly each one grazes the ground. p is in kilometres from the camera.
float rangeShadow(vec3 p) {
  float lit = 1.0, s = 0.5;
  float slack = 0.22 * uRelief;                 // the coarse copy stands a little off the real surface: not counted as shade
  for (int i = 0; i < 9; i++) {
    vec3 q = p + uSunDir * s;
    float clear = q.y - rangeH(q.xz, 4);
    lit = min(lit, 4.0 * (clear + slack) / s);
    if (lit <= 0.0) break;
    s += clamp(clear, 0.25, 1.4);
  }
  return clamp(lit, 0.0, 1.0);
}

void main() {
  vec3 dir = normalize(vDir);
  vec3 col = skyGradient(dir);
  vec3 glow = horizonTint(dir);

  float az = atan(dir.x, -dir.z);                          // 0 is straight down the valley, right is positive
  float ty = dir.y / max(length(dir.xz), 1e-4);            // tangent of the elevation
  float aa = fwidth(ty) * 1.2 + 1e-5;

  // a few clouds, their thin edges still lit
  vec2 cp = dir.xz / (max(dir.y, 0.0) + 0.14) * vec2(0.9, 1.7) + vec2(uTime * 0.0015, 3.0);
  float c = fbm(cp);
  float edge = mix(0.75, 0.45, uCloud);
  float cloud = smoothstep(edge, edge + 0.2, c) * smoothstep(0.015, 0.11, dir.y) * CLOUD;
  col = mix(col, mix(uCloudLit, uCloudShade, smoothstep(edge + 0.06, edge + 0.28, c) * 0.7), cloud);

  // where the sun went down behind the ridge, the sky is still hot
  float sunward = max(dot(dir, uSunDir), 0.0);
  col += uSunWarm * (0.3 * pow(sunward, 40.0) + 0.08 * pow(sunward, 8.0));

  // The far range. Its shape was worked out once (range.js) into a picture of the horizon that says, for
  // each direction, how far off the mountain is and which way it faces. Here that is only looked up, and lit.
  float azR = az + uDrift.x;
  vec2 st = vec2(azR / (2.0 * AZ_MAX) + 0.5, (ty - uRangeTy.x) / (uRangeTy.y - uRangeTy.x));
  vec2 stX = dFdx(st), stY = dFdy(st);
  if (st.x > 0.0 && st.x < 1.0 && st.y > 0.0 && st.y < 1.0) {
    vec4 g = textureGrad(uRange, st, stX, stY);
    float there = smoothstep(0.4, 0.8, g.a) * smoothstep(0.0, 0.03, min(st.x, 1.0 - st.x));
    if (there > 0.001) {
      vec2 lean = g.rg * 2.0 - 1.0;
      vec3 N = vec3(lean.x, sqrt(max(1.0 - dot(lean, lean), 0.0)), lean.y);
      float away = mix(RANGE_FROM, RANGE_TO, g.b);
      vec3 P = normalize(vec3(sin(azR), ty, -cos(azR))) * away;           // the place itself, in km from the camera
      float alt = P.y;                                                   // km above the valley floor
      float steep = 1.0 - N.y;                                           // 0 on the flat, 1 on a cliff
      float n = vnoise(P.xz * 5.0), n2 = vnoise(P.xz * 19.0 + 7.0);

      // What it is made of. Snow above the snowline, but not where it is too steep to lie. Forest on the
      // gentler ground below. Between them rock, banded the way the Rockies are, in level beds.
      float snow = smoothstep(-0.1, 0.2, alt - uSnowline + 0.4 * (n - 0.5) + 0.15 * (n2 - 0.5) - 0.6 * smoothstep(0.4, 0.8, steep));
      float wooded = (1.0 - smoothstep(-0.15, 0.15, alt - uSnowline + 0.5 + 0.25 * (n - 0.5))) * (1.0 - smoothstep(0.35, 0.7, steep));
      float beds = vnoise(vec2(alt * 11.0 + n * 1.2, dot(P.xz, vec2(0.21, 0.13))));

      // Its grain: photographs of a rock face and of snow, laid on at the size of a mountain. A cliff a
      // kilometre high is cracked and blocked much as one three metres high is; only the scale differs.
      // The rock is laid on from the two sides (so its cracks stay level and upright, as beds and joints
      // are), the snow from above.
      vec3 grainRock = vec3(1.0);
      if (uStone > 0.0) {
        float px = aa / 1.2;                                                               // what one pixel spans at one km, in km
        float lod = log2(max(away * px * ROCK_PX / ROCK_KM, 1.0));
        vec2 w = vec2(N.z * N.z, N.x * N.x) / max(N.z * N.z + N.x * N.x, 1e-4);            // how much this face looks along the valley, how much across it
        vec2 uvA = P.xy / ROCK_KM, uvB = P.zy / ROCK_KM;
        vec3 tone = w.x * textureLod(uRockMap, uvA, lod).rgb + w.y * textureLod(uRockMap, uvB, lod).rgb;
        vec3 fine = w.x * textureLod(uRockMap, uvA * 4.3, lod + 2.1).rgb + w.y * textureLod(uRockMap, uvB * 4.3, lod + 2.1).rgb;
        vec3 mean = max(textureLod(uRockMap, vec2(0.5), 16.0).rgb, vec3(1e-3));           // its own colour, to be divided out: the palette colours the rock
        grainRock = mix(vec3(1.0), clamp((tone / mean) * mix(vec3(1.0), fine / mean, 0.6), 0.25, 2.2), uStone);

        vec3 a = textureLod(uRockNor, uvA, lod).xyz * 2.0 - 1.0, b = textureLod(uRockNor, uvB, lod).xyz * 2.0 - 1.0;
        vec3 s = textureLod(uSnowNor, P.xz / SNOW_KM, log2(max(away * px * ROCK_PX / SNOW_KM, 1.0))).xyz * 2.0 - 1.0;
        vec3 lumps = ROCK_BUMP * (1.0 - snow) * (1.0 - wooded) * (w.x * vec3(a.x, a.y, 0.0) + w.y * vec3(0.0, b.y, b.x))
                   + SNOW_BUMP * snow * vec3(s.x, 0.0, s.y);
        N = normalize(N + uStone * lumps);
      }

      // How it is lit: by how squarely it faces the sun, unless another mountain stands in the way; and only
      // high up. Lower down, in among the peaks, the sun has gone already, as it has from the valley. What
      // still has it is the brightest thing in the picture, the colour of the last sun on snow.
      float high = smoothstep(-0.3, 0.3, alt - uPeaks + 0.3 * (n - 0.5));
      float light = smoothstep(-0.2, 0.3, dot(N, uSunDir)) * rangeShadow(P) * high;   // snow and haze carry a little light round the edge
      // Where the sun is off it the snow has only the sky, and the sky toward where the sun went is still
      // warm: a face turned that way keeps a blush of it even in the shade. Up high, that is the afterglow.
      float blush = 0.4 * high * smoothstep(-0.5, 0.8, dot(N.xz, normalize(uSunDir.xz)));
      vec3 rock = mix(uRockShade, uRockLit * uBright, light) * (0.8 + 0.4 * beds) * grainRock;
      vec3 wood = mix(uRidgeFar, uForestLit * 0.8, light);
      vec3 m = mix(mix(rock, wood, wooded), mix(mix(uSnowShade, uSnowLit * 0.8, blush), uSnowLit * uBright, light), snow);
      m *= mix(0.8, 1.0, N.y);                                           // what faces the sky has more of it

      // The air in between: the further the mountain, the more of the sky's own colour it takes, and a
      // little more again down at its foot. This is what sets one ridge in front of another.
      float veil = clamp(1.0 - exp(-away * uFog.x * 220.0) + 0.12 * exp(-max(alt, 0.0) * 2.0), 0.0, 1.0);
      col = mix(col, mix(m, glow * 0.85, veil), there);
    }
  }

  // two nearer ranges, forested, bluer the further off. Below the horizon they stand in for the land beyond the grid
  float r1 = (0.03 + 0.12 * fbm(vec2((az + uDrift.y) * 2.4 + 11.0, 1.3))) * uRelief;
  vec3 m1 = mix(uRidgeFar, glow * 0.8, mix(0.62, 0.45, clamp(ty / max(r1, 1e-4), 0.0, 1.0)));
  col = mix(col, m1, smoothstep(-aa, aa, r1 - ty));

  float r2 = (0.005 + 0.085 * fbm(vec2((az + uDrift.z) * 1.7 + 31.0, 4.1))) * uRelief;
  col = mix(col, mix(uRidgeNear, glow * 0.7, 0.34), smoothstep(-aa, aa, r2 - ty));

  // lit mist between here and all of that, where the sun comes down through a gap
  col += beamGlow(dir, 350.0) * (1.0 - smoothstep(0.0, 0.35, dir.y));

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createSky(range) {
  const uniforms = {
    ...shared,
    uRange: { value: range.texture },
    uRangeTy: range.uniforms.uTy,
    uSnowline: { value: R.snowline },
    uPeaks: { value: config.light.peaks },
    uRockMap: { value: null },
    uRockNor: { value: null },
    uSnowNor: { value: null },
    uStone: { value: 0 },
    uForestLit: { value: new THREE.Color(C.forestLit) },
    uTime: { value: 0 },
    uCloud: { value: C.cloudCover },
    uDrift: { value: new THREE.Vector3() },
    uSnowLit: { value: new THREE.Color(C.snowLit) },
    uSnowShade: { value: new THREE.Color(C.snowShade) },
    uRockLit: { value: new THREE.Color(C.rockLit) },
    uRockShade: { value: new THREE.Color(C.rockShade) },
    uRidgeFar: { value: new THREE.Color(C.ridgeFar) },
    uRidgeNear: { value: new THREE.Color(C.ridgeNear) },
    uCloudLit: { value: new THREE.Color(C.cloudLit) },
    uCloudShade: { value: new THREE.Color(C.cloudShade) },
  };

  // drawn last and only where nothing else has been: most of the picture is forest, and this is the costliest shader
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.BackSide, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;

  // The photographs are asked for now and faded in when they come. If they never do, the mountains keep
  // their painted rock.
  let arrived = false;
  const stone = Promise.all([
    loadMap(`${R.rock.path}diff_${R.rock.size}.jpg`, true),
    loadMap(`${R.rock.path}nor_gl_${R.rock.size}.jpg`, false),
    loadMap(`${R.snow.path}nor_gl_${R.snow.size}.jpg`, false),
  ]).then(([rock, rockNor, snowNor]) => {
    uniforms.uRockMap.value = rock;
    uniforms.uRockNor.value = rockNor;
    uniforms.uSnowNor.value = snowNor;
    arrived = true;
  }).catch(() => {});

  function tick(seconds) {
    if (arrived && uniforms.uStone.value < 1) uniforms.uStone.value = Math.min(1, uniforms.uStone.value + seconds / 1.5);
  }

  return { mesh, uniforms, stone, tick };
}
