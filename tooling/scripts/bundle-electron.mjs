#!/usr/bin/env node
import * as esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const desktop = path.join(root, 'apps/desktop');
const watch = process.argv.includes('--watch');

const options = {
  absWorkingDir: root,
  bundle: true,
  platform: 'node',
  format: 'esm',
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

const contexts = [
  {
    ...options,
    format: 'cjs',
    entryPoints: [path.join(desktop, 'src/main/main.ts')],
    outfile: path.join(desktop, 'dist/main.cjs'),
  },
  {
    ...options,
    format: 'cjs',
    entryPoints: [path.join(desktop, 'src/preload/main.preload.ts')],
    outfile: path.join(desktop, 'dist/preload/main.preload.cjs'),
  },
  {
    ...options,
    format: 'cjs',
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
