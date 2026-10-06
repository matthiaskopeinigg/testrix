import { spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const MAIN = path.join(ROOT, 'apps/desktop/dist/main.cjs');
const RENDERER = path.join(ROOT, 'apps/renderer/dist/renderer/browser/index.html');

export interface Launched {
  app: ElectronApplication;
  window: Page;
  readonly userData: string;
}

export function isAppBuilt(): boolean {
  return existsSync(MAIN) && existsSync(RENDERER);
}

/**
 * Extra main-process env. A dummy feed host is always set first so leftover
 * `%TEMP%/testrix-local-releases.json` cannot take over an e2e profile.
 */
export async function launchApp(userData?: string, env: NodeJS.ProcessEnv = {}): Promise<Launched> {
  const profile = userData ?? (await mkdtemp(path.join(os.tmpdir(), 'testrix-e2e-')));
  const app = await electron.launch({
    args: [
      MAIN,
      ...(process.platform === 'linux'
        ? ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--ozone-platform=x11']
        : []),
    ],
    env: {
      ...process.env,
      TESTRIX_UPDATE_FEED: 'http://127.0.0.1:1',
      TESTRIX_UPDATE_PUBLIC_KEY: '',
      TESTRIX_UPDATE_INSTALL_DIR: '',
      TESTRIX_UPDATE_SETUP_MAIN: '',
      TESTRIX_UPDATE_STUB_INSTALLER: '',
      TESTRIX_USER_DATA_DIR: profile,
      TESTRIX_NO_SPLASH: '1',
      TESTRIX_E2E: '1',
      ELECTRON_ENABLE_LOGGING: '1',
      ...(process.platform === 'linux' ? { ELECTRON_OZONE_PLATFORM_HINT: 'x11' } : {}),
      ...env,
    },
  });
  if (process.env['CI']) {
    const child = app.process();
    child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk));
    child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));
  }
  const window = await app.firstWindow({ timeout: 60_000 });
  await window.waitForSelector('tx-shell', { timeout: 60_000 });
  return { app, window, userData: profile };
}

export async function closeApp(launched: Launched | undefined, keepProfile = false): Promise<void> {
  if (!launched?.app) return;
  await stopAppProcess(launched.app.process());
  if (!keepProfile) {
    await rm(launched.userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

export async function relaunchApp(launched: Launched): Promise<Launched> {
  await closeApp(launched, true);
  return launchApp(launched.userData);
}

/**
 * Playwright launches Electron detached and waits for the child `close` event
 * during worker teardown. A single-pid kill leaves helper processes holding
 * stdio, so that event never arrives. Kill the process group, then destroy the
 * pipes. Do not call `ChildProcess.kill` — that sets `killed` and makes
 * Playwright skip its own group kill.
 */
async function stopAppProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null && !hasOpenStdio(child)) return;
  const closed = new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 5_000);
    child.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  killAppTree(child);
  if (child.exitCode === null) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1_000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  // Node emits process `close` only after every stdio pipe ends. Electron's
  // helper processes keep those pipes open, so destroy them once the parent
  // has exited. That is what removes Playwright's teardown handle.
  for (const stream of child.stdio) stream?.destroy();
  await closed;
}

function killAppTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL');
  } catch (error) {
    if (isMissingProcess(error)) return;
    try {
      process.kill(pid, 'SIGKILL');
    } catch (fallbackError) {
      if (!isMissingProcess(fallbackError)) throw fallbackError;
    }
  }
}

function hasOpenStdio(child: ChildProcess): boolean {
  return child.stdout?.readable === true || child.stderr?.readable === true;
}

function isMissingProcess(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH';
}

export async function clickRail(window: Page, label: string): Promise<void> {
  const heading = window
    .locator('tx-sidebar')
    .first()
    .getByRole('heading', { name: label, exact: true });
  if (await heading.isVisible()) return;
  await window.getByRole('button', { name: label, exact: true }).click();
}
