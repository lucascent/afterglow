// Afterglow — a road through a mountain valley, after the sun has gone.
//
// This file only keeps time: it moves a point down the road, tells the GPU where that point is, and
// draws. What is drawn is in the files beside it:
//
//   config.js   every number worth turning
//   path.js     where the road goes (for the camera)
//   glsl.js     the same road, the land and the air, for the GPU; shared by everything below
//   maps.js     fetching the photographs that are laid on the asphalt, the grass and the far rock
//   range.js    the far range: real mountains, worked out once into a picture of the horizon
//   sky.js      sky, clouds, and that picture lit: painted
//   ground.js   the valley and the road on it: built. The asphalt's surface is a photograph (textures/)
//   forest.js   the trees, and the shrubs at their feet
//   verge.js    the grass that stands up
//   posts.js    the marker posts at the road's edge
//   film.js     grade, dark corners, grain
//   tune.js     the panel that turns all of the above while it runs
//
// For looking at one place: ?s=1200 starts 1200 m down the road, ?still holds the camera there.
// ?tune opens the panel straight away. ?atlas shows the painted trees and grass by themselves, for working on them.

import * as THREE from 'three';
import { config } from './config.js';
import { KX, KY, KO, KG, roadDX, roadDY, roadY, roadPoint, opening, phasesAt } from './path.js';
import { shared } from './glsl.js';
import { createRange } from './range.js';
import { createSky } from './sky.js';
import { createGround } from './ground.js';
import { createForest, paintedAtlas } from './forest.js';
import { createVerge, paintTufts } from './verge.js';
import { createPosts } from './posts.js';
import { createFilm } from './film.js';
import { createTune } from './tune.js';

const { camera: C, path: P, ground: G, forest: F, quality: Q, surface: S, verge: V, light: L } = config;
const TAU = Math.PI * 2;
const rad = deg => deg * Math.PI / 180;

const canvas = document.getElementById('road');
const query = new URLSearchParams(location.search);
const still = query.has('still') || matchMedia('(prefers-reduced-motion: reduce)').matches;

// The first thing seen should be the valley, not a wall of trees: begin where the road runs straight
// toward the far range and the forest is about to stand back from it.
function findStart() {
  for (let s = 0; s < 20000; s += 20) {
    const open = Math.max(Math.min(opening(-1, s + 220), opening(-1, s + 340)), Math.min(opening(1, s + 220), opening(1, s + 340)));
    if (open > 0.95 && Math.abs(roadDX(s)) < 0.15 && Math.abs(roadDX(s + 150)) < 0.15) return s;
  }
  return 0;
}

// The workbench: the paintings every tree and tuft is cut from, laid out flat on grey. Red is light, green
// is how far out along the bough, blue is wood; nothing here is the colour it will be in the picture.
async function workbench() {
  document.body.replaceChildren(...[await paintedAtlas(), paintTufts()].map(sheet => {
    Object.assign(sheet.style, { display: 'block', width: '100%', background: '#777', marginBottom: '1rem' });
    return sheet;
  }));
  document.body.style.overflow = 'auto';
}

function begin() {
  if (query.has('atlas')) return workbench();

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  } catch (error) {
    document.getElementById('road-none').hidden = false;
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(C.fov, 1, C.near, C.far);
  const range = createRange(renderer);
  const sky = createSky(range);
  const ground = createGround(renderer.capabilities.getMaxAnisotropy());
  const forest = createForest();
  const verge = createVerge();
  const posts = createPosts();
  scene.add(ground.mesh, forest.mesh, verge.mesh, posts.mesh, sky.mesh);

  // The scene is drawn off screen, in light as it is counted, then handed to the film. Half floats keep
  // the dark end of the picture from breaking into steps; MSAA is what the trees' edges are made of.
  // The depth is only for drawing the scene: the film reads nothing but colour, so when the MSAA picture
  // is resolved into one the film can read, the depth is not copied out with it.
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: renderer.extensions.has('EXT_color_buffer_float') ? THREE.HalfFloatType : THREE.UnsignedByteType,
    samples: Q.samples,
    depthBuffer: true,
    resolveDepthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: true,                       // its smaller copies are what the film's bloom is made from
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const film = createFilm(target);

  const opening_ = findStart();
  const start = query.has('s') ? Number(query.get('s')) || 0 : opening_;
  // the first gap in the ridge is a little way ahead of the start: the drive begins in shade and comes into the light
  P.gap.phase = KG.map(k => Math.PI / 2 - k * (opening_ + 450));

  let s = start;                 // metres travelled
  let origin = NaN;
  let scale = 1;                 // share of the screen's own pixels that are drawn
  let manual = false;            // once the panel has set that share, the machine stops adjusting it
  let held = false;              // the panel's Hold: the picture runs, the camera stays
  let baseFov = C.fov;
  const near = new THREE.Vector3(), far = new THREE.Vector3(), gaze = new THREE.Vector3(), size = new THREE.Vector2();

  // Put the camera at s, and tell the shaders where that is.
  function place() {
    // The scene is drawn around an origin that follows the camera in whole steps of the grid. Each time it
    // steps, every shader is told where it now is in each of the cycles it counts in.
    const o = Math.floor(s / G.snap) * G.snap;
    if (o !== origin) {
      origin = o;
      shared.uPhX.value.fromArray(phasesAt(KX, P.x.phase, o));
      shared.uPhY.value.fromArray(phasesAt(KY, P.y.phase, o));
      shared.uPhOpen.value.fromArray([...phasesAt(KO, P.open.left, o), ...phasesAt(KO, P.open.right, o)]);
      shared.uNoiseS.value = o % G.repeat;
      shared.uPhGap.value.fromArray(phasesAt(KG, P.gap.phase, o).map(v => ((v % TAU) + TAU) % TAU));
      // the shadows are fixed to the land, not to the origin: as it steps along the road, their phase steps back
      shared.uPhBeam.value.fromArray(L.beam.shadows.map((w, i) => (((L.beam.phase[i] - TAU / w * o * shared.uBeamDir.value.y) % TAU) + TAU) % TAU));
      ground.uniforms.uMarkS.value = o % 12;
      ground.uniforms.uTileS.value = o % S.tile;
      forest.uniforms.uTreeS.value = (((o - F.back) % F.length) + F.length) % F.length;
      verge.uniforms.uTuftS.value = (((o - V.back) % V.length) + V.length) % V.length;
      posts.uniforms.uPostS.value = (((o - posts.back) % posts.length) + posts.length) % posts.length;
    }
    shared.uRoadY.value = roadY(s);

    // The camera rides the middle of its lane and looks at the road ahead. The road is smooth all the way
    // down, so the gaze is too: it swings into a bend ahead of the camera, and nothing in it can shake.
    roadPoint(s, C.lane, C.height, origin, camera.position);
    roadPoint(s + C.lookNear, C.lane, C.height, origin, near);
    roadPoint(s + C.lookFar, C.lane, C.height, origin, far);
    gaze.lerpVectors(near, far, 0.4);
    gaze.y += Math.tan(rad(C.pitch)) * Math.hypot(gaze.x - camera.position.x, gaze.z - camera.position.z);
    camera.lookAt(gaze);

    // the painted ranges slide a little as the camera crosses the valley: least for the furthest
    const x = camera.position.x;
    sky.uniforms.uDrift.value.set(x / 22000, x / 9000, x / 5000);
  }

  function draw(seconds, dt = 0) {
    sky.uniforms.uTime.value = seconds;
    shared.uClock.value = seconds;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    film.render(renderer, seconds, dt);
  }

  // a picture that is being held still has to be asked to draw itself again when something changes
  function refresh() {
    if (still) { place(); draw(0); }
  }

  // the lens: what the screen's shape asks for, narrowed or widened by the panel
  function lens() {
    camera.fov = 2 * Math.atan(Math.tan(rad(baseFov) / 2) / C.zoom) / rad(1);
    camera.updateProjectionMatrix();
    refresh();
  }

  function resize() {
    const w = Math.max(1, canvas.clientWidth || window.innerWidth), h = Math.max(1, canvas.clientHeight || window.innerHeight);   // a window folded away to nothing still gets one pixel
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.maxDpr) * scale);
    renderer.setSize(w, h, false);
    renderer.getDrawingBufferSize(size);
    target.setSize(size.x, size.y);
    film.setSize(size.x, size.y);

    // a tall screen would see only a slit of the valley through this lens, so there it is widened
    camera.aspect = w / h;
    const across = 2 * Math.atan(Math.tan(rad(C.fov) / 2) * camera.aspect);
    baseFov = across >= rad(C.minAcross) ? C.fov
      : Math.min(C.maxFov, 2 * Math.atan(Math.tan(rad(C.minAcross) / 2) / camera.aspect) / rad(1));
    lens();
  }

  // The far range is worked out again a moment after its shape was last changed, not at every twitch of a slider.
  let reshaping = 0;
  function reshape() {
    clearTimeout(reshaping);
    reshaping = setTimeout(() => { if (range.bake()) refresh(); }, 120);
  }

  // when the sun is moved the shadows swing with it, and have to be told where they now lie
  function rephase() {
    origin = NaN;
    refresh();
  }

  // from the beginning again, up out of the dark
  function replay() {
    s = start;
    canvas.style.transition = 'none';
    document.documentElement.classList.remove('is-arrived');
    void canvas.offsetWidth;                             // the dark has to take before the fade is asked for again
    canvas.style.transition = '';
    refresh();
    requestAnimationFrame(() => document.documentElement.classList.add('is-arrived'));
  }

  let raf = 0, last = 0, frames = 0, spent = 0, settled = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1);       // a stalled tab does not get to leap forward
    last = now;

    // the same speed over the ground, whichever way the road is slanting
    if (!held) s += config.speed * dt / Math.hypot(1, roadDX(s), roadDY(s));
    place();
    ground.tick(dt);
    sky.tick(dt);
    draw(now / 1000, dt);

    // If the machine cannot keep up, draw a smaller picture rather than a stuttering one. It only ever
    // goes down: a picture that kept changing its mind about its size would be worse than either.
    if (now > settled && !manual) {
      frames++; spent += dt;
      if (frames === 120) {
        if (spent / frames > 1 / 42 && scale > Q.minScale) { scale = Math.max(Q.minScale, scale * 0.82); resize(); }
        frames = 0; spent = 0;
      }
    }
  }

  function run() {
    cancelAnimationFrame(raf);
    if (still || document.hidden) return;
    last = performance.now();
    settled = last + 1500;                               // the first moments are spent compiling shaders: not counted
    frames = 0; spent = 0;
    raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', run);    // nobody is watching a hidden tab

  // The panel is handed only what it may reach. Making it also puts back whatever was set before.
  createTune({
    sky, ground, forest, verge, film, lens, refresh, replay, reshape, rephase,
    setScale(value) { scale = value; manual = true; resize(); },
    hold(value) { held = value; },
  });

  // The first frame waits for the trees to be painted (which waits for the photographs of twig and bark),
  // but not for ever: after three seconds the road is shown, and the trees come when they come.
  let begun = false;
  function open() {
    if (begun) return;
    begun = true;
    resize();
    range.bake();                // before the first frame, while the page is still dark
    place();
    draw(0);
    run();
    if (still) Promise.all([ground.surface, sky.stone]).then(() => { ground.tick(Infinity); sky.tick(Infinity); draw(0); });   // a held picture gets its photographs in one step
    requestAnimationFrame(() => document.documentElement.classList.add('is-arrived'));
  }
  forest.ready.then(() => (begun ? refresh() : open()));
  setTimeout(open, 3000);
}

begin();
