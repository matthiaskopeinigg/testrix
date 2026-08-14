#!/usr/bin/env node
/**
 * Runs `ng serve`, esbuild `--watch`, and Electron together.
 *
 * Flags:
 *   (none) → `npm start`: `ng serve` + Electron (splash as soon as Electron is ready; renderer loads when dev server is up).
 *   `--devtools` → `npm run dev`: same, plus Electron dev toolkit (devtools, verbose logs).
 */

import concurrently from 'concurrently';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const joinCh = (...c) => c.join('');
const PREFIX = joinCh('T', 'E', 'S', 'T', 'R', 'I', 'X');

/** Literal env names spelled char-wise (avoid accidental mangling when editing). */
const SERVE_RENDERER = PREFIX + joinCh('_', 'S', 'E', 'R', 'V', 'E', '_', 'R', 'E', 'N', 'D', 'E', 'R', 'E', 'R');

const DEV_TOOLKIT = PREFIX + joinCh('_', 'D', 'E', 'V');

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.join(scriptsDir, '..');

process.chdir(repoRoot);

/** Keep in sync with `angular.json` → `projects.testrix.architect.serve.options.port`. */
function readDevServerPort() {
  const angularJson = JSON.parse(readFileSync(path.join(repoRoot, 'angular.json'), 'utf8'));
  return angularJson.projects.testrix.architect.serve.options.port;
}

const devServerPort = readDevServerPort();
process.env.TESTRIX_DEV_URL = process.env.TESTRIX_DEV_URL ?? `http://localhost:${devServerPort}`;

const devToolkit = process.argv.includes('--devtools');

process.env[SERVE_RENDERER] = '1';
delete process.env.TESTRIX_NO_SPLASH;
delete process.env.TESTRIX_SPLASH_ONLY;

if (devToolkit) {
  process.env[DEV_TOOLKIT] = '1';
} else {
  delete process.env[DEV_TOOLKIT];
}

process.env.NODE_ENV = process.env.NODE_ENV ?? 'development';

const runNode = (scriptRel) => spawnSync(process.execPath, [path.join(repoRoot, scriptRel)], { stdio: 'inherit', cwd: repoRoot }).status ?? 1;

if (runNode(path.join('scripts', 'sync-brand-assets.mjs')) !== 0) {
  process.exit(1);
}

if (runNode(path.join('scripts', 'bundle-electron.mjs')) !== 0) {
  process.exit(1);
}

const { result } = concurrently(
  [
    { command: `ng serve --host localhost --port ${devServerPort}`, name: 'ng', prefixColor: 'blue' },

    { command: 'node scripts/watch-electron.mjs', name: 'electron-build', prefixColor: 'yellow' },

    {
      command:
        'wait-on dist/electron/main.js dist/electron/preload/main.preload.js && node scripts/launch-electron.mjs',
      name: 'electron',
      prefixColor: 'green',
    },
  ],
  {
    cwd: repoRoot,
    /** Closing Electron (or Ctrl+C) stops `ng serve` + esbuild watch; those may exit non-zero after SIGTERM. */
    killOthersOn: ['success', 'failure'],
    /** Only the Electron process gates success — avoids unhandled rejections when siblings die after SIGTERM. */
    successCondition: 'command-electron',
  },
);

try {
  await result;
} catch {
  process.exitCode = 1;
}
