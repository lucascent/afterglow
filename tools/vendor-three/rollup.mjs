import fs from 'node:fs/promises';
import path from 'node:path';
import { rollup } from 'rollup';
import { minify } from 'terser';

const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error('Usage: rollup.mjs SOURCE OUTPUT');
const bundle = await rollup({
  input: {
    'three.core.js': path.join(source, 'src/Three.Core.js'),
    'three.module.min.js': path.join(source, 'src/Three.js'),
  },
  preserveEntrySignatures: 'allow-extension',
  plugins: [{
    name: 'upstream-glsl',
    transform(code, id) {
      if (!id.endsWith('.glsl.js')) return null;
      return { code: code.replace(/\/\* glsl \*\/`(.*?)`/sg, (_, shader) => JSON.stringify(
        shader.trim().replace(/\r/g, '').replace(/[ \t]*\/\/.*\n/g, '')
          .replace(/[ \t]*\/\*[\s\S]*?\*\//g, '').replace(/\n{2,}/g, '\n')
      )), map: null };
    },
  }],
});
const result = await bundle.generate({ format: 'esm', entryFileNames: '[name]', minifyInternalExports: false });
await fs.mkdir(output, { recursive: true });
for (const chunk of result.output) {
  if (chunk.type !== 'chunk' || !['three.core.js', 'three.module.min.js'].includes(chunk.fileName)) {
    throw new Error(`Unexpected build output: ${chunk.fileName}`);
  }
  const compact = await minify(chunk.code, { module: true, format: { comments: false } });
  const header = '/**\n * @license\n * Copyright 2010-2026 Three.js Authors\n * SPDX-License-Identifier: MIT\n * three@0.186.1 with local security patches; see tools/vendor-three/README.md.\n */\n';
  await fs.writeFile(path.join(output, chunk.fileName), header + compact.code + '\n');
}
await fs.copyFile(path.join(source, 'LICENSE'), path.join(output, 'LICENSE'));
await bundle.close();
