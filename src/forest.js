// Afterglow — the trees, and what grows under them.
//
// At dusk a conifer is mostly its outline, with a little light left on the upper side of each bough. So
// that is what is made: eight plants are painted once onto a canvas (six kinds of conifer, a young fir, a
// shrub), bough by bough, each bough shading the ones beneath it; and every tree in the forest is three
// upright sheets, crossed, carrying one of those paintings. All of them go to the GPU in a single call.
//
// A painting holds three things besides its outline: how much light each part has (red), how far out
// along its bough it is (green: the tips are what the sky and the last sun still reach), and whether it is
// wood rather than needles (blue).
//
// (Stacked cones, the usual cheap tree, are what makes a scene look like a toy.)

import * as THREE from 'three';
import { config } from './config.js';
import { common, shared, num } from './glsl.js';

const { forest: F, colour: C, quality: Q, ground: G } = config;

// width: how much of its sheet the crown fills. crown: how far down the trunk the boughs go. whorls: tiers
// of boughs. droop: how far they hang. taper: below 1 the crown is full near the top, above 1 it is a spire.
// gaps: the chance a whole tier is missing. share: how common it is.
const KINDS = [
  { twig: 'fir', share: 0.24, width: 0.92, crown: 0.78, whorls: 30, droop: 0.30, taper: 0.72, gaps: 0.08 },                 // Douglas-fir: broad, irregular, bare at the foot
  { twig: 'fir', share: 0.20, width: 0.64, crown: 0.93, whorls: 44, droop: 0.48, taper: 0.95, gaps: 0.02 },                 // spruce: a spire, dressed to the ground
  { twig: 'fir', share: 0.16, width: 0.44, crown: 0.95, whorls: 50, droop: 0.30, taper: 1.05, gaps: 0.00 },                 // subalpine fir: narrower still
  { twig: 'fir', share: 0.12, width: 0.80, crown: 0.86, whorls: 34, droop: 0.70, taper: 0.66, gaps: 0.06 },                 // hemlock: every bough hanging
  { twig: 'pine', share: 0.08, width: 0.86, crown: 0.70, whorls: 22, droop: 0.42, taper: 0.58, gaps: 0.20, dead: 0.12 },   // an old pine: ragged, tiers gone, its top dead
  { twig: 'pine', share: 0.20, width: 0.56, crown: 0.40, whorls: 15, droop: 0.12, taper: 0.40, gaps: 0.08, tuft: true },     // lodgepole pine: a bare pole with a tuft at the top
  { twig: 'fir', share: 0.00, width: 0.90, crown: 0.97, whorls: 26, droop: 0.34, taper: 0.90, gaps: 0.00 },                 // a young fir, for the edge of a clearing
  { share: 0.00, shrub: true },                                                                                // a shrub
];
const YOUNG = 6, SHRUB = 7;
const ASPECT = 0.25;          // each painting is four times as tall as it is wide
const SHRUB_BROAD = 5;        // a shrub's sheet is this many times broader than a tree's: it is painted squeezed

// a small seeded generator: the same forest every visit
function mulberry32(a) {
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const unit = v => Math.round(255 * Math.min(1, Math.max(0, v)));
const ink = (light, tip, wood) => `rgb(${unit(light)},${unit(tip)},${wood ? 255 : 0})`;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ── photographs ───────────────────────────────────────────
//
// The needles and the bark are real: the twig and bark photographs that come with Poly Haven's "Fir Tree
// 01" and "Pine Tree 01" (CC0). The trees themselves are 8 and 17 million triangles each and cannot be
// brought to a web page; but a tree here is painted bough by bough, and each bough can be made of
// those photographed sprigs instead of drawn ones.
//
// Each sprig is cut out of its sheet (x, y, width, height in the 1k photograph; some lie on their side;
// the last number is where along its foot the stem stands) and kept in a few strengths of light, because
// a canvas cannot tint as it draws.
const TWIGS = {
  fir: { path: 'textures/fir_tree_01/fir_tree_01_', sprigs: [[190, 40, 250, 285], [665, 40, 300, 340], [310, 405, 350, 390], [645, 460, 335, 392], [500, 262, 148, 150]] },
  pine: { path: 'textures/pine_tree_01/pine_tree_01_', sprigs: [[35, 45, 190, 410], [665, 345, 295, 185, true, 0.72]] },
};
const LIGHTS = [0.22, 0.38, 0.55, 0.75, 1.0], TIPS = [0.15, 0.5, 0.9];
const nearest = (list, v) => list.reduce((best, x, i) => (Math.abs(x - v) < Math.abs(list[best] - v) ? i : best), 0);

const picture = url => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = url;
});

const pixels = img => {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx;
};

const luma = (data, i) => (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;

// One sprig, cut out, standing upright with its stem at the foot, in every strength of light it may be
// asked for. Only how light each needle is against the sprig's own average is kept from the photograph:
// the colour comes from the palette, like everything else at this hour.
function sprig(colour, cut, sideways, base = 0.5) {
  const { width: w, height: h } = colour;
  let total = 0, count = 0;
  for (let i = 0; i < w * h * 4; i += 4) if (cut.data[i] > 128) { total += luma(colour.data, i); count++; }
  const mean = total / Math.max(count, 1);

  const raw = document.createElement('canvas');
  raw.width = w;
  raw.height = h;
  const rawCtx = raw.getContext('2d');
  const out = rawCtx.createImageData(w, h);

  const tones = LIGHTS.map(light => TIPS.map(tip => {
    for (let i = 0; i < w * h * 4; i += 4) {
      out.data[i] = unit(light * 0.75 * Math.min(1.6, Math.max(0.35, luma(colour.data, i) / mean)));
      out.data[i + 1] = unit(tip);
      out.data[i + 2] = 0;
      out.data[i + 3] = cut.data[i];
    }
    rawCtx.putImageData(out, 0, 0);

    // half the photograph's size is still more than it is ever drawn at
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((sideways ? h : w) / 2);
    canvas.height = Math.round((sideways ? w : h) / 2);
    const ctx = canvas.getContext('2d');
    ctx.scale(0.5, 0.5);
    if (sideways) { ctx.translate(0, w); ctx.rotate(-Math.PI / 2); }       // it points right in the photograph: stood up
    ctx.drawImage(raw, 0, 0);
    return canvas;
  }));
  return { tones, base };
}

// a strip of bark, as wood: its own light and dark, marked as wood
function barkStrip(ctx) {
  const w = 256, h = 1024, colour = ctx.getImageData(0, 0, w, h);
  let total = 0;
  for (let i = 0; i < w * h * 4; i += 4) total += luma(colour.data, i);
  const mean = total / (w * h);
  for (let i = 0; i < w * h * 4; i += 4) {
    const l = unit(0.45 * Math.min(1.8, luma(colour.data, i) / mean));
    colour.data[i] = l; colour.data[i + 1] = 0; colour.data[i + 2] = 255; colour.data[i + 3] = 255;
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').putImageData(colour, 0, 0);
  return canvas;
}

async function loadStamps() {
  const stamps = {};
  for (const [name, spec] of Object.entries(TWIGS)) {
    const [colour, cut, bark] = (await Promise.all(['twig_diff', 'twig_alpha', 'bark_diff'].map(map => picture(`${spec.path}${map}_1k.jpg`)))).map(pixels);
    stamps[name] = {
      sprigs: spec.sprigs.map(([x, y, w, h, sideways, base]) => sprig(colour.getImageData(x, y, w, h), cut.getImageData(x, y, w, h), sideways, base)),
      bark: barkStrip(bark),
    };
  }
  return stamps;
}

// ── painting ──────────────────────────────────────────────

// One bough: first the shade it throws on whatever is already painted beneath it, then its own needles
// along a line that lifts a little and falls: photographed sprigs, each set out along the bough and hanging
// a little. (Without the photographs, drawn sprays instead: dark, with a paler upper edge.)
function bough(ctx, x, y, side, len, droop, light, plump, rnd, sprigs) {
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(x + side * len * 0.5, y + len * (droop * 0.5 + 0.2), len * 0.6, len * 0.22 + 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const tx = x + side * len, ty = y + len * droop;
  const mx = x + side * len * 0.55, my = y - len * 0.12;
  const n = Math.max(sprigs ? 2 : 3, Math.round(len / (sprigs ? 9 : 7)));
  for (let j = 0; j <= n; j++) {
    const u = j / n, v = 1 - u;
    const px = v * v * x + 2 * v * u * mx + u * u * tx;
    const py = v * v * y + 2 * v * u * my + u * u * ty;
    const lit = light * (0.55 + 0.45 * u) * (0.8 + 0.4 * rnd());       // the outer end of a bough has more sky

    if (sprigs) {
      const dx = 2 * v * (mx - x) + 2 * u * (tx - mx), dy = 2 * v * (my - y) + 2 * u * (ty - my);     // which way the bough is heading here
      const one = sprigs[Math.floor(rnd() * sprigs.length)];
      const tone = one.tones[nearest(LIGHTS, lit)][nearest(TIPS, u)];
      const long = (len * 0.3 * (1 - 0.45 * u) + 10) * (0.7 + 0.6 * rnd()) * plump;
      const wide = long * tone.width / tone.height;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2 + (rnd() - 0.5) * 1.1 + side * 0.25);
      if (rnd() < 0.5) ctx.scale(-1, 1);
      ctx.drawImage(tone, -wide * one.base, -long, wide, long);
      ctx.restore();
      continue;
    }

    const size = (len * 0.2 * (1 - 0.5 * u) + 4) * (0.6 + 0.8 * rnd()) * plump;
    const hang = size * (0.6 + 0.8 * rnd());
    ctx.fillStyle = ink(lit, u, false);
    ctx.beginPath();
    ctx.moveTo(px - side * size, py - size * 0.35);
    ctx.lineTo(px + side * size * 0.9, py);
    ctx.lineTo(px + side * size * (rnd() - 0.3) * 0.5, py + hang);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = ink(lit * 1.5 + 0.08, u, false);
    ctx.beginPath();
    ctx.moveTo(px - side * size, py - size * 0.35);
    ctx.lineTo(px + side * size * 0.9, py);
    ctx.lineTo(px + side * size * 0.1, py + size * 0.12);
    ctx.closePath();
    ctx.fill();
  }
}

// One conifer, in the cell of the canvas that starts at ox.
function paintConifer(ctx, ox, cw, ch, kind, rnd, stamps) {
  const sprigs = stamps ? stamps[kind.twig].sprigs : null;
  const cx = ox + cw / 2, top = ch * 0.01, tall = ch - top, half = cw / 2 * kind.width;
  const at = t => top + tall * (0.015 + t * (kind.crown - 0.015));               // t: 0 at the tip, 1 at the lowest bough
  const reach = kind.tuft
    ? t => half * (0.45 + 0.55 * Math.sin(Math.PI * Math.pow(t, 0.8)))
    : t => half * Math.pow(t, kind.taper) * (1 - 0.3 * smooth(0.8, 1, t));

  // every bough is decided first, so that they can be painted in order: those behind the trunk, the trunk,
  // those in front; and within each, from the lowest up, so that each shades what is under it
  const boughs = [];
  for (let whorl = 0; whorl < kind.whorls; whorl++) {
    if (rnd() < kind.gaps) continue;                                             // a whole tier gone
    const count = 5 + Math.floor(rnd() * 4);
    for (let i = 0; i < count; i++) {
      const t = Math.min(1, Math.max(0.005, (whorl + 0.5 + (rnd() - 0.5) * 1.6) / kind.whorls));     // tiers, but not ruled ones
      if (kind.dead && t < kind.dead) continue;                                  // nothing grows on a dead top
      const behind = rnd() < 0.4;
      boughs.push({
        t, behind,
        side: (i + whorl) % 2 ? 1 : -1,
        len: reach(t) * (0.5 + 0.5 * rnd()) + 3,
        droop: kind.droop * (0.2 + 0.9 * t) * (0.6 + 0.8 * rnd()),               // the lower the bough, the more it hangs
        light: behind ? 0.22 + 0.2 * rnd() : 0.5 + 0.5 * rnd(),
      });
    }
  }
  boughs.sort((a, b) => b.t - a.t);
  const paint = which => {
    for (const b of boughs) if (b.behind === which) bough(ctx, cx, at(b.t), b.side, b.len, b.droop, b.light, kind.tuft ? 1.5 : 1, rnd, sprigs);
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, 0, cw, ch);
  ctx.clip();

  // the trunk, and the stubs of the boughs it has shed. It goes down first: inside the crown a trunk is
  // hidden by its own needles, and shows only below them and where a tier is missing
  const tw = cw * 0.03;
  ctx.fillStyle = ink(0.45, 0, true);
  ctx.beginPath();
  ctx.moveTo(cx - tw, ch);
  ctx.lineTo(cx - tw * 0.55, at(1));
  ctx.lineTo(cx - 1.2, at(0.05));
  ctx.lineTo(cx, top);
  ctx.lineTo(cx + 1.2, at(0.05));
  ctx.lineTo(cx + tw * 0.55, at(1));
  ctx.lineTo(cx + tw, ch);
  ctx.fill();
  if (stamps) {
    // photographed bark, kept inside the trunk just drawn
    const bark = stamps[kind.twig].bark, bw = tw * 2.4, bh = bw * 4;
    ctx.save();
    ctx.clip();
    for (let y = ch - bh; y > top - bh; y -= bh) ctx.drawImage(bark, cx - bw / 2, y, bw, bh);
    ctx.restore();
  }
  ctx.strokeStyle = ink(0.4, 0, true);
  for (let i = 0; i < 9; i++) {
    const y = at(1) + (ch - at(1)) * rnd() * 0.85, side = rnd() < 0.5 ? -1 : 1, len = half * (0.08 + 0.25 * rnd());
    ctx.lineWidth = 1 + cw * 0.004 * rnd();
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx + side * len, y + len * (0.1 + 0.4 * rnd()));
    ctx.stroke();
  }

  // the heart of the crown: dense, dark, and close about the trunk, so that no daylight shows through there
  const from = kind.dead || 0;
  ctx.fillStyle = ink(0.16, 0, false);
  ctx.beginPath();
  ctx.moveTo(cx, at(from));
  for (let i = 0; i <= 48; i++) { const t = from + (1 - from) * i / 48; ctx.lineTo(cx + reach(t) * (0.3 + 0.25 * rnd()), at(t)); }
  for (let i = 48; i >= 0; i--) { const t = from + (1 - from) * i / 48; ctx.lineTo(cx - reach(t) * (0.3 + 0.25 * rnd()), at(t)); }
  ctx.fill();

  paint(true);
  paint(false);

  // the leader, unless the top is dead
  if (!kind.dead) {
    ctx.fillStyle = ink(0.7, 1, false);
    ctx.beginPath();
    ctx.moveTo(cx - cw * 0.008, at(0.04));
    ctx.lineTo(cx, top);
    ctx.lineTo(cx + cw * 0.008, at(0.04));
    ctx.fill();
  }

  ctx.restore();
}

// A shrub: a dome of leaf clumps on a few stems, the upper ones lighter. Painted five times too narrow,
// because its sheet is five times as broad as a tree's.
function paintShrub(ctx, ox, cw, ch, rnd) {
  const cx = ox + cw / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, 0, cw, ch);
  ctx.clip();

  ctx.strokeStyle = ink(0.4, 0, true);
  for (let i = 0; i < 7; i++) {
    ctx.lineWidth = 1 + cw * 0.004;
    ctx.beginPath();
    ctx.moveTo(cx + (rnd() - 0.5) * cw * 0.1, ch);
    ctx.quadraticCurveTo(cx + (rnd() - 0.5) * cw * 0.5, ch * 0.7, cx + (rnd() - 0.5) * cw * 0.8, ch * (0.25 + 0.3 * rnd()));
    ctx.stroke();
  }

  const clumps = [];
  for (let i = 0; i < 150; i++) {
    const a = Math.PI * rnd(), rho = Math.sqrt(rnd());
    clumps.push({ x: cx + Math.cos(a) * rho * cw * 0.45, y: ch - Math.sin(a) * rho * ch * 0.93 * (0.75 + 0.25 * rnd()) - ch * 0.02 });
  }
  clumps.sort((p, q) => q.y - p.y);
  for (const { x, y } of clumps) {
    const up = 1 - y / ch;
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y + ch * 0.05, cw * 0.07, ch * 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    for (let j = 0; j < 5; j++) {
      const k = 0.4 + 0.7 * rnd();
      ctx.fillStyle = ink((0.3 + 0.6 * up) * (0.75 + 0.5 * rnd()), up, false);
      ctx.beginPath();
      ctx.ellipse(x + (rnd() - 0.5) * cw * 0.07, y + (rnd() - 0.5) * ch * 0.07, cw * 0.028 * k, ch * 0.034 * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// The eight paintings, side by side, onto the canvas given. With the photographs if they came, drawn if not.
function paintAtlas(canvas, stamps) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const rnd = mulberry32(F.seed);
  const cw = canvas.width / KINDS.length, ch = canvas.height;
  KINDS.forEach((kind, i) => (kind.shrub ? paintShrub(ctx, i * cw, cw, ch, rnd) : paintConifer(ctx, i * cw, cw, ch, kind, rnd, stamps)));
  return canvas;
}

function blank() {
  const canvas = document.createElement('canvas');
  canvas.width = F.atlas;
  canvas.height = F.atlas / 2;
  return canvas;
}

// for the workbench (index.html?atlas): the canvas by itself, once it is painted
export const paintedAtlas = () => loadStamps().catch(() => null).then(stamps => paintAtlas(blank(), stamps));

const vertexShader = /* glsl */`
${common}

attribute vec4 aTree;     // across the road (for undergrowth: how far inside the treeline), along it, height, turn
attribute vec3 aLook;     // which painting, how broad, how dark

uniform float uTreeS;     // where the origin is in the forest's repeat
uniform float uTreeScale; // every tree this much taller or shorter

varying vec2 vUv;
varying vec2 vMetres;     // where on the sheet, in metres: for grain that stays the same size on every tree
varying vec3 vWorld;
varying float vUp;
varying float vLit;
varying float vTint;
varying float vAcross;    // how far across the crown, as the camera sees it: -1 its left edge, 1 its right
varying vec3 vSunAt;      // the sun as the camera sees this tree: how far to its right, how far toward the camera, how high

const float LENGTH = ${num(F.length)};
const float BACK = ${num(F.back)};
const float ASPECT = ${num(ASPECT)};
const float KINDS = ${num(KINDS.length)};
const float SHRUB = ${num(SHRUB)};

void main() {
  // The forest is planted once along LENGTH metres of road. A tree that falls behind the camera comes
  // round again at the far end, where a road that has since bent somewhere new cuts through it differently.
  float r = mod(aTree.y - uTreeS, LENGTH) - BACK;
  float side = sign(aTree.x);

  // A tree stands where it was planted, and is left out where that turns out to be road or verge.
  // Undergrowth has no place of its own: some of it keeps to the edge of the forest, wherever the edge is
  // here, and some is scattered over whatever open ground there is between the road and that edge.
  float edge = clearing(side, r);
  float code = abs(aTree.x);
  bool under = aLook.x > SHRUB - 0.5;
  bool loose = under && code > 150.0;
  float d = !under ? aTree.x : loose ? side * mix(SHOULDER + 2.5, edge - 1.0, code - 200.0) : side * (edge + code - 50.0);

  float grown;
  if (loose) {
    grown = smoothstep(0.15, 0.5, opening(side, r));                     // only where there is a clearing to be scattered over
  } else if (under) {
    grown = step(SHOULDER + 0.8, abs(d));
  } else {
    // In the forest every tree stands, the ones at its edge younger. Out in a clearing most are left out,
    // but not all: young ones come up in groves, and here and there one stands alone. An empty meadow is
    // a lawn; this is what makes it a valley floor.
    float inForest = smoothstep(-2.0, 16.0, abs(d) - edge);
    float luck = fract(aTree.w * 43.37 + aTree.y * 0.731);
    float inGrove = grove(d, r) * (0.3 + 0.45 * luck);
    float alone = step(0.97, luck) * step(16.0, abs(d)) * (0.45 + 0.4 * fract(luck * 7.0));
    grown = max(inForest, max(inGrove, alone));
    grown *= 1.0 - chute(d, r);                                          // and high up, none in an avalanche path
  }
  grown *= 1.0 - smoothstep(LENGTH - BACK - 250.0, LENGTH - BACK, r);                                     // and the furthest rise out of the haze rather than appear
  float tall = grown < 0.25 ? 0.0 : aTree.z * grown * uTreeScale;

  float ground = terrainH(d, r);
  vec3 foot = roadToWorld(d, r, ground - (under ? 0.1 : 0.5));
  float c = cos(aTree.w), s = sin(aTree.w);
  vec3 q = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c);
  float wide = tall * ASPECT * aLook.y;
  vec3 wp = foot + vec3(q.x * wide, q.y * tall, q.z * wide);

  vUv = vec2((aLook.x + mix(0.01, 0.99, uv.x)) / KINDS, uv.y);
  vMetres = vec2(uv.x * wide, uv.y * tall) + aTree.w * 7.0;
  vUp = uv.y;
  // lit if it stands above the valley's shadow. Which side of it, the fragment works out from these two:
  // a crown seen from the camera is turned toward its right at its right edge, toward the camera in the
  // middle; so where across it a point is, and where the sun is from here, say how squarely it faces the sun.
  vLit = lastLight(d, ground + uv.y * tall, r) * mix(0.55, 1.0, fract(aTree.w * 91.7));     // its neighbours keep more of it from some than from others
  vec2 back = normalize(cameraPosition.xz - foot.xz + vec2(1e-3, 0.0));     // level, toward the camera
  vec2 right = vec2(back.y, -back.x);                                        // level, to the camera's right
  vAcross = dot(wp.xz - foot.xz, right) / max(0.5 * wide, 1e-3);
  vSunAt = vec3(dot(uSunDir.xz, right), dot(uSunDir.xz, back), uSunDir.y);
  vTint = aLook.z;
  vWorld = wp;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const fragmentShader = /* glsl */`
${common}

uniform sampler2D uAtlas;
uniform vec3 uTree;
uniform vec3 uBark;
uniform vec3 uForestLit;

varying vec2 vUv;
varying vec2 vMetres;
varying vec3 vWorld;
varying float vUp;
varying float vLit;
varying float vTint;
varying float vAcross;
varying vec3 vSunAt;

const vec2 ATLAS = vec2(${num(F.atlas)}, ${num(F.atlas / 2)});

void main() {
  vec4 paint = texture2D(uAtlas, vUv);

  // how far the painting is from its own size on screen: above 0 it is being shrunk, below 0 enlarged
  vec2 texel = vUv * ATLAS;
  float scale = 0.5 * log2(max(dot(dFdx(texel), dFdx(texel)), dot(dFdy(texel), dFdy(texel))));

  // A painting seen from far off is averaged thinner than the tree it shows; give some of that back.
  float a = paint.a * (1.0 + 0.2 * clamp(scale, 0.0, 5.0));

  // Seen from closer than it was painted for, its edge would go soft and round. Needles are put back: a
  // fine grain, drawn out downward the way twigs hang, that eats into the edge and stipples the inside.
  float close = clamp(-scale * 0.6, 0.0, 1.0);
  float needles = 0.6 * vnoise(vMetres * vec2(38.0, 14.0)) + 0.4 * vnoise(vMetres * vec2(110.0, 40.0));
  a += (needles - 0.5) * 2.8 * close * a * (1.0 - a);

  // Then make the outline exactly one pixel soft, however close the tree is. With MSAA that softness
  // becomes how many samples of the pixel the tree covers, so no sorting and no blending are needed.
  a = clamp((a - 0.5) / max(fwidth(a), 1e-3) + 0.5, 0.0, 1.0);
  if (a < ${Q.samples > 0 ? '0.02' : '0.5'}) discard;

  float light = paint.r * (1.0 + (needles - 0.5) * 0.6 * close), tip = paint.g, wood = paint.b;
  vec3 leaf = uTree * (0.3 + 1.5 * light) * vTint * mix(0.6, 1.25, vUp * vUp);     // the tops still have the sky; the feet do not
  leaf += uSkyZenith * 0.05 * light * tip * (0.3 + 0.7 * vUp);                     // and the outer needles most of all
  vec3 col = mix(leaf, uBark * (0.5 + 1.2 * light), wood) * SKYLIGHT;          // what the sky gives it: a little blue

  // A top that reaches above the valley's shadow has the sun (low down, where the light has come through
  // other trees to get here, it arrives in streaks). It does not colour the tree. A sun this low lights the
  // side of the crown that faces it and leaves the rest as dark as it was; and on that side only the needles
  // on the outside of the outer boughs, not the dark heart behind them. The crown is taken as round and
  // narrowing to its tip. From behind, the sun gives a tree nothing but a bright edge.
  float lit = vLit * mix(streaks(vWorld), 1.0, smoothstep(25.0, 70.0, vWorld.y - uRoadY));
  float s = clamp(vAcross / max(0.8 - 0.65 * vUp, 0.15), -1.0, 1.0);
  float facing = 0.94 * (s * vSunAt.x + sqrt(1.0 - s * s) * vSunAt.y + 0.35 * vSunAt.z);
  float dapple = smoothstep(0.25, 0.65, vnoise(vec2(vAcross * 1.6 + vTint * 37.0, vWorld.y * 0.14)));   // and their shadows fall across it in patches
  float sun = lit * mix(0.3, 1.0, dapple) * smoothstep(-0.15, 0.55, facing) * smoothstep(0.2, 0.7, light) * mix(0.45, 1.0, tip);
  col += uForestLit * mix(vec3(1.0), uSunWarm * 1.3, 0.5) * uBright * (0.9 + 1.2 * light) * sun * (1.0 - 0.5 * wood);   // gold, not green
  gl_FragColor = vec4(applyFog(col, vWorld), a);
}
`;

// three sheets crossed at sixty degrees, one unit wide and one unit tall, standing on the origin
function sheets() {
  const position = [], uv = [], index = [];
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI / 3, x = 0.5 * Math.cos(a), z = 0.5 * Math.sin(a), o = i * 4;
    position.push(-x, 0, -z, x, 0, z, x, 1, z, -x, 1, -z);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    index.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  return geometry;
}

// Where each plant stands, in road space. Trees thick beside the road, thinning up the slopes, where the
// ground under them is painted as canopy and they are only its broken outline. Undergrowth along the edge
// of the forest, where there is light for it. They are mixed in one list, so that thinning the forest
// (the panel's Forest) thins all of it alike.
function plant(geometry) {
  const rnd = mulberry32(F.seed + 1);
  const slope = Math.round(F.slope * (window.matchMedia('(max-width: 44rem)').matches ? 0.5 : 1));
  const total = F.count + slope + F.undergrowth + F.loose;
  const tree = new Float32Array(total * 4);
  const look = new Float32Array(total * 3);

  for (let i = 0; i < total; i++) {
    const side = rnd() < 0.5 ? -1 : 1;

    const pick = rnd() * total;
    if (pick < F.loose) {
      // scattered over open ground: the fraction is how far out from the road toward the trees
      tree.set([side * (200 + Math.pow(rnd(), 0.8)), rnd() * F.length, 0.6 + 1.6 * rnd() * rnd(), rnd() * Math.PI], i * 4);
      look.set([SHRUB, SHRUB_BROAD * (0.6 + 0.4 * rnd()), 0.9 + 0.5 * rnd()], i * 3);
      continue;
    }
    if (pick < F.loose + F.undergrowth) {
      const inside = -1 + 9 * Math.pow(rnd(), 1.2);                 // metres inside the treeline; a few stand just in front of it
      tree.set([side * (inside + 50), rnd() * F.length, 0.7 + 1.9 * rnd() * rnd(), rnd() * Math.PI], i * 4);
      look.set([SHRUB, SHRUB_BROAD * (0.6 + 0.35 * rnd()), 0.9 + 0.5 * rnd()], i * 3);
      continue;
    }
    if (pick < F.loose + F.undergrowth + slope) {
      // the walls of the valley: grown trees, spread as thickly high up as low down, so that a slope seen
      // from across the valley is forest and not a lawn with trees on it
      let kind = 0;
      for (let k = rnd(); kind < YOUNG - 1 && k > KINDS[kind].share; kind++) k -= KINDS[kind].share;
      const across = config.path.clear + F.band + (F.reach - F.band) * rnd();
      tree.set([side * across, rnd() * F.length, 24 + 18 * rnd(), rnd() * Math.PI], i * 4);
      look.set([kind, 0.9 + 0.4 * rnd(), 0.75 + 0.5 * rnd()], i * 3);
      continue;
    }

    const near = rnd() < F.nearShare;
    let kind = 0;
    for (let pick = rnd(); kind < YOUNG - 1 && pick > KINDS[kind].share; kind++) pick -= KINDS[kind].share;
    let height = near ? 20 + 24 * Math.pow(rnd(), 1.2) : 28 + 20 * rnd();
    if (near && rnd() < 0.2) { kind = YOUNG; height = 5 + 9 * rnd(); }

    const u = rnd();
    const across = near
      ? config.path.clear + 1 + F.band * Math.pow(u, 1.35)
      : config.path.clear + F.band + (F.reach - F.band) * Math.pow(u, 1.5);
    tree.set([side * across, rnd() * F.length, height, rnd() * Math.PI], i * 4);
    look.set([kind, 0.9 + 0.4 * rnd(), 0.75 + 0.5 * rnd()], i * 3);
  }

  geometry.setAttribute('aTree', new THREE.InstancedBufferAttribute(tree, 4));
  geometry.setAttribute('aLook', new THREE.InstancedBufferAttribute(look, 3));
  geometry.instanceCount = total;
  return total;
}

export function createForest() {
  // The canvas is empty until the photographs of twig and bark have come and the trees are painted from
  // them (or, if they never come, drawn without them). The first frame waits for that.
  const canvas = blank();
  const atlas = new THREE.CanvasTexture(canvas);
  const ready = loadStamps().catch(() => null).then(stamps => { paintAtlas(canvas, stamps); atlas.needsUpdate = true; });
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.anisotropy = 4;

  const uniforms = {
    ...shared,
    uTreeS: { value: 0 },
    uTreeScale: { value: 1 },
    uAtlas: { value: atlas },
    uTree: { value: new THREE.Color(C.tree) },
    uBark: { value: new THREE.Color(C.bark) },
    uForestLit: { value: new THREE.Color(C.forestLit) },
  };

  const geometry = sheets();
  const total = plant(geometry);
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, side: THREE.DoubleSide, alphaToCoverage: Q.samples > 0 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  return { mesh, uniforms, total, ready };
}
