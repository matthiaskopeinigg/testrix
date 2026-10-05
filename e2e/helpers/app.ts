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
    args: [MAIN, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: {
      ...process.env,
      TESTRIX_UPDATE_FEED: 'http://127.0.0.1:1',
      TESTRIX_UPDATE_PUBLIC_KEY: '',
      TESTRIX_UPDATE_INSTALL_DIR: '',
      TESTRIX_UPDATE_SETUP_MAIN: '',
      TESTRIX_UPDATE_STUB_INSTALLER: '',
      TESTRIX_USER_DATA_DIR: profile,
      TESTRIX_NO_SPLASH: '1',
      ELECTRON_ENABLE_LOGGING: '1',
      ...env,
    },
  });
  const window = await app.firstWindow();
  await window.waitForSelector('tx-shell', { timeout: 60_000 });
  return { app, window, userData: profile };
}

export async function closeApp(launched: Launched, keepProfile = false): Promise<void> {
  await launched.app.close();
  if (!keepProfile) await rm(launched.userData, { recursive: true, force: true });
}

export async function relaunchApp(launched: Launched): Promise<Launched> {
  await launched.app.close();
  return launchApp(launched.userData);
}

export async function clickRail(window: Page, label: string): Promise<void> {
  const heading = window.locator('tx-sidebar').first().getByRole('heading', { name: label, exact: true });
  if (await heading.isVisible()) return;
  await window.getByRole('button', { name: label, exact: true }).click();
}
