#!/usr/bin/env node
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const desktop = path.join(root, 'apps/desktop');
const watch = process.argv.includes('--watch');
const nodeEnv = JSON.stringify(process.env.NODE_ENV ?? 'development');

const mainOptions = {
  absWorkingDir: root,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  external: [
    'electron',
    'original-fs',
    'pg',
    'mysql2',
    'mysql2/promise',
    'better-sqlite3',
    'mongodb',
    'ioredis',
    'mssql',
    'oracledb',
    '@clickhouse/client',
  ],
};

/** Sandboxed preload cannot require() Node builtins — alias to Electron globals. */
const preloadOptions = {
  absWorkingDir: root,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  external: ['electron'],
  define: {
    'process.env.NODE_ENV': nodeEnv,
  },
  alias: {
    process: path.join(root, 'tooling/shims/electron-sandbox-process.cjs'),
    buffer: path.join(root, 'tooling/shims/electron-sandbox-buffer.cjs'),
  },
};

const contexts = [
  {
    ...mainOptions,
    entryPoints: [path.join(desktop, 'src/main/main.ts')],
    outfile: path.join(desktop, 'dist/main.cjs'),
  },
  {
    ...preloadOptions,
    entryPoints: [path.join(desktop, 'src/preload/main.preload.ts')],
    outfile: path.join(desktop, 'dist/preload/main.preload.cjs'),
  },
  {
    ...preloadOptions,
    entryPoints: [path.join(desktop, 'src/preload/error.preload.ts')],
    outfile: path.join(desktop, 'dist/preload/error.preload.cjs'),
  },
];

if (watch) {
  const ctxs = await Promise.all(contexts.map((item) => esbuild.context(item)));
  await Promise.all(ctxs.map((ctx) => ctx.watch()));
  console.log('Watching Electron bundles…');
} else {
  await Promise.all(contexts.map((item) => esbuild.build(item)));
}
