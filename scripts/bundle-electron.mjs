import * as esbuild from 'esbuild';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entryMain = path.join(root, 'electron/main.ts');
const entrySplashOnly = path.join(root, 'electron/splash-only.main.ts');
const entryErrorOnly = path.join(root, 'electron/error-only.main.ts');
const entryPreload = path.join(root, 'electron/preload/main.preload.ts');

const outMain = path.join(root, 'dist/electron/main.js');
const outSplashOnly = path.join(root, 'dist/electron/splash-only.main.js');
const outErrorOnly = path.join(root, 'dist/electron/error-only.main.js');
const outPreload = path.join(root, 'dist/electron/preload/main.preload.js');

await mkdir(path.dirname(outPreload), { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
  external: ['electron', 'electron-updater'],
};

await Promise.all([
  esbuild.build({
    ...common,
    entryPoints: [entryMain],
    outfile: outMain,
  }),
  esbuild.build({
    ...common,
    entryPoints: [entrySplashOnly],
    outfile: outSplashOnly,
  }),
  esbuild.build({
    ...common,
    entryPoints: [entryErrorOnly],
    outfile: outErrorOnly,
  }),
  esbuild.build({
    ...common,
    entryPoints: [entryPreload],
    outfile: outPreload,
  }),
]);
