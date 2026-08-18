#!/usr/bin/env node
/**
 * Starts Electron and restarts it when the main/preload bundles or E2E runner
 * scripts change during dev.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { watch } from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronBinary = require('electron');

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

process.chdir(repoRoot);

process.env.TESTRIX_SERVE_RENDERER = '1';
if (!process.env.TESTRIX_CONFIG_DIR?.trim()) {
  process.env.TESTRIX_CONFIG_DIR = path.join(repoRoot, '.config');
}
delete process.env.TESTRIX_NO_SPLASH;
delete process.env.TESTRIX_SPLASH_ONLY;

const restartTargets = [
  path.join(repoRoot, 'dist/electron/main.js'),
  path.join(repoRoot, 'dist/electron/preload/main.preload.js'),
  path.join(repoRoot, 'dist/electron/preload/e2e-pick.preload.js'),
  path.join(repoRoot, 'dist/electron/services/testing/e2e'),
];

const extraArgs = process.argv.slice(2);

/** Coalesce rapid esbuild writes (main + preload often rebuild back-to-back). */
const RESTART_DEBOUNCE_MS = 350;

/** Win32 may keep cache file locks briefly after Electron exits. */
const RESTART_EXIT_SETTLE_MS = process.platform === 'win32' ? 300 : 0;

/** Force-kill if graceful shutdown stalls during dev restarts. */
const STOP_TIMEOUT_MS = 5_000;

let child = null;
let restartTimer = null;
let restartInFlight = false;
let pendingRestart = false;

function startElectron() {
  child = spawn(electronBinary, ['--enable-logging', '.', ...extraArgs], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
    windowsHide: false,
  });

  child.on('exit', (code, signal) => {
    child = null;
    if (restartInFlight) {
      return;
    }
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

/** Stops the Electron process tree. `force` uses SIGKILL / taskkill /F. */
function killProcessTree(pid, force) {
  if (process.platform === 'win32') {
    const args = ['/PID', String(pid), '/T'];
    if (force) {
      args.push('/F');
    }
    spawnSync('taskkill', args, { stdio: 'ignore' });
    return;
  }

  try {
    process.kill(-pid, force ? 'SIGKILL' : 'SIGTERM');
  } catch {
    try {
      process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
    } catch {
      /* already exited */
    }
  }
}

function waitForChildExit(timeoutMs) {
  return new Promise((resolve) => {
    if (!child) {
      resolve(true);
      return;
    }

    const target = child;
    let settled = false;

    const finish = (ok) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    target.once('exit', () => finish(true));
  });
}

async function stopElectron() {
  if (!child?.pid) {
    child = null;
    return;
  }

  const pid = child.pid;
  child.removeAllListeners('exit');
  killProcessTree(pid, false);

  const exited = await waitForChildExit(STOP_TIMEOUT_MS);
  if (!exited && child?.pid) {
    killProcessTree(child.pid, true);
    await waitForChildExit(1_000);
  }

  child = null;
}

async function performRestart(reason) {
  if (restartInFlight) {
    pendingRestart = true;
    return;
  }

  restartInFlight = true;
  // eslint-disable-next-line no-console
  console.log(`[electron] restarting after ${reason}`);

  try {
    await stopElectron();
    if (RESTART_EXIT_SETTLE_MS > 0) {
      await new Promise((resolve) => setTimeout(resolve, RESTART_EXIT_SETTLE_MS));
    }
    startElectron();
  } finally {
    restartInFlight = false;
    if (pendingRestart) {
      pendingRestart = false;
      void performRestart('coalesced rebuild');
    }
  }
}

function scheduleRestart(reason) {
  if (restartTimer !== null) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(() => {
    restartTimer = null;
    void performRestart(reason);
  }, RESTART_DEBOUNCE_MS);
}

for (const target of restartTargets) {
  watch(target, { recursive: true }, () => scheduleRestart(path.basename(target)));
}

startElectron();
