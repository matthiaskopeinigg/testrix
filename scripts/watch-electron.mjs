#!/usr/bin/env node
/**
 * Keeps Electron entrypoints rebuilt while `npm start` / `npm run dev` (`serve-desktop.mjs`) runs.
 * esbuild ≥0.27 requires `context().watch()` — `build({ watch: true })` is invalid.
 */

import * as esbuild from 'esbuild';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  external: ['electron'],
  logLevel: 'info',
};

const targets = [
  {
    ...shared,
    entryPoints: [path.join(root, 'electron/main.ts')],
    outfile: path.join(root, 'dist/electron/main.js'),
  },
  {
    ...shared,
    entryPoints: [path.join(root, 'electron/splash-only.main.ts')],
    outfile: path.join(root, 'dist/electron/splash-only.main.js'),
  },
  {
    ...shared,
    entryPoints: [path.join(root, 'electron/error-only.main.ts')],
    outfile: path.join(root, 'dist/electron/error-only.main.js'),
  },
  {
    ...shared,
    entryPoints: [path.join(root, 'electron/preload/main.preload.ts')],
    outfile: path.join(root, 'dist/electron/preload/main.preload.js'),
  },
];

const contexts = await Promise.all(targets.map((opts) => esbuild.context(opts)));

await Promise.all(contexts.map((ctx) => ctx.watch()));
