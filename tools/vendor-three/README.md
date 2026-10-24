# Three.js security patch build

Afterglow keeps its local Three.js 0.186.1 API and import map. Both browser
modules are generated together from the official npm source, pinned to gitHead
`9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8`, with `security.patch` applied.
The MIT license is retained. No runtime CDN is added.

`upstream-manifest.json` records the official archive integrity and source tree
digest. `patch-manifest.json` records each affected source file before/after and
the patch digest. `manifest.json` records exact build tools, original vendor
hashes, and generated output hashes. The former vendor was dynamically minified
by jsDelivr; its bytes are not expected to equal an official npm build.

The recorded build uses Node 24.15.0, npm 11.12.1 and Python 3.14. Maintenance
scripts require Python 3.12+ (`tarfile` data extraction filter); this does not
change anything the scene itself needs. All downloads, npm cache,
dependencies, source extraction and generated files stay in an explicitly
supplied disposable directory outside this repository. No global installs occur.
The stage must be new/empty, or carry this tool's matching ownership marker.
Repository ancestors, unknown nonempty directories and stage/subdirectory
symlinks are rejected before rebuilding; only known build subdirectories are
replaced.
For security workflow runs, obtain this directory from the security artifact
tool before running these commands.

```sh
python3 tools/vendor-three/build.py --stage "$THREE_STAGE"
```

This checks the npm archive SHA512 before extraction, applies the patch with
zero fuzz, installs the exact lockfile with lifecycle scripts disabled, and
uses the upstream GLSL transform plus locked Rollup/Terser to generate
`$THREE_STAGE/output/three.core.js` and `three.module.min.js`. A repeated build
must produce the same SHA256 values in `manifest.json`. To install a reviewed
build, add `--install`; this refuses output that differs from the manifest.
Keep both modules from the same build. The renderer continues to import
`./three.core.js`, and `index.html` keeps its existing import map.

The patch closes five independent boundaries:

- Property binding rejects reflective path keys in string and supplied parsed
  paths, validates again at bind time, and limits caller-selected lookups to own
  properties. Euler/Quaternion public components and Vector2/Vector4 width/height
  accessors remain supported through explicit class and key checks. The same
  narrow check preserves Material alphaTest and the seven MeshPhysicalMaterial
  strength accessors (anisotropy, clearcoat, iridescence, dispersion,
  retroreflectivity, sheen and transmission).
- Every animation root/name/clip/action cache dictionary has a null prototype.
- Tracks, interpolants and property mixers require positive integer dimensions;
  quaternion dimensions are multiples of four. Interpolant dimensions cannot
  exceed the actual sample array length, including when a result buffer is
  supplied. Stride loops use bounds.
- Ellipse/Arc sampling rejects nonfinite angles/differences and reduces large
  finite deltas with bounded modulo, preserving zero/full/clockwise semantics.
- Both shadow material cache levels have null prototypes; disposal tests own
  membership.

Run the hostile probes only in the disposable stage. The Node driver launches
one child for each case and enforces a 1.8 second outer SIGKILL timeout, including
parsing and activation. Each child has a clean JavaScript realm.

```sh
node tools/vendor-three/regression.mjs --library "$THREE_STAGE/output/three.module.min.js" --source "$THREE_STAGE/build-source/package" --expect fixed
```

The same command with the preserved original vendor pair and the unpatched npm
source plus `--expect baseline` proves the original failures. Baseline timeout
cases must be externally killed; an in-realm timer cannot interrupt their loop.
Normal binding, scalar/vector/quaternion/Bezier animation, cache cleanup and
ellipse semantics are controls that must pass on both versions.

For actual renderer coverage, use a Python with Playwright installed
and installed Chrome. This creates a temporary loopback-only server and a fresh
headless Chrome process for each material/light case. The outer process kills
the entire child process group after 20 seconds. It renders real WebGL2 shadows
through SwiftShader, checks Object.prototype, Object and Object.prototype.toString
descriptors, repeats rendering and checks cached shadow material disposal.
No screenshots or visual acceptance are performed.

```sh
python3 tools/vendor-three/shadow_regression.py --root "$MANAGED_TEMP_PARENT" --library "$THREE_STAGE/output/three.module.min.js" --expect fixed
```

With the original vendor pair and `--expect baseline`, reserved material UUIDs
must reproduce prototype/function pollution; ordinary UUID controls must render
and dispose correctly. Point and directional lights cover distance and depth
shadow materials.

To run the 75 nearest upstream tests, download the pinned repository test
archive into the same stage (the archive is about 362 MB; only test files are
extracted), then run its unmodified assertions with corrected valid fixtures:

```sh
python3 tools/vendor-three/prepare_upstream_tests.py --stage "$THREE_STAGE"
node tools/vendor-three/upstream_tests.mjs --source "$THREE_STAGE/upstream-tests" --qunit "$THREE_STAGE/build-tools/node_modules/qunit/qunit/qunit.js"
```

`upstream-fixtures.patch` only corrects three original placeholder fixtures:
Color track 3 values/2 times, a zero-dimensional mock interpolant, and a
two-component quaternion interpolant. The new boundary intentionally rejects
these malformed dimensions. Original fixture execution records 70 passed and
5 rejected tests; the same 75 assertions pass after the fixture corrections.
All assertions and test cases are retained.
