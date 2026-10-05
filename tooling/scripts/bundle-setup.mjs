#!/usr/bin/env node
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const setup = path.join(root, 'apps/setup');

const shared = {
  absWorkingDir: root,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  external: ['electron', 'original-fs'],
};

/** Sandboxed preload cannot require() Node builtins — alias to Electron globals. */
const preload = {
  ...shared,
  external: ['electron'],
  alias: {
    process: path.join(root, 'tooling/shims/electron-sandbox-process.cjs'),
    buffer: path.join(root, 'tooling/shims/electron-sandbox-buffer.cjs'),
  },
};

await Promise.all([
  esbuild.build({
    ...shared,
    entryPoints: [path.join(setup, 'src/main/main.ts')],
    outfile: path.join(setup, 'dist/main.cjs'),
  }),
  esbuild.build({
    ...preload,
    entryPoints: [path.join(setup, 'src/preload/preload.ts')],
    outfile: path.join(setup, 'dist/preload/preload.cjs'),
  }),
  esbuild.build({
    ...shared,
    entryPoints: [path.join(setup, 'src/main/copy-worker.ts')],
    outfile: path.join(setup, 'dist/copy-worker.js'),
  }),
]);
