// Afterglow — where the road goes. The same sums are written again in GLSL (glsl.js), where the land,
// the trees and the paint all follow them; here they are for the camera.

import { config } from './config.js';

const TAU = Math.PI * 2;
const P = config.path;
const wavenumbers = wave => wave.map(w => TAU / w);

export const KX = wavenumbers(P.x.wave);
export const KY = wavenumbers(P.y.wave);
export const KO = wavenumbers(P.open.wave);
export const KG = wavenumbers(P.gap.wave);

const sum = (part, k, s, fn) => part.amp.reduce((t, a, i) => t + a * fn(k[i] * s + part.phase[i], k[i]), 0);

// s is metres travelled down the valley. X is sideways, Y is height; D is the slope of each.
export const roadX = s => P.bend * sum(P.x, KX, s, a => Math.sin(a));
export const roadDX = s => P.bend * sum(P.x, KX, s, (a, k) => k * Math.cos(a));
export const roadY = s => sum(P.y, KY, s, a => Math.sin(a));
export const roadDY = s => sum(P.y, KY, s, (a, k) => k * Math.cos(a));

// A point `d` metres right of the centre line and `lift` above the asphalt, as a place in the scene.
// The scene is drawn around `origin` rather than around zero, so its numbers stay small however far the road has run.
// (`d` is laid out sideways and widened by the road's slant, which keeps the road its true width on a diagonal.)
export function roadPoint(s, d, lift, origin, out) {
  const dx = roadDX(s);
  return out.set(roadX(s) + d * Math.sqrt(1 + dx * dx), roadY(s) + lift, origin - s);
}

// 0 where the forest stands at the roadside, 1 where it has drawn back. side: -1 left, +1 right.
export function opening(side, s) {
  const ph = side < 0 ? P.open.left : P.open.right;
  const v = 0.6 * Math.sin(KO[0] * s + ph[0]) + 0.4 * Math.sin(KO[1] * s + ph[1]);
  const t = Math.min(1, Math.max(0, (v - P.open.from) / (P.open.to - P.open.from)));
  return t * t * (3 - 2 * t);
}

// The phase each wave has reached at `s`, wound back into one turn. The GPU counts on from here in
// single precision, which is exact enough over a few kilometres and not over a few hundred.
export const phasesAt = (k, phase, s) => k.map((kk, i) => (kk * s + phase[i]) % TAU);
