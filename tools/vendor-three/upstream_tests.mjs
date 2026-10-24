import path from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = name => process.argv[process.argv.indexOf(name) + 1];
const source = arg('--source'), qunit = arg('--qunit');
if (!source || !qunit) throw new Error('Required: --source UPSTREAM_TREE --qunit QUNIT_JS');
globalThis.QUnit = (await import(pathToFileURL(path.resolve(qunit)))).default;
QUnit.config.autostart = false;
await import(pathToFileURL(path.join(source, 'test/unit/utils/console-wrapper.js')));
await import(pathToFileURL(path.join(source, 'test/unit/utils/qunit-utils.js')));
const failures = [];
QUnit.on('testEnd', result => {
  if (result.status === 'failed') failures.push({ name: result.fullName, errors: result.errors });
});
QUnit.on('runEnd', result => {
  console.log(JSON.stringify({ counts: result.testCounts, failures }, null, 2));
  process.exitCode = result.testCounts.failed ? 1 : 0;
});
for (const file of [
  'animation/AnimationAction.tests.js', 'animation/AnimationClip.tests.js',
  'animation/AnimationMixer.tests.js', 'animation/PropertyBinding.tests.js',
  'animation/KeyframeTrack.tests.js',
  'animation/tracks/BooleanKeyframeTrack.tests.js', 'animation/tracks/ColorKeyframeTrack.tests.js',
  'animation/tracks/NumberKeyframeTrack.tests.js', 'animation/tracks/QuaternionKeyframeTrack.tests.js',
  'animation/tracks/StringKeyframeTrack.tests.js', 'animation/tracks/VectorKeyframeTrack.tests.js',
  'math/Interpolant.tests.js', 'math/interpolants/CubicInterpolant.tests.js',
  'math/interpolants/DiscreteInterpolant.tests.js', 'math/interpolants/LinearInterpolant.tests.js',
  'math/interpolants/QuaternionLinearInterpolant.tests.js',
  'extras/curves/EllipseCurve.tests.js', 'extras/curves/ArcCurve.tests.js',
]) await import(pathToFileURL(path.join(source, 'test/unit/src', file)));
QUnit.start();
