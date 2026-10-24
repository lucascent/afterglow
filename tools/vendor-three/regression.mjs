import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const arg = name => process.argv[process.argv.indexOf(name) + 1];
const library = arg('--library');
const source = arg('--source');
const expectation = arg('--expect');
if (!library || !source) throw new Error('Required: --library FILE --source DIRECTORY [--expect fixed|baseline]');
const cases = {
  'binding-playback': false, 'binding-parsed-path': false, 'binding-variants': false,
  'mixer-root': false, 'mixer-siblings': false,
  'dimensions-playback': false, 'dimensions-constructors': false, 'dimensions-resource-amplification': false,
  'ellipse-positive': false, 'ellipse-negative': false, 'ellipse-nonfinite': false,
  'ellipse-shape': false, 'ellipse-extrude': false,
  'binding-control': true, 'binding-vector-alias-control': true, 'binding-material-accessor-control': true,
  'animation-control': true, 'ellipse-control': true,
};

if (!process.argv.includes('--case')) {
  const results = [];
  for (const [name, control] of Object.entries(cases)) {
    const child = spawnSync(process.execPath, [process.argv[1], '--library', library, '--source', source, '--case', name], {
      timeout: 1800, killSignal: 'SIGKILL', encoding: 'utf8', cwd: process.cwd(),
    });
    const passed = child.status === 0;
    const expected = expectation === 'baseline' ? control : true;
    results.push({ name, expected, passed, timeout: child.error?.code === 'ETIMEDOUT', signal: child.signal,
      matched: passed === expected, detail: passed ? child.stdout.trim() : (child.stderr || child.error?.message || '').slice(-1800) });
  }
  console.log(JSON.stringify({ expectation, library, results, passed: results.every(r => r.matched) }, null, 2));
  process.exit(results.every(r => r.matched) ? 0 : 1);
}

const T = await import(pathToFileURL(path.resolve(library)));
const name = arg('--case');
const marker = 'codexThreeSecurityMarker';
const blocked = fn => {
  try { fn(); } catch { return true; }
  return false;
};
const pollutionPath = `.__proto__[__proto__].__proto__[${marker}]`;
const root = new T.Object3D();
switch (name) {
  case 'binding-playback': {
    try {
      const clip = T.AnimationClip.parse({ name: 'probe', duration: 1, tracks: [{ name: pollutionPath, type: 'number', times: [0, 1], values: [1, 2] }] });
      const mixer = new T.AnimationMixer(root);
      mixer.clipAction(clip).play(); mixer.update(0.5);
    } catch { /* Rejection is allowed; prototype mutation is never allowed. */ }
    assert.equal(Object.hasOwn(Object.prototype, marker), false);
    break;
  }
  case 'binding-parsed-path': {
    try {
      const binding = new T.PropertyBinding(root, '.position[x]', { objectName: '__proto__', objectIndex: '__proto__', propertyName: '__proto__', propertyIndex: marker });
      binding.setValue([5], 0);
    } catch { /* The constructor/bind boundary must also cover supplied parsed paths. */ }
    assert.equal(Object.hasOwn(Object.prototype, marker), false);
    break;
  }
  case 'binding-variants': {
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      for (const field of ['objectName', 'objectIndex', 'propertyName', 'propertyIndex']) {
        const parsed = { objectName: 'material', propertyName: 'opacity', [field]: key };
        assert.equal(blocked(() => new T.PropertyBinding(root, '.position[x]', parsed).bind()), true, `${field}:${key}`);
      }
      assert.equal(blocked(() => T.PropertyBinding.parseTrackName(`.position[${key}]`)), true);
    }
    const inherited = { bad: { [marker]: 0 } };
    const scene = new T.Object3D(); scene.data = Object.create(inherited);
    const original = inherited.bad[marker];
    try { new T.PropertyBinding(scene, `.data[bad].${marker}`).setValue([6], 0); } catch {}
    assert.equal(inherited.bad[marker], original);
    const mutable = new T.PropertyBinding(root, '.position[x]');
    mutable.parsedPath.propertyIndex = '__proto__';
    assert.equal(blocked(() => mutable.bind()), true);
    for (const value of [new T.Vector2(), new T.Vector4()]) {
      root.rectangle = value;
      for (const key of ['__proto__', 'constructor', 'prototype', 'toArray']) {
        assert.equal(blocked(() => new T.PropertyBinding(root, `.rectangle[${key}]`).setValue([0.2], 0)), true);
      }
    }
    root.rectangle = Object.create({ get width() { return 0; }, set width(value) { Object.prototype[marker] = value; } });
    assert.equal(blocked(() => new T.PropertyBinding(root, '.rectangle[width]').setValue([0.2], 0)), true);
    assert.equal(Object.hasOwn(Object.prototype, marker), false);
    const fakePrototype = {};
    for (const key of ['alphaTest', 'anisotropy', 'clearcoat', 'iridescence', 'dispersion', 'retroreflectivity', 'sheen', 'transmission']) {
      Object.defineProperty(fakePrototype, key, { get() { return 0; }, set(value) { Object.prototype[marker] = value; } });
    }
    root.material = Object.assign(Object.create(fakePrototype), { isMaterial: true, isMeshPhysicalMaterial: true });
    for (const key of Object.getOwnPropertyNames(fakePrototype)) {
      new T.PropertyBinding(root, `.material.${key}`).setValue([0.2], 0);
      assert.equal(Object.hasOwn(Object.prototype, marker), false, `fake material ${key}`);
    }
    root.material = new T.MeshPhysicalMaterial();
    for (const key of ['__proto__', 'constructor', 'prototype']) {
      assert.equal(blocked(() => new T.PropertyBinding(root, `.material.${key}`).setValue([0.2], 0)), true);
    }
    break;
  }
  case 'mixer-root': {
    const scene = new T.ObjectLoader().parse({ object: { type: 'Scene', uuid: '__proto__' } });
    const trackName = '.position[x]';
    try { new T.AnimationMixer(scene).clipAction(new T.AnimationClip('clip', 1, [new T.NumberKeyframeTrack(trackName, [0, 1], [0, 2])])); } catch {}
    assert.equal(Object.hasOwn(Object.prototype, trackName), false);
    break;
  }
  case 'mixer-siblings': {
    for (const key of ['__proto__', 'constructor', 'toString', 'prototype']) {
      const scene = new T.Object3D(); scene.uuid = key;
      const clip = new T.AnimationClip('clip', 1, [new T.NumberKeyframeTrack('.position[x]', [0, 1], [0, 2])]); clip.uuid = key;
      const mixer = new T.AnimationMixer(scene);
      const action = mixer.clipAction(clip); action.play(); mixer.update(0.5);
      assert.equal(scene.position.x, 1);
      assert.equal(mixer.existingAction(clip), action);
      mixer.uncacheAction(clip); mixer.uncacheClip(clip); mixer.uncacheRoot(scene);
      assert.equal(mixer.stats.actions.total, 0); assert.equal(mixer.stats.bindings.total, 0);
    }
    break;
  }
  case 'dimensions-playback': {
    const payload = { name: 'bad', duration: 2, tracks: [{ name: '.position[x]', type: 'number', times: [0, 1, 2], values: [1] }] };
    assert.equal(blocked(() => {
      const clip = T.AnimationClip.parse(payload);
      new T.AnimationMixer(root).clipAction(clip).play();
    }), true);
    break;
  }
  case 'dimensions-constructors': {
    const { PropertyMixer } = await import(pathToFileURL(path.join(source, 'src/animation/PropertyMixer.js')));
    for (const Klass of [T.KeyframeTrack, T.NumberKeyframeTrack, T.VectorKeyframeTrack, T.ColorKeyframeTrack, T.BooleanKeyframeTrack, T.StringKeyframeTrack, T.QuaternionKeyframeTrack]) {
      for (const values of [[], [1]]) assert.throws(() => new Klass('x', [0, 1, 2], values));
    }
    for (const size of [0, -1, 1 / 3, NaN, Infinity]) {
      for (const Klass of [T.Interpolant, T.LinearInterpolant, T.DiscreteInterpolant, T.CubicInterpolant, T.BezierInterpolant, T.QuaternionLinearInterpolant]) {
        assert.throws(() => new Klass(new Float32Array([0, 1]), new Float32Array(8), size));
      }
      assert.throws(() => new PropertyMixer({}, 'number', size));
      assert.throws(() => T.AnimationUtils.sortedArray(new Float32Array([1, 2]), size, [0, 1]));
    }
    for (const Klass of [T.Interpolant, T.LinearInterpolant, T.DiscreteInterpolant, T.CubicInterpolant, T.BezierInterpolant, T.QuaternionLinearInterpolant]) {
      assert.throws(() => new Klass(new Float32Array([0]), new Float32Array(0), 1));
      assert.throws(() => new Klass(new Float32Array([0, 1]), new Float32Array([0, 1]), Number.MAX_SAFE_INTEGER, new Float32Array(1)));
    }
    assert.throws(() => new T.QuaternionKeyframeTrack('x', [0, 1], [1, 2]));
    assert.throws(() => new T.QuaternionLinearInterpolant(new Float32Array([0, 1]), new Float32Array(2), 1));
    assert.throws(() => new PropertyMixer({}, 'quaternion', 1));
    const track = new T.NumberKeyframeTrack('x', [0, 1], [0, 1]);
    track.values = new Float32Array([1]);
    assert.throws(() => track.createInterpolant()); assert.throws(() => track.optimize());
    break;
  }
  case 'dimensions-resource-amplification': {
    assert.throws(() => new T.Interpolant(new Float32Array([1, 2]), new Float32Array([0, 1]), Number.MAX_SAFE_INTEGER, new Float32Array(1)).evaluate(0), {
      name: 'RangeError', message: 'THREE.Interpolant: Invalid sample size.',
    });
    break;
  }
  case 'ellipse-positive':
  case 'ellipse-negative': {
    const end = name.endsWith('positive') ? 1e20 : -1e20;
    const point = new T.EllipseCurve(0, 0, 1, 1, 0, end).getPoint(0.5);
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    break;
  }
  case 'ellipse-nonfinite': {
    for (const [start, end] of [[0, Infinity], [0, -Infinity], [NaN, 1], [0, NaN], [-Number.MAX_VALUE, Number.MAX_VALUE]]) {
      assert.throws(() => new T.EllipseCurve(0, 0, 1, 1, start, end).getPoint(0.5));
      assert.throws(() => new T.ArcCurve(0, 0, 1, start, end).getPoint(0.5));
    }
    break;
  }
  case 'ellipse-shape':
  case 'ellipse-extrude': {
    const shape = new T.Shape(); shape.curves.push(new T.EllipseCurve(0, 0, 1, 1, 0, 1e20));
    const shapeJSON = shape.toJSON();
    const geometry = { uuid: 'geometry', type: name === 'ellipse-shape' ? 'ShapeGeometry' : 'ExtrudeGeometry', shapes: [shapeJSON.uuid], options: { depth: 1, bevelEnabled: false } };
    const scene = new T.ObjectLoader().parse({ shapes: [shapeJSON], geometries: [geometry], materials: [{ uuid: 'material', type: 'MeshBasicMaterial' }], object: { type: 'Mesh', uuid: 'mesh', geometry: 'geometry', material: 'material' } });
    assert.ok(scene.geometry.attributes.position.count > 0);
    break;
  }
  case 'binding-control': {
    const mesh = new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial());
    for (const [bindingPath, value, read] of [
      ['.position[x]', 3, () => mesh.position.x], ['.rotation[x]', 0.4, () => mesh.rotation.x],
      ['.quaternion[w]', 0.8, () => mesh.quaternion.w], ['.material.opacity', 0.25, () => mesh.material.opacity],
    ]) { new T.PropertyBinding(mesh, bindingPath).setValue([value], 0); assert.equal(read(), value); }
    mesh.geometry.morphAttributes.position = [new T.Float32BufferAttribute([0, 0, 0], 3)];
    mesh.morphTargetInfluences = [0]; mesh.morphTargetDictionary = { smile: 0 };
    new T.PropertyBinding(mesh, '.morphTargetInfluences[smile]').setValue([0.7], 0); assert.equal(mesh.morphTargetInfluences[0], 0.7);
    const bone = new T.Bone(); bone.name = '骨'; mesh.skeleton = new T.Skeleton([bone]);
    new T.PropertyBinding(mesh, '.bones[骨].position[x]').setValue([2], 0); assert.equal(bone.position.x, 2);
    mesh.material.map = new T.Texture();
    new T.PropertyBinding(mesh, '.map.offset[x]').setValue([0.2], 0); assert.equal(mesh.material.map.offset.x, 0.2);
    break;
  }
  case 'binding-vector-alias-control': {
    const mesh = new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial());
    mesh.material.map = new T.Texture(); mesh.rectangle = new T.Vector4();
    for (const [bindingPath, read] of [
      ['.map.offset[width]', () => mesh.material.map.offset.x],
      ['.map.repeat[height]', () => mesh.material.map.repeat.y],
      ['.rectangle[width]', () => mesh.rectangle.z],
      ['.rectangle[height]', () => mesh.rectangle.w],
    ]) {
      new T.PropertyBinding(mesh, bindingPath).setValue([0.2], 0);
      assert.equal(read(), 0.2, bindingPath);
    }
    break;
  }
  case 'binding-material-accessor-control': {
    const mesh = new T.Mesh(new T.BoxGeometry(), new T.MeshPhysicalMaterial());
    for (const key of ['alphaTest', 'anisotropy', 'clearcoat', 'iridescence', 'dispersion', 'retroreflectivity', 'sheen', 'transmission']) {
      new T.PropertyBinding(mesh, `.material.${key}`).setValue([0.2], 0);
      assert.equal(mesh.material[key], 0.2, key);
    }
    mesh.material = new T.MeshBasicMaterial();
    new T.PropertyBinding(mesh, '.material.alphaTest').setValue([0.2], 0);
    assert.equal(mesh.material.alphaTest, 0.2);
    break;
  }
  case 'animation-control': {
    const a = new T.Object3D(), b = new T.Object3D();
    const clip = new T.AnimationClip('normal', 1, [new T.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, 2, 4, 6]), new T.QuaternionKeyframeTrack('.quaternion', [0, 1], [0, 0, 0, 1, 0, 1, 0, 0])]);
    const ma = new T.AnimationMixer(a), mb = new T.AnimationMixer(b); ma.clipAction(clip).play(); mb.clipAction(clip).play(); ma.update(0.5); mb.update(0.25);
    assert.equal(a.position.x, 1); assert.equal(b.position.x, 0.5);
    assert.notEqual(ma._bindings[0], mb._bindings[0]);
    for (const mode of [T.InterpolateDiscrete, T.InterpolateLinear, T.InterpolateSmooth, T.InterpolateBezier]) {
      const track = new T.NumberKeyframeTrack('.position[x]', [0, 1], [0, 1], mode);
      if (mode === T.InterpolateBezier) track.settings = { inTangents: new Float32Array([0, 0, 2 / 3, 2 / 3]), outTangents: new Float32Array([1 / 3, 1 / 3, 1, 1]) };
      const value = track.createInterpolant().evaluate(0.5)[0]; assert.ok(Number.isFinite(value));
      if (mode !== T.InterpolateDiscrete) assert.ok(Math.abs(value - 0.5) < 1e-6);
      track.optimize(); track.trim(0, 1);
    }
    const json = T.AnimationClip.toJSON(new T.AnimationClip('bezier', 1, [new T.NumberKeyframeTrack('.position[x]', [0, 1], [0, 1], T.InterpolateBezier)]));
    assert.equal(T.AnimationClip.parse(json).tracks[0].getValueSize(), 1);
    ma.uncacheRoot(a); assert.equal(ma.stats.bindings.total, 0); assert.equal(mb.stats.bindings.total, 2);
    break;
  }
  case 'ellipse-control': {
    const tau = 2 * Math.PI;
    for (const end of [tau, -tau, 2 * tau, -2 * tau]) {
      for (const cw of [false, true]) {
        const p = new T.EllipseCurve(0, 0, 1, 1, 0, end, cw).getPoint(0.25);
        assert.ok(Math.abs(p.x) < 1e-10); assert.ok(Math.abs(p.y - (cw ? -1 : 1)) < 1e-10);
      }
    }
    const zero = new T.EllipseCurve(0, 0, 1, 1, 0, 0).getPoint(0.5); assert.equal(zero.x, 1); assert.equal(zero.y, 0);
    const quarter = new T.EllipseCurve(0, 0, 1, 1, 0, Math.PI / 2).getPoint(1); assert.ok(Math.abs(quarter.y - 1) < 1e-10);
    break;
  }
  default: throw new Error(`Unknown case: ${name}`);
}
console.log(`${name}: pass`);
