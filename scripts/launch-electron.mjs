#!/usr/bin/env node
/**
 * Starts Electron and restarts it when the main/preload bundles change during dev.
 */

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

process.chdir(repoRoot);

process.env.TESTRIX_SERVE_RENDERER = '1';
delete process.env.TESTRIX_NO_SPLASH;
delete process.env.TESTRIX_SPLASH_ONLY;

const restartTargets = [
  path.join(repoRoot, 'dist/electron/main.js'),
  path.join(repoRoot, 'dist/electron/preload/main.preload.js'),
];

const extraArgs = process.argv.slice(2);
let child = null;
let restartTimer = null;

/** Coalesce rapid rebuild signals only — restart runs as soon as the prior process exits. */
const RESTART_DEBOUNCE_MS = 0;

function startElectron() {
  child = spawn('npx', ['electron', '--enable-logging', '.', ...extraArgs], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

function scheduleRestart(reason) {
  if (restartTimer !== null) {
    clearTimeout(restartTimer);
  }
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (!child) {
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`[electron] restarting after ${reason}`);
    child.removeAllListeners('exit');
    child.once('exit', () => startElectron());
    child.kill();
  }, RESTART_DEBOUNCE_MS);
}

for (const target of restartTargets) {
  watch(target, () => scheduleRestart(path.basename(target)));
}

startElectron();
