#!/usr/bin/env node
/**
 * Keeps Electron entrypoints rebuilt while `npm start` / `npm run dev` (`serve-desktop.mjs`) runs.
 * esbuild ≥0.27 requires `context().watch()` — `build({ watch: true })` is invalid.
 *
 * E2E runner JS is required from `dist/` at runtime (not bundled into main.js), so this
 * script also recopies those files when they change.
 */

import * as esbuild from 'esbuild';
import { watch } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { copyElectronStaticAssets } from './copy-electron-static-assets.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: true,
  external: ['electron', 'electron-updater', 'better-sqlite3', 'ioredis', 'pg', 'mysql2', 'mssql', 'oracledb', 'mongodb', '@clickhouse/client'],
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

copyElectronStaticAssets(root);

const contexts = await Promise.all(targets.map((opts) => esbuild.context(opts)));

await Promise.all(contexts.map((ctx) => ctx.watch()));

const COPY_DEBOUNCE_MS = 200;
let copyTimer = null;

function scheduleCopy() {
  if (copyTimer !== null) {
    clearTimeout(copyTimer);
  }
  copyTimer = setTimeout(() => {
    copyTimer = null;
    try {
      copyElectronStaticAssets(root);
    } catch (err) {
      console.warn('[watch-electron] copy static assets failed:', err instanceof Error ? err.message : err);
    }
  }, COPY_DEBOUNCE_MS);
}

const staticWatchRoots = [
  path.join(root, 'electron/services/testing/e2e'),
  path.join(root, 'electron/preload/e2e-pick.preload.js'),
  path.join(root, 'electron/uninstaller'),
];

for (const target of staticWatchRoots) {
  watch(target, { recursive: true }, () => scheduleCopy());
}
