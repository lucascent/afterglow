// Afterglow — what the film does to the picture once it is drawn: one pass over the whole screen for
// the glow round bright things, the grade, the dark corners and the grain. Before it, if asked, a little of
// the frame before is left in (trails).
//
// The scene is drawn in light as it is counted, and where the last sun falls that can be more than white.
// The film keeps it: what is brighter than white is rounded off toward white instead of cut flat at it, and
// only that much brightness spills into its surroundings.

import * as THREE from 'three';
import { config } from './config.js';
import { hash, num } from './glsl.js';

const F = config.film;

const vertexShader = /* glsl */`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */`
uniform sampler2D tScene;
uniform sampler2D tGlow;      // the same picture, kept with its smaller copies
uniform vec2 uRes;
uniform float uTime;
uniform float uBloom;
uniform float uBloomAt;
uniform float uExposure;
uniform float uHue;
uniform float uWarmth;
uniform float uSaturation;
uniform float uContrast;
uniform float uLift;
uniform float uVignette;
uniform float uGrain;
uniform vec3 uShade;
uniform vec3 uGlow;

const float SHOULDER = ${num(F.shoulder)};
const float BLEACH = ${num(F.bleach)};

${hash}

// the picture at one of its smaller sizes, from four points round this one: soft, with no squares in it
vec3 soft(vec2 uv, float level) {
  vec2 o = exp2(level) * 0.5 / uRes;
  return 0.25 * (textureLod(tGlow, uv + o, level).rgb + textureLod(tGlow, uv - o, level).rgb
               + textureLod(tGlow, uv + vec2(o.x, -o.y), level).rgb + textureLod(tGlow, uv + vec2(-o.x, o.y), level).rgb);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = max(texture2D(tScene, uv).rgb, 0.0);

  // What is brighter than nearly white spills a little into what is next to it, as it does in a lens and on
  // film: the snow in the last sun, the sky where the sun went down, needles that catch it.
  if (uBloom > 0.0) {
    vec3 spill = 0.5 * soft(uv, 3.0) + 0.3 * soft(uv, 5.0) + 0.2 * soft(uv, 6.5);
    c += max(spill - uBloomAt, 0.0) * uBloom;
  }
  c *= uExposure;

  // the whole palette turned round the grey axis, then leaned warm or cool
  if (uHue != 0.0) {
    vec3 axis = vec3(0.57735);
    float a = radians(uHue);
    c = c * cos(a) + cross(axis, c) * sin(a) + axis * dot(axis, c) * (1.0 - cos(a));
  }
  c *= vec3(1.0 + uWarmth * 0.25, 1.0, 1.0 - uWarmth * 0.25);
  c = max(c, 0.0);

  // Light past white is rounded off, not cut. Up to SHOULDER nothing changes; above it the brightest of the
  // three is eased toward white and the other two are kept in step with it, so snow in the last sun keeps
  // the colour of that sun. Only what is far brighter than white begins to bleach, as it does on film.
  float peak = max(c.r, max(c.g, c.b));
  if (peak > SHOULDER) {
    float room = 1.0 - SHOULDER;
    float eased = 1.0 - room * room / (peak - SHOULDER + room);
    c *= eased / peak;
    c = mix(c, vec3(eased), 1.0 - 1.0 / (BLEACH * (peak - eased) + 1.0));
  }

  // a little colour taken out, then the darks leaned cool and the lights leaned warm
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c *= mix(uShade, uGlow, smoothstep(0.02, 0.5, l));

  // from light as it is counted to light as a screen shows it, then a soft S for contrast
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);

  // dark corners: the curve is the one "Up in the Cloud Sea" ends on
  c *= mix(1.0 - uVignette, 1.0, pow(16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y), 0.3));

  // black is lifted a little, toward blue, as on old stock
  c = c * (1.0 - uLift) + uLift * vec3(0.55, 0.9, 1.0);

  // grain, new 24 times a second. It also hides the steps a screen makes of a dark, slow gradient
  float g = hash12(gl_FragCoord.xy + vec2(37.0, 17.0) * floor(mod(uTime * 24.0, 1024.0)));
  c += (g - 0.5) * uGrain * (1.0 - 0.6 * l);

  gl_FragColor = vec4(c, 1.0);
}
`;

// trails: this frame, with some of the last one left in it
const blendShader = /* glsl */`
uniform sampler2D tScene;
uniform sampler2D tBefore;
uniform vec2 uRes;
uniform float uKeep;

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  gl_FragColor = vec4(mix(texture2D(tScene, uv).rgb, texture2D(tBefore, uv).rgb, uKeep), 1.0);
}
`;

// `target` is what the scene was drawn into
export function createFilm(target) {
  const uniforms = {
    tScene: { value: target.texture },
    tGlow: { value: target.texture },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uBloom: { value: F.bloom },
    uBloomAt: { value: F.bloomAt },
    uExposure: { value: 1 },
    uHue: { value: 0 },
    uWarmth: { value: 0 },
    uSaturation: { value: F.saturation },
    uContrast: { value: F.contrast },
    uLift: { value: F.lift },
    uVignette: { value: F.vignette },
    uGrain: { value: F.grain },
    uShade: { value: new THREE.Vector3(...F.shade) },
    uGlow: { value: new THREE.Vector3(...F.glow) },
  };
  const blend = {
    tScene: { value: target.texture },
    tBefore: { value: null },
    uRes: uniforms.uRes,
    uKeep: { value: 0 },
  };

  // one triangle that overhangs the screen on two sides covers it without a seam down the middle
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const pass = (shader, values) => {
    const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ uniforms: values, vertexShader, fragmentShader: shader, depthTest: false, depthWrite: false }));
    mesh.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(mesh);
    return scene;
  };
  const grade = pass(fragmentShader, uniforms), mix = pass(blendShader, blend);
  const camera = new THREE.Camera();

  // Two sheets to keep the frame before on, made only if trails are ever asked for. Each frame is mixed
  // onto one while the other is read, and they change places.
  let sheets = null, read = 0, have = false, width = 1, height = 1;

  const film = {
    uniforms,
    trails: 0,                 // how much of the last frame stays, at 60 frames a second

    setSize(w, h) {
      width = w; height = h;
      uniforms.uRes.value.set(w, h);
      if (sheets) sheets.forEach(sheet => sheet.setSize(w, h));
      have = false;
    },

    // seconds: the clock, for the grain. dt: how long since the last frame, so trails are as long on a fast screen as on a slow one
    render(renderer, seconds, dt) {
      uniforms.uTime.value = seconds;
      let picture = target.texture;

      if (film.trails > 0) {
        sheets ||= [0, 1].map(() => new THREE.WebGLRenderTarget(width, height, { type: target.texture.type, depthBuffer: false, stencilBuffer: false }));
        const write = 1 - read;
        blend.tBefore.value = sheets[read].texture;
        blend.uKeep.value = have ? Math.pow(film.trails, Math.max(dt, 1 / 240) * 60) : 0;
        renderer.setRenderTarget(sheets[write]);
        renderer.render(mix, camera);
        picture = sheets[write].texture;
        read = write;
        have = true;
      } else have = false;

      uniforms.tScene.value = picture;
      renderer.setRenderTarget(null);
      renderer.render(grade, camera);
    },
  };

  return film;
}
