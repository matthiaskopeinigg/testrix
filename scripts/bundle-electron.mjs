import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';
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
  external: ['electron', 'electron-updater', 'better-sqlite3', 'ioredis', 'pg', 'mysql2', 'mssql'],
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

const distElectron = path.join(root, 'dist/electron');
const e2eSrc = path.join(root, 'electron/services/testing/e2e');
const e2eDest = path.join(distElectron, 'services/testing/e2e');
mkdirSync(e2eDest, { recursive: true });
cpSync(e2eSrc, e2eDest, { recursive: true });
cpSync(
  path.join(root, 'electron/preload/e2e-pick.preload.js'),
  path.join(distElectron, 'preload/e2e-pick.preload.js'),
);
