// Afterglow — the land and the road on it. One flat grid in road space; the vertex shader bends it into
// the valley, the fragment shader decides what each point is covered in: asphalt and its paint, gravel,
// grass, forest.
//
// The asphalt's surface is a photograph: Poly Haven's "Worn Asphalt" (by Amal Kumar, CC0), a 2 m square
// that repeats. It arrives after the picture has begun and is faded in over the painted asphalt. Only its
// detail is used; the road's colour stays the palette's.

import * as THREE from 'three';
import { config } from './config.js';
import { common, shared, num } from './glsl.js';
import { loadMap } from './maps.js';

const { ground: G, path: P, colour: C, surface: S, turf: T } = config;

const vertexShader = /* glsl */`
${common}

varying vec2 vRoad;       // across, along
varying vec3 vWorld;
varying vec3 vNormal;
varying float vAbove;     // height above the road
varying float vBend;      // the road's curvature here

void main() {
  float d = position.x, r = position.z;
  float h = terrainH(d, r);
  vec3 wp = roadToWorld(d, r, h);

  // the land's slope across and along, by stepping a little each way
  float e = 6.0;
  float hd = (terrainH(d + e, r) - h) / e;
  float hs = (terrainH(d, r + e) - h) / e;
  vNormal = normalize(cross(vec3(1.0, hd, 0.0), vec3(pathDX(r), pathDY(r) + hs, -1.0)));

  vRoad = vec2(d, r);
  vWorld = wp;
  vAbove = h;
  vBend = pathDDX(r);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const fragmentShader = /* glsl */`
${common}

varying vec2 vRoad;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vAbove;
varying float vBend;

uniform float uMarkS;     // where the origin is in the centre line's 12 m of dash and gap
uniform float uSheen;
uniform vec3 uAsphalt;
uniform vec3 uGravel;
uniform vec3 uGrass;
uniform vec3 uForest;
uniform vec3 uForestLit;
uniform vec3 uWhite;
uniform vec3 uYellow;

uniform sampler2D uRoadMap;     // the photographed asphalt: its colour,
uniform sampler2D uRoadNor;     //   which way each grain of it faces,
uniform sampler2D uRoadRough;   //   and how dull or polished it is
uniform sampler2D uTurfMap;     // the photographed grass: its colour,
uniform sampler2D uTurfNor;     //   and which way each blade and clod of it faces
uniform float uSurface;         // 0 until the photograph has arrived, then up to 1
uniform float uTileS;           // where the origin is in the photograph's repeat

const float TILE = ${num(S.tile)};
const float RELIEF = ${num(S.relief)};
const float LANE = ${num(G.lane)};
const float PAVED = ${num(G.paved)};
const float BEND = ${num(P.solidBend)};

// How much of this pixel a painted line covers (centre c, width w, a pixel being px metres wide).
// A line thinner than a pixel fades instead of flickering.
float stripe(float x, float c, float w, float px) {
  return clamp((0.5 * w - abs(x - c)) / px + 0.5, 0.0, 1.0) * min(1.0, w / px);
}

// Noise with cells of a given size. Once the cells are smaller than a pixel it gives its average instead:
// detail that cannot be resolved is left out rather than left to shimmer.
float grain(vec2 p, float cell, float px) {
  return mix(0.5, pnoise(p / cell, NOISE_P / cell), 1.0 - smoothstep(0.35, 1.0, px / cell));
}

void main() {
  float d = vRoad.x, r = vRoad.y, ad = abs(d);
  vec2 p = vec2(d, r + uNoiseS);
  float pxD = max(fwidth(d), 1e-4), pxS = max(fwidth(r), 1e-4);
  float px = max(pxD, pxS);

  float n16 = grain(p, 16.0, px);
  float n4 = grain(p, 4.0, px);
  float nHalf = grain(p, 0.5, px);
  float nFine = grain(p, 0.0625, px);
  float nLong = grain(p * vec2(8.0, 1.0), 16.0, px);       // streaks 2 m wide and 16 m long, the way a road wears

  // Where this pixel is on the photographs of the ground (asphalt and grass are both 2 m squares), and how
  // much of them it spans: asked here, where every pixel passes, because inside the branches below the GPU
  // could no longer work it out for itself.
  vec2 st = vec2(d, r + uTileS) / TILE;
  vec2 stX = dFdx(st), stY = dFdy(st);

  // ── the land: forest, and grass where the forest stands back
  // Down on the valley floor the sun only arrives through a gap in the ridge, and then striped by the
  // shadows of the trees; up on the walls it arrives whole.
  float floorLight = lastLight(d, vAbove, r) * streaks(vWorld) * (1.0 - smoothstep(30.0, 90.0, vAbove));
  float reach = lastLight(d, vAbove, r) * mix(streaks(vWorld), 1.0, smoothstep(30.0, 90.0, vAbove));
  vec3 slopeN = normalize(vNormal);
  float canopy = 1.0;            // a wooded slope's own light and dark, seen from far enough off to take it in whole
  float litter = 1.0;            // and the forest floor's, seen from close
  vec2 pX = dFdx(p), pY = dFdy(p);
  vec3 grass = uGrass * (0.7 + 0.45 * n4 + 0.25 * nHalf);
  vec3 gravel = uGravel * (0.75 + 0.5 * nHalf);

  if (uSurface > 0.0) {
    // two copies of the grass, traded in patches, as with the asphalt below
    float which = smoothstep(0.42, 0.58, pnoise(p / 8.0 + vec2(9.1, 0.0), NOISE_P / 8.0));
    vec2 st2 = st + vec2(0.37, 0.61);
    vec3 tone = mix(textureGrad(uTurfMap, st, stX, stY).rgb, textureGrad(uTurfMap, st2, stX, stY).rgb, which);
    vec3 clodN = mix(textureGrad(uTurfNor, st, stX, stY).xyz, textureGrad(uTurfNor, st2, stX, stY).xyz, which) * 2.0 - 1.0;

    // its own average colour divided out, so the palette still decides how green the grass is at this hour;
    // what stays is the difference between blade and bare earth, and each clod lit by which way it leans
    vec3 turfMean = max(textureLod(uTurfMap, vec2(0.5), 16.0).rgb, vec3(1e-3));
    vec3 detail = tone / turfMean;
    vec3 toGlow = normalize(vec3(uSunDir.x, 0.4, uSunDir.z));
    float relief = mix(1.0, clamp(dot(normalize(vec3(clodN.x, clodN.z, -clodN.y)), toGlow) / toGlow.y, 0.0, 2.0), 0.5);
    float mottle = dot(detail, vec3(0.2126, 0.7152, 0.0722)) * relief;

    grass = mix(grass, uGrass * detail * relief * (0.8 + 0.4 * n4), uSurface);
    litter = mix(1.0, mix(1.0, mottle, 0.8), uSurface);                                  // under the trees, only its light and dark: litter and moss

    // The same photograph again, 16 and 128 times the size. A hillside away, its blades and bare earth read
    // as crowns and the gaps between them: it gives a wooded slope its nap, and a far meadow its patches,
    // out where the 2 m copy has long since blurred to a single colour. Its relief does the same for the
    // light: each "crown" has a side that faces the sun.
    vec2 hill = p / 32.0 + vec2(0.13, 0.0), vale = p / 256.0 + vec2(0.57, 0.0);
    vec3 patches = (textureGrad(uTurfMap, hill, pX / 32.0, pY / 32.0).rgb / turfMean)
                 * mix(vec3(1.0), textureGrad(uTurfMap, vale, pX / 256.0, pY / 256.0).rgb / turfMean, 0.7);
    vec3 crowns = textureGrad(uTurfNor, hill, pX / 32.0, pY / 32.0).xyz * 2.0 - 1.0;
    slopeN = normalize(slopeN + uSurface * 0.9 * vec3(crowns.x, 0.0, -crowns.y));
    canopy = mix(1.0, clamp(dot(patches, vec3(0.2126, 0.7152, 0.0722)), 0.4, 1.9), uSurface);
    grass *= mix(vec3(1.0), clamp(patches, 0.45, 1.8), 0.8 * uSurface);

    // the shoulder is the asphalt's own stone, loose: the same photograph, coarser and with more contrast
    vec3 stone = textureGrad(uRoadMap, st * 0.6 + 0.31, stX * 0.6, stY * 0.6).rgb / max(textureLod(uRoadMap, vec2(0.5), 16.0).rgb, vec3(1e-3));
    gravel = mix(gravel, uGravel * pow(dot(stone, vec3(0.2126, 0.7152, 0.0722)), 1.8) * (0.85 + 0.3 * nHalf), uSurface);
  }

  // A wooded slope in the last sun is not lit all over: its crowns are, each on the side that faces the sun,
  // and the gaps between them stay as dark as forest in the shade. Seen from low down and far off, the crowns
  // hide the gaps behind them, and the slope reads as lit nearly all over: the olive gold of a hillside at dusk.
  // From across the valley a forest is crowns, each a few metres wide, with darker gaps between them; the
  // grass photograph only has the right grain up close.
  canopy *= mix(1.0, 0.55 + 0.9 * grain(p, 6.0, px), smoothstep(80.0, 300.0, distance(vWorld, cameraPosition)));

  float far = smoothstep(400.0, 1600.0, distance(vWorld, cameraPosition));
  float sun = reach * smoothstep(0.05, 0.6, dot(slopeN, uSunDir)) * mix(smoothstep(0.75, 1.35, canopy), 0.85, far);
  vec3 forest = (uForest * (0.7 + 0.6 * n16) + uForestLit * uBright * (0.65 + 0.7 * n16) * sun) * canopy * litter;
  grass *= 1.0 - 0.45 * grove(d, r);                                                     // darker under a grove: shade, and fallen needles
  // open ground up on the walls (an avalanche path, a high meadow) is in the same sun as the forest round it
  grass *= 1.0 + uSunWarm * (uBright * reach * smoothstep(0.05, 0.6, dot(slopeN, uSunDir)) * smoothstep(30.0, 90.0, vAbove));

  float treeline = clearing(d, r) + 1.0 + (n4 - 0.5) * 5.0;
  float wooded = smoothstep(-2.0, 6.0, ad - treeline) * (1.0 - chute(d, r));
  vec3 col = mix(grass, forest, wooded);
  col = mix(gravel, col, smoothstep(-0.4, 0.5, ad - SHOULDER - (n4 - 0.5)));

  // What lights the ground. In the shade, only the sky: a little blue, and on the valley floor less of it
  // between two walls of forest, where only a strip of sky is left overhead (the forest itself is seen from
  // above, its crowns open to the sky). Where the last sun comes down, that as well, low and warm, across
  // road and grass alike.
  vec3 light = SKYLIGHT * mix(skyView(d, r), 1.0, wooded) + uSunWarm * (BEAM_RAKE * floorLight);
  col *= light;

  // ── the road

  float paved = 1.0 - clamp((ad - PAVED - (nHalf - 0.5) * 0.1) / pxD + 0.5, 0.0, 1.0);
  if (paved > 0.0) {
    vec3 road = uAsphalt * (0.8 + 0.22 * nLong + 0.1 * nHalf + 0.12 * nFine);
    vec3 N = vec3(0.0, 1.0, 0.0);
    float gloss = 1.0;
    float wear = 0.7 + 0.3 * nHalf;

    if (uSurface > 0.0) {
      // Two copies of the photograph, one shifted, traded for each other in patches a few metres across,
      // so the eye cannot find the 2 m beat down the road.
      float which = smoothstep(0.42, 0.58, pnoise(p / 8.0 + vec2(3.3, 0.0), NOISE_P / 8.0));
      vec2 st2 = st + vec2(0.37, 0.61);
      vec3 tone = mix(textureGrad(uRoadMap, st, stX, stY).rgb, textureGrad(uRoadMap, st2, stX, stY).rgb, which);
      vec3 grainN = mix(textureGrad(uRoadNor, st, stX, stY).xyz, textureGrad(uRoadNor, st2, stX, stY).xyz, which) * 2.0 - 1.0;
      float rough = mix(textureGrad(uRoadRough, st, stX, stY).g, textureGrad(uRoadRough, st2, stX, stY).g, which);

      // The photograph's own colour is divided out (its smallest mip is its average), which leaves only
      // what it has that an average does not: grit, cracks, the odd fallen leaf. The palette colours the road.
      vec3 detail = tone / max(textureLod(uRoadMap, vec2(0.5), 16.0).rgb, vec3(1e-3));
      vec3 photo = uAsphalt * detail * (0.9 + 0.2 * nLong);

      // each grain leans toward or away from the bright part of the sky, and is lit accordingly
      vec3 grainUp = normalize(vec3(grainN.x, grainN.z, -grainN.y));           // across, up, along
      vec3 toGlow = normalize(vec3(uSunDir.x, 0.4, uSunDir.z));
      photo *= mix(1.0, clamp(dot(grainUp, toGlow) / toGlow.y, 0.0, 2.0), RELIEF);

      road = mix(road, photo, uSurface);
      N = normalize(mix(N, grainUp, uSurface));
      gloss = mix(1.0, clamp(1.0 + 2.5 * (textureLod(uRoadRough, vec2(0.5), 16.0).g - rough), 0.0, 2.5), uSurface);
      wear *= mix(1.0, clamp(dot(detail, vec3(0.2126, 0.7152, 0.0722)), 0.5, 1.3), 0.6 * uSurface);   // paint breaks where the asphalt under it does
    }

    road *= 1.0 + 0.07 * exp(-pow((abs(ad - LANE * 0.5) - 0.85) / 0.3, 2.0));   // tyres have polished two paler tracks into each lane

    // North American paint. White at each edge. Two yellows down the middle: the far one always solid,
    // ours broken (3 m of line, 9 m of gap) wherever the road is straight enough to pass on.
    float m = mod(r + uMarkS + 4.5, 12.0) - 4.5;
    float dash = clamp(min(m, 3.0 - m) / pxS + 0.5, 0.0, 1.0);
    dash = mix(dash, 0.25, smoothstep(1.5, 6.0, pxS));       // too far to tell the dashes apart: a quarter of a line
    float centre = stripe(d, -0.13, 0.11, pxD) + stripe(d, 0.13, 0.11, pxD) * max(dash, step(BEND, abs(vBend)));
    road = mix(road, uYellow, min(centre, 1.0) * wear);
    road = mix(road, uWhite, stripe(ad, LANE - 0.08, 0.12, pxD) * wear);
    road *= light;

    // seen at a low angle, asphalt gives back the sky: the road ahead is paler than the road underfoot,
    // and its polished patches paler than its dull ones. That is the sky's own light, and neither the shade
    // nor the sun on the road changes it
    vec3 V = normalize(cameraPosition - vWorld);
    float low = pow(1.0 - max(dot(N, V), 0.0), 6.0);
    road = mix(road, skyGradient(reflect(-V, N)) * 0.8, min(uSheen * gloss * low, 1.0));
    // and where the last sun is on it, looked at toward the sun, it shines: a surface this rough sends light
    // on mostly the way it was already going, so a stretch of road in the sun ahead is the brightest thing on it
    float glint = pow(max(dot(reflect(-V, N), uSunDir), 0.0), 5.0);
    road += uSunWarm * (BEAM_SHINE * floorLight * gloss * glint * (0.3 + 0.7 * low));
    col = mix(col, road, paved);
  }

  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
}
`;

// The grid: columns closer together near the road, rows closer together near the camera. Rows lie on
// multiples of 4 m and 16 m, and the whole grid moves in steps of 16 m, so each row always lands on land
// that some row has stood on before: the valley's outline never crawls as the camera moves.
function grid() {
  const across = [...G.across.map(v => -v).reverse(), 0, ...G.across];
  const along = [];
  for (let r = -G.back; r < G.nearTo; r += G.nearStep) along.push(r);
  for (let r = G.nearTo; r <= G.farTo; r += G.farStep) along.push(r);

  const cols = across.length, rows = along.length;
  const position = new Float32Array(cols * rows * 3);
  for (let j = 0, k = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++, k += 3) { position[k] = across[i]; position[k + 2] = along[j]; }
  }

  const index = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, e = c + 1;
      index.push(a, b, e, a, e, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setIndex(index);
  return geometry;
}

export function createGround(maxAnisotropy = 1) {
  const uniforms = {
    ...shared,
    uRoadMap: { value: null },
    uRoadNor: { value: null },
    uRoadRough: { value: null },
    uTurfMap: { value: null },
    uTurfNor: { value: null },
    uSurface: { value: 0 },
    uTileS: { value: 0 },
    uMarkS: { value: 0 },
    uSheen: { value: C.sheen },
    uAsphalt: { value: new THREE.Color(C.asphalt) },
    uGravel: { value: new THREE.Color(C.gravel) },
    uGrass: { value: new THREE.Color(C.grass) },
    uForest: { value: new THREE.Color(C.forest) },
    uForestLit: { value: new THREE.Color(C.forestLit) },
    uWhite: { value: new THREE.Color(C.white) },
    uYellow: { value: new THREE.Color(C.yellow) },
  };

  const mesh = new THREE.Mesh(grid(), new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.DoubleSide }));
  mesh.frustumCulled = false;      // its shape is decided on the GPU; nothing here knows where it is

  // The photograph is asked for now and used when it comes. If it never does, the painted asphalt stays.
  let arrived = false;
  const anisotropy = Math.min(S.anisotropy, maxAnisotropy);
  const road = name => `${S.path}${name}_${S.size}.jpg`, turf = name => `${T.path}${name}_${T.size}.jpg`;
  const surface = Promise.all([
    loadMap(road('diff'), true, anisotropy), loadMap(road('nor_gl'), false, anisotropy), loadMap(road('rough'), false, anisotropy),
    loadMap(turf('diff'), true, anisotropy), loadMap(turf('nor_gl'), false, anisotropy),
  ])
    .then(([map, nor, rough, turfMap, turfNor]) => {
      uniforms.uRoadMap.value = map;
      uniforms.uRoadNor.value = nor;
      uniforms.uRoadRough.value = rough;
      uniforms.uTurfMap.value = turfMap;
      uniforms.uTurfNor.value = turfNor;
      arrived = true;
    })
    .catch(() => {});

  // fades the photograph in; `seconds` is how long since the last frame, Infinity to have it at once
  function tick(seconds) {
    if (arrived && uniforms.uSurface.value < 1) uniforms.uSurface.value = Math.min(1, uniforms.uSurface.value + seconds / S.fade);
  }

  return { mesh, uniforms, surface, tick };
}
