// Afterglow — the GLSL that every material shares, and the uniforms behind it.
//
// The whole world is described in "road space": `d` metres across the road (right is positive) and `r`
// metres along it, counted from an origin that follows the camera. The road is a curve through the valley;
// the land, the trees and the paint are all placed relative to it. So the road always lies on the valley
// floor and no tree ever stands on it, with nothing stored and nothing to stitch.
//
// The air is shared too: everything fades toward the colour the sky has in that direction, which is what
// lets drawn geometry and a painted backdrop sit in one picture.

import * as THREE from 'three';
import { config } from './config.js';
import { KX, KY, KO, KG } from './path.js';

const { path: P, ground: G, light: L, air: A, colour: C } = config;
const rad = deg => deg * Math.PI / 180;

// numbers and lists as GLSL writes them
export const num = n => { const s = Number(n).toPrecision(8); return /[.e]/.test(s) ? s : s + '.0'; };
export const vec = a => `vec${a.length}(${a.map(num).join(', ')})`;

export const shared = {
  uPhX: { value: new THREE.Vector3() },       // phase of each sideways wave at the origin
  uPhY: { value: new THREE.Vector2() },       // and of each rise
  uPhOpen: { value: new THREE.Vector4() },    // and of the clearings: left, left, right, right
  uNoiseS: { value: 0 },                      // where the origin is in the land's repeat
  uPhGap: { value: new THREE.Vector2() },     // phase of the gaps in the ridge at the origin
  uPhBeam: { value: new THREE.Vector3() },    // and of the tree shadows that stripe the light coming through them
  uBeamDir: { value: new THREE.Vector2(1, 0) },   // across those shadows: level, and square to the sun
  uBeam: { value: 1 },                        // how much of that light there is: 0 is none
  uBright: { value: L.bright },               // how bright the last sun makes what it falls on full, against its colour in the palette
  uSunWarm: { value: new THREE.Vector3(...L.beam.warm) },
  uRoadY: { value: 0 },                       // height of the road under the camera: the floor the mist lies on
  uBend: { value: P.bend },                   // how much the road wanders: 0 is straight
  uRelief: { value: 1 },                      // how tall the land stands, near and far: 0 is a plain
  uDetail: { value: 5 },                      // how many octaves of noise the land and sky are made of
  uSunDir: { value: new THREE.Vector3() },    // toward the sun; set, with the next, by setSun below
  uShadow: { value: new THREE.Vector2(L.shadowAt, 0) },   // where the valley's shadow ends: height at the centre line, tilt across
  uSkyWarm: { value: new THREE.Color(C.skyWarm) },
  uSkyCool: { value: new THREE.Color(C.skyCool) },
  uSkyZenith: { value: new THREE.Color(C.skyZenith) },
  uSkyFalloff: { value: C.skyFalloff },
  uFog: { value: new THREE.Vector3(A.haze, A.mist, 1 / A.mistDepth) },
  uFogTint: { value: new THREE.Vector3(...A.mistTint) },
  uHazeTint: { value: new THREE.Vector3(...A.hazeTint) },
  uClock: { value: 0 },                       // seconds since the page began: the mist drifts
};

// Where the sun stands round the horizon (degrees right of straight down the valley), and what follows.
export function setSun(azimuth) {
  const a = rad(azimuth), e = rad(L.elevation), across = Math.sin(a);
  shared.uSunDir.value.set(across * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
  shared.uBeamDir.value.set(Math.cos(a), Math.sin(a));        // shadows run along the sun's bearing; this runs across them

  // The valley's shadow ends on a line that is lower on the wall facing the sun. With the sun well to one
  // side its tilt is tan(e) / across. Toward dead ahead that would tip to infinity and then flip over, so it
  // is eased through nothing instead: a sun straight down the valley is shaded by neither wall.
  const ease = 0.3;
  shared.uShadow.value.y = Math.abs(across) < 1e-4 ? Math.tan(e) * across / (ease * ease)
    : Math.tan(e) * (1 - Math.exp(-(across * across) / (ease * ease))) / across;
}
setSun(L.azimuth);

export const hash = /* glsl */`
// Dave Hoskins' hash without sine: the same on every GPU
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

export const common = /* glsl */`
uniform vec3 uPhX;
uniform vec2 uPhY;
uniform vec4 uPhOpen;
uniform float uNoiseS;
uniform vec2 uPhGap;
uniform vec3 uPhBeam;
uniform vec2 uBeamDir;
uniform float uBeam;
uniform float uBright;
uniform vec3 uSunWarm;
uniform float uRoadY;
uniform float uBend;
uniform float uRelief;
uniform float uDetail;
uniform vec3 uSunDir;
uniform vec2 uShadow;
uniform vec3 uSkyWarm;
uniform vec3 uSkyCool;
uniform vec3 uSkyZenith;
uniform float uSkyFalloff;
uniform vec3 uFog;
uniform vec3 uFogTint;
uniform vec3 uHazeTint;
uniform float uClock;

const vec3 PATH_A = ${vec(P.x.amp)};
const vec3 PATH_K = ${vec(KX)};
const vec2 RISE_A = ${vec(P.y.amp)};
const vec2 RISE_K = ${vec(KY)};
const vec2 OPEN_K = ${vec(KO)};
const float OPEN_FROM = ${num(P.open.from)};
const float OPEN_TO = ${num(P.open.to)};
const float CLEAR = ${num(P.clear)};
const float MEADOW = ${num(P.meadow)};
const float SHOULDER = ${num(G.shoulder)};
const float NOISE_P = ${num(G.repeat)};
const vec2 GAP_K = ${vec(KG)};
const float GAP_FROM = ${num(P.gap.from)};
const float GAP_TO = ${num(P.gap.to)};
const vec3 BEAM_K = ${vec(L.beam.shadows.map(w => 2 * Math.PI / w))};
const vec3 BEAM_W = vec3(0.45, 0.33, 0.22);
const float BEAM_AIR = ${num(1 / L.beam.air)};
const float BEAM_GLOW = ${num(L.beam.glow)};
const float BEAM_RAKE = ${num(L.beam.rake)};
const float BEAM_UPRIGHT = ${num(L.beam.upright)};
const float BEAM_SHINE = ${num(L.beam.shine)};
const float BEAM_DIM = ${num(L.beam.dim)};
const vec3 SKYLIGHT = ${vec(L.sky)};
const float CORRIDOR = ${num(L.corridor)};
const float MIST_CELL = ${num(A.patch)};
const float MIST_DRIFT = ${num(A.drift)};

${hash}

// Value noise that comes round again after wrap cells along the road, so the land can repeat without a seam.
float pnoise(vec2 p, float wrap) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float y0 = mod(i.y, wrap), y1 = mod(i.y + 1.0, wrap);
  return mix(mix(hash12(vec2(i.x, y0)), hash12(vec2(i.x + 1.0, y0)), u.x),
             mix(hash12(vec2(i.x, y1)), hash12(vec2(i.x + 1.0, y1)), u.x), u.y);
}

float vnoise(vec2 p) { return pnoise(p, 65536.0); }

// ── the road ──────────────────────────────────────────────

float pathX(float r)   { return uBend * dot(PATH_A, sin(uPhX + PATH_K * r)); }
float pathDX(float r)  { return uBend * dot(PATH_A * PATH_K, cos(uPhX + PATH_K * r)); }
float pathDDX(float r) { return -uBend * dot(PATH_A * PATH_K * PATH_K, sin(uPhX + PATH_K * r)); }
float pathY(float r)   { return dot(RISE_A, sin(uPhY + RISE_K * r)); }
float pathDY(float r)  { return dot(RISE_A * RISE_K, cos(uPhY + RISE_K * r)); }

// road space → the scene. Sideways distances are widened by the road's slant, which keeps it its true width.
vec3 roadToWorld(float d, float r, float h) {
  float dx = pathDX(r);
  return vec3(pathX(r) + d * sqrt(1.0 + dx * dx), pathY(r) + h, -r);
}

// 0 where the forest stands at the roadside, 1 where it has drawn back. Each side keeps its own time.
float opening(float side, float r) {
  vec2 ph = side < 0.0 ? uPhOpen.xy : uPhOpen.zw;
  float v = 0.6 * sin(ph.x + OPEN_K.x * r) + 0.4 * sin(ph.y + OPEN_K.y * r);
  return smoothstep(OPEN_FROM, OPEN_TO, v);
}

// how far from the centre line the trees begin
float clearing(float d, float r) { return CLEAR + MEADOW * opening(d, r); }

// Out in a clearing, where young trees have come up together: 0 on open grass, 1 in the middle of a grove.
// None stand close to the road.
float grove(float d, float r) {
  return smoothstep(0.60, 0.78, pnoise(vec2(d, r + uNoiseS) / 32.0 + vec2(3.1, 0.0), NOISE_P / 32.0)) * smoothstep(14.0, 30.0, abs(d));
}

// ── the land ──────────────────────────────────────────────

// Height above the road, at d across and r along. Flat under the road and its shoulders, a ditch, a floor,
// then a wall that steepens, breaks into spurs and gullies, and rounds off into a ridge.
float terrainH(float d, float r) {
  float a = max(abs(d) - SHOULDER, 0.0);
  float sw = r + uNoiseS;
  float n0 = pnoise(vec2(sign(d) * 7.0 + 0.5, sw / 2048.0), NOISE_P / 2048.0);   // each side on its own
  float n1 = pnoise(vec2(d / 700.0 + 9.1, sw / 1024.0), NOISE_P / 1024.0);
  float n2 = pnoise(vec2(d / 260.0 + 2.7, sw / 256.0), NOISE_P / 256.0);
  float n3 = pnoise(vec2(d / 64.0, sw / 64.0), NOISE_P / 64.0);

  float level = mix(45.0, 150.0, n0) + 0.9 * MEADOW * opening(d, r);   // half-width of the valley floor: wider where there is a meadow
  float steep = mix(0.65, 1.15, n1);
  float k = 45.0;                                                        // how gradually floor turns into wall
  float w = steep * k * (log(1.0 + exp((a - level) / k)) - log(1.0 + exp(-level / k)));
  w *= mix(1.0, 0.7 + 0.6 * n2, smoothstep(1.0, 3.0, uDetail));          // spurs and gullies, growing with the wall
  float top = mix(420.0, 640.0, n1);
  w = top * (1.0 - exp(-w / top)) * uRelief;                             // the wall rounds off into a ridge
  w += (n3 - 0.5) * 7.0 * smoothstep(8.0, 60.0, a) * smoothstep(3.0, 5.0, uDetail);   // the forest floor is never level
  w -= 0.7 * smoothstep(0.0, 2.0, a) * (1.0 - smoothstep(3.0, 9.0, a));  // the ditch beside the shoulder
  return w;
}

// Here and there the ridge that hides the sun is notched, and for a few hundred metres its last light
// comes all the way down to the valley floor: 1 in such a stretch, 0 elsewhere.
float sunGap(float r) {
  return min(uBeam, 1.0) * smoothstep(GAP_FROM, GAP_TO, 0.6 * sin(uPhGap.x + GAP_K.x * r) + 0.4 * sin(uPhGap.y + GAP_K.y * r));
}

// 0 in the valley's shadow, 1 where the last sun still reaches: anything that stands above a line which
// is lowest on the wall that faces the light, and which drops to the ground where the ridge is notched.
// What comes down through a notch is less than what the open slopes above get: it has further to come,
// through more air.
float lastLight(float d, float h, float r) {
  float above = h - uShadow.y * d;
  float open = smoothstep(-25.0, 45.0, above - uShadow.x);
  float notch = smoothstep(-25.0, 45.0, above - uShadow.x * (1.0 - 1.25 * sunGap(r)));
  return open + (notch - open) * BEAM_DIM;
}

// Light that low comes through whatever stands between it and here. Where that is forest, it arrives in
// thin streaks between the long shadows of the trees; where the forest stands back, broadly, with a shadow
// here and there. 1 in light, 0 in a shadow; p is a place in the scene. The shadows lie along the sun's
// bearing, so one number across them is enough to say which shadow a place is in.
float streaks(vec3 p) {
  float pattern = 0.5 + 0.5 * dot(BEAM_W, sin(uPhBeam + BEAM_K * dot(p.xz, uBeamDir)));
  float at = mix(0.62, 0.36, opening(uSunDir.x, -p.z));
  return smoothstep(at - 0.09, at + 0.09, pattern);
}

// High on the walls the forest is broken by avalanche paths: long strips of open ground straight down the
// fall line, a few dozen metres wide. 1 in one, 0 in the forest.
float chute(float d, float r) {
  float a = abs(d);
  if (a < 160.0) return 0.0;
  return smoothstep(0.70, 0.80, pnoise(vec2(d / 520.0 + 4.3, (r + uNoiseS) / 64.0), NOISE_P / 64.0)) * smoothstep(160.0, 260.0, a);
}

// How much of the sky a place on the valley floor can see between the two walls of forest, which, once the
// sun is off it, is all the light it has: nearly 1 out in the open, about half in the corridor where the
// trees stand close on both sides. Each wall is taken from where the trees are full grown, a little in from
// its edge, and as having gaps in it (CORRIDOR says how few).
float skyView(float d, float r) {
  vec2 x = max(vec2(clearing(-1.0, r) + d, clearing(1.0, r) - d), 0.0) + 8.0;
  vec2 low = x / sqrt(x * x + 35.0 * 35.0);          // for each wall: how much of that half of the sky it leaves
  return mix(1.0, 0.5 * (low.x + low.y), CORRIDOR);
}

// ── the air ───────────────────────────────────────────────

// the sky's colour right at the horizon, in the direction dir: warm toward where the sun went, cool away from it
vec3 horizonTint(vec3 dir) {
  float w = clamp(dot(normalize(dir.xz + vec2(1e-5)), normalize(uSunDir.xz)) * 0.5 + 0.5, 0.0, 1.0);
  return mix(uSkyCool, uSkyWarm, w * w * w);
}

vec3 skyGradient(vec3 dir) {
  return mix(horizonTint(dir), uSkyZenith, 1.0 - exp(-max(dir.y, 0.0) * uSkyFalloff));
}

// The same light, seen in the air: mist that is lit glows, most of all when looked at toward the sun.
// Along a line of sight the streaks are added up exactly (each is a sine, and what a sine comes to along a
// line is known). So looking along the beams they stand apart as shafts, and looking across them they
// merge into a glow, with nothing sampled and nothing to shimmer.
vec3 beamGlow(vec3 dir, float dist) {
  float reach = min(dist, 350.0);
  vec3 mid = cameraPosition + dir * reach * 0.5;
  float gap = sunGap(-mid.z);
  if (gap <= 0.0) return vec3(0.0);

  vec3 a = uPhBeam + BEAM_K * dot(cameraPosition.xz, uBeamDir);
  vec3 b = BEAM_K * dot(dir.xz, uBeamDir) * reach;
  vec3 mean = vec3(
    abs(b.x) < 1e-3 ? sin(a.x) : (cos(a.x) - cos(a.x + b.x)) / b.x,
    abs(b.y) < 1e-3 ? sin(a.y) : (cos(a.y) - cos(a.y + b.y)) / b.y,
    abs(b.z) < 1e-3 ? sin(a.z) : (cos(a.z) - cos(a.z + b.z)) / b.z);

  float through = mix(0.3, 0.75, opening(uSunDir.x, -mid.z));                 // how much gets past the trees at all
  float lit = clamp(through + 0.9 * dot(BEAM_W, mean), 0.0, 1.0);
  float low = exp(-max(mid.y - uRoadY, 0.0) / 50.0);                           // it is the mist on the valley floor that shows it
  // Mist sends light on mostly the way it was already going: looked at toward the sun it glows, looked at
  // across the light it hardly shows, and the air everywhere else keeps its cool.
  float toward = pow(max(dot(dir, uSunDir), 0.0), 6.0);
  return uSunWarm * (gap * lit * low * (1.0 - exp(-reach * BEAM_AIR)) * (0.06 + 0.94 * toward) * uBeam * BEAM_GLOW);
}

// The mist is not even: it lies in patches a hundred metres or so across, thicker over one meadow than the
// next, and they drift slowly across the valley. This says how much thicker or thinner than usual it is
// along a line of sight, taken at two places in the first few hundred metres, where mist is seen as mist
// rather than as distance. The patches are fixed to the land, not to the camera.
float mistPatches(vec3 dir, float dist) {
  float reach = min(dist, 450.0);
  vec3 a = cameraPosition + dir * reach * 0.3, b = cameraPosition + dir * reach * 0.75;
  vec2 drift = vec2(uClock * MIST_DRIFT, 0.0);
  float na = pnoise((vec2(a.x, uNoiseS - a.z) + drift) / MIST_CELL, NOISE_P / MIST_CELL);
  float nb = pnoise((vec2(b.x, uNoiseS - b.z) + drift) / MIST_CELL + vec2(5.2, 0.0), NOISE_P / MIST_CELL);
  return 0.3 + 1.4 * smoothstep(0.2, 0.8, 0.5 * (na + nb));
}

// Two kinds of air. Haze, everywhere and even. And a mist that lies on the valley floor and thins with
// height (integrated along the line of sight), in patches.
//
// They are not the same colour. Far air takes on nearly the sky's own colour: looked at through enough of
// it, a ridge fades into the sky behind it, lighter, not greyer, which is what makes distance read as
// distance. The mist down in the valley's shade has only the sky to light it, so it is a little dimmer and
// cooler than that. And haze in front of a slope still in the sun has some of the sun in it. What a pixel
// fades toward is the two colours in the proportion the two kinds of air are met along its line of sight.
vec3 applyFog(vec3 col, vec3 wpos) {
  vec3 v = wpos - cameraPosition;
  float dist = length(v);
  vec3 dir = v / max(dist, 1e-3);
  float t = uFog.z * v.y;
  float through = abs(t) > 1e-4 ? (1.0 - exp(-t)) / t : 1.0;
  float haze = dist * uFog.x;
  float mist = dist * uFog.y * exp(-uFog.z * (cameraPosition.y - uRoadY)) * through * mistPatches(dir, dist);
  float depth = haze + mist;

  vec3 sky = mix(horizonTint(dir), uSkyZenith, clamp(dir.y * 1.2, 0.0, 0.5));
  float upInLight = clamp((wpos.y - uRoadY - uShadow.x) / max(wpos.y - cameraPosition.y, 1.0), 0.0, 1.0);   // the share of the line of sight up above the valley's shadow
  vec3 hazeAir = sky * uHazeTint * (1.0 + uSunWarm * (0.35 * upInLight * (0.4 + 0.6 * max(dot(dir, uSunDir), 0.0))));
  vec3 air = (haze * hazeAir + mist * sky * uFogTint) / max(depth, 1e-6);
  return mix(col, air, 1.0 - exp(-depth)) + beamGlow(dir, dist);
}
`;
