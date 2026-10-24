// Afterglow — Tune: the panel that turns the scene's numbers while it runs.
//
// Everything it can change is one row in the lists below: a name, its words beside it, a range, where the number is
// read from and what to do with a new one. Nothing else in the scene knows the panel exists.
//
// What a visitor sets stays in their own browser (Keep). To make a setting the scene's own default, for everyone:
// press Copy, and paste what it gives into `tuned` in config.js.

import { config } from './config.js';
import { shared, setSun } from './glsl.js';

const STORE = 'afterglow-tune:v1';

const WORDS = {
  travel: { en: "Travel", zh: "行進", ja: "移動", ko: "이동", es: "Trayecto", fr: "Déplacement" },
  speed: { en: "Speed", zh: "行進速度", ja: "速度", ko: "속도", es: "Velocidad", fr: "Vitesse" },
  lens: { en: "Lens", zh: "視角縮放", ja: "レンズ", ko: "렌즈", es: "Objetivo", fr: "Objectif" },
  gaze: { en: "Gaze", zh: "視線高低", ja: "視線", ko: "시선", es: "Mirada", fr: "Regard" },
  height: { en: "Height", zh: "鏡頭高度", ja: "高さ", ko: "높이", es: "Altura", fr: "Hauteur" },
  land: { en: "Land", zh: "山谷", ja: "地形", ko: "지형", es: "Terreno", fr: "Terrain" },
  relief: { en: "Relief", zh: "山勢起伏", ja: "起伏", ko: "기복", es: "Relieve" },
  detail: { en: "Detail", zh: "雜訊細節", ja: "細部", ko: "세부", es: "Detalle" },
  snowline: { en: "Snowline", zh: "雪線", ja: "雪線", ko: "설선", es: "Línea de nieve", fr: "Limite des neiges" },
  bends: { en: "Bends", zh: "道路彎曲", ja: "曲がり", ko: "굽이", es: "Curvas", fr: "Courbes" },
  forestDensity: { en: "Forest", zh: "樹林疏密", ja: "森", ko: "숲", es: "Bosque", fr: "Forêt" },
  treeHeight: { en: "Tree height", zh: "樹木高度", ja: "木の高さ", ko: "나무 높이", es: "Altura de los árboles", fr: "Hauteur des arbres" },
  air: { en: "Air", zh: "天光", ja: "大気", ko: "대기", es: "Aire" },
  sun: { en: "Sun", zh: "太陽方位", ja: "太陽", ko: "태양", es: "Sol", fr: "Soleil" },
  sunStrength: { en: "Sun strength", zh: "日照強度", ja: "日光の強さ", ko: "햇빛 세기", es: "Intensidad del sol", fr: "Intensité du soleil" },
  glowLine: { en: "Glow line", zh: "餘暉線", ja: "残光の境", ko: "잔광 경계", es: "Límite del brillo", fr: "Limite de rémanence" },
  sunbeams: { en: "Sunbeams", zh: "光束", ja: "光線", ko: "햇살", es: "Rayos de sol", fr: "Rayons de soleil" },
  haze: { en: "Haze", zh: "霧氣", ja: "かすみ", ko: "연무", es: "Bruma", fr: "Voile" },
  mist: { en: "Mist", zh: "谷底薄霧", ja: "霧", ko: "안개", es: "Neblina", fr: "Brume" },
  cloud: { en: "Cloud", zh: "雲量", ja: "雲", ko: "구름", es: "Nubes", fr: "Nuages" },
  film: { en: "Film", zh: "底片", ja: "フィルム", ko: "필름", es: "Película" },
  exposure: { en: "Exposure", zh: "曝光亮度", ja: "露出", ko: "노출", es: "Exposición", fr: "Exposition" },
  saturation: { en: "Saturation", zh: "色彩飽和度", ja: "彩度", ko: "채도", es: "Saturación" },
  hue: { en: "Hue", zh: "整體色相", ja: "色相", ko: "색상", es: "Tono", fr: "Teinte" },
  warmth: { en: "Warmth", zh: "冷暖色溫", ja: "暖かさ", ko: "온기", es: "Calidez", fr: "Chaleur" },
  contrast: { en: "Contrast", zh: "對比", ja: "コントラスト", ko: "대비", es: "Contraste", fr: "Contraste" },
  vignette: { en: "Vignette", zh: "暗角強度", ja: "周辺減光", ko: "주변부 감광", es: "Viñeteado", fr: "Vignettage" },
  grain: { en: "Grain", zh: "顆粒", ja: "粒子", ko: "입자", es: "Grano" },
  bloom: { en: "Bloom", zh: "光暈", ja: "光のにじみ", ko: "빛 번짐", es: "Halo", fr: "Halo" },
  trails: { en: "Trails", zh: "影格殘影", ja: "残像", ko: "잔상", es: "Estelas", fr: "Traînées" },
  resolution: { en: "Resolution", zh: "算圖比例", ja: "解像度", ko: "해상도", es: "Resolución" },
  zenith: { en: "Zenith", zh: "天頂", ja: "天頂", ko: "천정", es: "Cénit" },
  afterglow: { en: "Afterglow", zh: "餘暉", ja: "残光", ko: "잔광", es: "Resplandor", fr: "Rémanence" },
  horizon: { en: "Horizon", zh: "天邊", ja: "地平線", ko: "지평선", es: "Horizonte" },
  forest: { en: "Forest", zh: "樹林", ja: "森", ko: "숲", es: "Bosque", fr: "Forêt" },
  lastLight: { en: "Last light", zh: "夕照", ja: "最後の光", ko: "마지막 빛", es: "Última luz", fr: "Dernière lumière" },
  grass: { en: "Grass", zh: "草地", ja: "草", ko: "풀", es: "Hierba", fr: "Herbe" },
  asphalt: { en: "Asphalt", zh: "路面", ja: "アスファルト", ko: "아스팔트", es: "Asfalto", fr: "Asphalte" },
  litSnow: { en: "Lit snow", zh: "受光的雪", ja: "光を受ける雪", ko: "빛을 받는 눈", es: "Nieve iluminada", fr: "Neige éclairée" },
  shadedSnow: { en: "Shaded snow", zh: "背光的雪", ja: "日陰の雪", ko: "그늘진 눈", es: "Nieve en sombra", fr: "Neige à l’ombre" },
  reset: { en: "reset", zh: "重設", ja: "戻す", ko: "되돌리기", es: "restablecer", fr: "rétablir" },
  colour: { en: "Colour", zh: "染色", ja: "色", ko: "색", es: "Color", fr: "Couleur" },
  hold: { en: "Hold", zh: "暫停", ja: "一時停止", ko: "일시 정지", es: "Pausa", fr: "Pause" },
  resetAll: { en: "Reset all", zh: "全部重設", ja: "すべて戻す", ko: "모두 되돌리기", es: "Restablecer todo", fr: "Tout rétablir" },
  sure: { en: "Sure?", zh: "確定？", ja: "本当に？", ko: "정말?", es: "¿Seguro?", fr: "Confirmer ?" },
  resetDone: { en: "Reset.", zh: "已重設。", ja: "戻した。", ko: "되돌렸다.", es: "Restablecido.", fr: "Rétabli." },
  keep: { en: "Keep", zh: "記住設定", ja: "保存", ko: "저장", es: "Guardar", fr: "Garder" },
  kept: { en: "Kept.", zh: "已記住。", ja: "保存した。", ko: "저장했다.", es: "Guardado.", fr: "Gardé." },
  couldKeep: { en: "Could not.", zh: "沒能記住。", ja: "できなかった。", ko: "하지 못했다.", es: "No se pudo.", fr: "Impossible." },
  copy: { en: "Copy", zh: "複製", ja: "コピー", ko: "복사", es: "Copiar", fr: "Copier" },
  copied: { en: "Copied.", zh: "已複製。", ja: "コピーした。", ko: "복사했다.", es: "Copiado.", fr: "Copié." },
  couldCopy: { en: "Could not.", zh: "沒能複製。", ja: "できなかった。", ko: "하지 못했다.", es: "No se pudo.", fr: "Impossible." },
  replay: { en: "Replay", zh: "重播", ja: "最初から", ko: "다시 재생", es: "Repetir", fr: "Rejouer" },
};
const { camera: C, path: P, light: L, air: A, colour: K } = config;

export function createTune(scene) {
  const panel = document.getElementById('tune');
  const opener = document.getElementById('tune-open');
  if (!panel || !opener) return null;

  const { sky, ground, forest, verge, film } = scene;
  const of = uniform => [() => uniform.value, value => { uniform.value = value; }];

  // key, English, the words beside it, least, most, step, unit, read, write
  const groups = [
    ['Travel', WORDS.travel, [
      ['speed', 'Speed', WORDS.speed, 0, 160, 1, ' km/h', () => config.speed * 3.6, v => { config.speed = v / 3.6; }],
      ['zoom', 'Lens', WORDS.lens, 0.5, 2.5, 0.01, '×', () => C.zoom, v => { C.zoom = v; scene.lens(); }],
      ['pitch', 'Gaze', WORDS.gaze, -6, 14, 0.1, '°', () => C.pitch, v => { C.pitch = v; }],
      ['height', 'Height', WORDS.height, 0.6, 12, 0.1, ' m', () => C.height, v => { C.height = v; }],
    ]],
    ['Land', WORDS.land, [
      ['relief', 'Relief', WORDS.relief, 0, 2, 0.01, '×', () => shared.uRelief.value, v => { shared.uRelief.value = v; scene.reshape(); }],
      ['detail', 'Detail', WORDS.detail, 1, 6, 1, '', () => shared.uDetail.value, v => { shared.uDetail.value = v; scene.reshape(); }],
      ['snowline', 'Snowline', WORDS.snowline, 0.3, 3.5, 0.01, ' km', ...of(sky.uniforms.uSnowline)],
      ['bend', 'Bends', WORDS.bends, 0, 1.5, 0.01, '×', () => P.bend, v => { P.bend = v; shared.uBend.value = v; }],
      ['trees', 'Forest', WORDS.forestDensity, 0, 1, 0.01, '', () => 1, v => { forest.mesh.geometry.instanceCount = Math.round(forest.total * v); }],
      ['treeHeight', 'Tree height', WORDS.treeHeight, 0.5, 1.6, 0.01, '×', ...of(forest.uniforms.uTreeScale)],
    ]],
    ['Air', WORDS.air, [
      // with the sun go the warm side of the sky, which faces of the far range are lit, and which wall of the valley its light still reaches
      ['sun', 'Sun', WORDS.sun, -90, 90, 1, '°', () => L.azimuth, v => { setSun(v); scene.rephase(); }],
      // how bright what the last sun is on: the peaks, the edges of the trees, the road where it comes down
      ['sunlight', 'Sun strength', WORDS.sunStrength, 0, 3, 0.01, '×', ...of(shared.uBright)],
      // on the far range, only what stands higher than this still has the sun: raise it and the light climbs to the summits
      ['peaks', 'Glow line', WORDS.glowLine, 0, 3.5, 0.01, ' km', ...of(sky.uniforms.uPeaks)],
      ['beams', 'Sunbeams', WORDS.sunbeams, 0, 2, 0.01, '×', ...of(shared.uBeam)],
      ['haze', 'Haze', WORDS.haze, 0, 12, 0.01, '×', () => 1, v => { shared.uFog.value.x = A.haze * v; }],
      ['mist', 'Mist', WORDS.mist, 0, 12, 0.01, '×', () => 1, v => { shared.uFog.value.y = A.mist * v; }],
      ['cloud', 'Cloud', WORDS.cloud, 0, 1, 0.01, '', ...of(sky.uniforms.uCloud)],
    ]],
    ['Film', WORDS.film, [
      ['exposure', 'Exposure', WORDS.exposure, 0.3, 2, 0.01, '×', ...of(film.uniforms.uExposure)],
      ['saturation', 'Saturation', WORDS.saturation, 0, 2, 0.01, '', ...of(film.uniforms.uSaturation)],
      ['hue', 'Hue', WORDS.hue, -180, 180, 1, '°', ...of(film.uniforms.uHue)],
      ['warmth', 'Warmth', WORDS.warmth, -1, 1, 0.01, '', ...of(film.uniforms.uWarmth)],
      ['contrast', 'Contrast', WORDS.contrast, 0, 1, 0.01, '', ...of(film.uniforms.uContrast)],
      ['vignette', 'Vignette', WORDS.vignette, 0, 1, 0.01, '', ...of(film.uniforms.uVignette)],
      ['grain', 'Grain', WORDS.grain, 0, 0.08, 0.002, '', ...of(film.uniforms.uGrain)],
      ['bloom', 'Bloom', WORDS.bloom, 0, 1, 0.01, '', ...of(film.uniforms.uBloom)],
      ['trails', 'Trails', WORDS.trails, 0, 0.9, 0.01, '', () => film.trails, v => { film.trails = v; }],
      ['resolution', 'Resolution', WORDS.resolution, 0.4, 1, 0.05, '', () => 1, v => scene.setScale(v)],
    ]],
  ];

  // key, English, the words beside it, the palette's own colour, write
  const tints = [
    ['zenith', 'Zenith', WORDS.zenith, K.skyZenith, hex => shared.uSkyZenith.value.set(hex)],
    ['afterglow', 'Afterglow', WORDS.afterglow, K.skyWarm, hex => shared.uSkyWarm.value.set(hex)],
    ['horizon', 'Horizon', WORDS.horizon, K.skyCool, hex => shared.uSkyCool.value.set(hex)],
    ['forest', 'Forest', WORDS.forest, K.tree, hex => {
      forest.uniforms.uTree.value.set(hex);
      if (hex === K.tree) ground.uniforms.uForest.value.set(K.forest);
      else ground.uniforms.uForest.value.set(hex).multiplyScalar(0.82);     // the ground under them, a shade darker
    }],
    ['lastLight', 'Last light', WORDS.lastLight, K.forestLit, hex => {
      forest.uniforms.uForestLit.value.set(hex);
      ground.uniforms.uForestLit.value.set(hex);
      sky.uniforms.uForestLit.value.set(hex);
    }],
    ['grass', 'Grass', WORDS.grass, K.grass, hex => {
      ground.uniforms.uGrass.value.set(hex);
      verge.uniforms.uGrass.value.set(hex);
    }],
    ['asphalt', 'Asphalt', WORDS.asphalt, K.asphalt, hex => ground.uniforms.uAsphalt.value.set(hex)],
    ['snow', 'Lit snow', WORDS.litSnow, K.snowLit, hex => sky.uniforms.uSnowLit.value.set(hex)],
    ['snowShade', 'Shaded snow', WORDS.shadedSnow, K.snowShade, hex => sky.uniforms.uSnowShade.value.set(hex)],
  ];

  // ── the panel itself ──────────────────────────────────────

  const make = (tag, props, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children);
    return node;
  };
  // English, and only this reader's language beside it. Names with the same spelling are left alone.
  const beside = document.documentElement.getAttribute('data-beside') || '';
  const both = (en, words) => beside && words[beside]
    ? [en, make('span', { lang: beside === 'zh' ? 'zh-Hant' : beside, textContent: words[beside] })] : [en];

  const controls = new Map();

  // One control: a label, a way back to where it started (shown only once it has moved), and the thing to move.
  function control(key, en, words, input, initial, valid, write, show) {
    input.id = `tune-${key}`;
    const undo = make('button', { type: 'button', className: 'tune__undo', hidden: true }, ...both('reset', WORDS.reset));
    const output = show ? make('output', {}) : '';
    const it = {
      initial,
      value: initial,
      valid,
      sync(value) {
        it.value = value;
        input.value = value;
        if (show) output.textContent = show(value);
        undo.hidden = value === it.initial;
      },
      put(value) { write(value); it.sync(value); },
    };
    input.addEventListener('input', () => { it.put(valid(show ? parseFloat(input.value) : input.value) ?? it.initial); scene.refresh(); });
    undo.addEventListener('click', () => { it.put(it.initial); scene.refresh(); });
    it.sync(initial);
    controls.set(key, it);
    return make('div', { className: 'tune__row' }, make('label', { htmlFor: input.id }, ...both(en, words)), undo, output, input);
  }

  for (const [en, words, rows] of groups) {
    panel.append(make('fieldset', {}, make('legend', {}, ...both(en, words)), ...rows.map(([key, name, words, min, max, step, unit, read, write]) => {
      const places = (String(step).split('.')[1] || '').length;
      return control(key, name, words, make('input', { type: 'range', min, max, step }), read(),
        v => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null),
        write, v => v.toFixed(places) + unit);
    })));
  }

  panel.append(make('fieldset', {}, make('legend', {}, ...both('Colour', WORDS.colour)), ...tints.map(([key, name, words, hex, write]) =>
    control(key, name, words, make('input', { type: 'color' }), hex,
      v => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null), write, null))));

  const hold = make('input', { type: 'checkbox' });
  hold.addEventListener('change', () => scene.hold(hold.checked));
  panel.append(make('label', { className: 'tune__check' }, hold, make('span', {}, ...both('Hold', WORDS.hold))));

  // a button says what it has done in its own place, then goes back to its name
  const names = new WeakMap(), timers = new WeakMap();
  function say(button, en, words, ms = 1800) {
    clearTimeout(timers.get(button));
    button.replaceChildren(...both(en, words));
    timers.set(button, setTimeout(() => button.replaceChildren(...names.get(button)), ms));
  }
  function action(en, words, run) {
    const button = make('button', { type: 'button' }, ...both(en, words));
    names.set(button, [...button.childNodes]);
    button.addEventListener('click', () => run(button));
    return button;
  }

  // only what has been moved is worth writing down
  const moved = () => Object.fromEntries([...controls].filter(([, it]) => it.value !== it.initial).map(([key, it]) => [key, it.value]));

  let asked = -Infinity;           // when Reset all last asked; never, until it is pressed
  panel.append(make('div', { className: 'tune__actions' },
    action('Reset all', WORDS.resetAll, button => {
      // it forgets what was kept, so it asks once
      if (performance.now() - asked > 3000) { asked = performance.now(); say(button, 'Sure?', WORDS.sure, 3000); return; }
      asked = -Infinity;
      try { localStorage.removeItem(STORE); } catch (error) { /* nothing was kept, then */ }
      controls.forEach(it => it.put(it.initial));
      scene.refresh();
      say(button, 'Reset.', WORDS.resetDone);
    }),
    action('Keep', WORDS.keep, button => {
      try { localStorage.setItem(STORE, JSON.stringify(moved())); say(button, 'Kept.', WORDS.kept); }
      catch (error) { say(button, 'Could not.', WORDS.couldKeep); }
    }),
    action('Copy', WORDS.copy, button => {
      navigator.clipboard.writeText(JSON.stringify(moved(), null, 2))
        .then(() => say(button, 'Copied.', WORDS.copied), () => say(button, 'Could not.', WORDS.couldCopy));
    }),
    action('Replay', WORDS.replay, () => scene.replay()),
  ));

  // ── what was set before ───────────────────────────────────

  function restore(from, asOwn) {
    for (const [key, raw] of Object.entries(from || {})) {
      const it = controls.get(key);
      const value = it ? it.valid(raw) : null;
      if (value === null) continue;
      if (asOwn) it.initial = value;       // the scene's own setting is what "reset" goes back to
      it.put(value);
    }
  }

  let kept = null;
  try { kept = JSON.parse(localStorage.getItem(STORE)); } catch (error) { /* a browser that keeps nothing starts from the scene's own */ }
  restore(config.tuned, true);
  restore(kept, false);

  // ── open and shut ─────────────────────────────────────────

  function open(yes) {
    panel.classList.toggle('is-open', yes);
    opener.setAttribute('aria-expanded', yes);
  }
  opener.addEventListener('click', () => open(!panel.classList.contains('is-open')));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') open(false); });
  if (new URLSearchParams(location.search).has('tune')) open(true);

  return { open };
}
