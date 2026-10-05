import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { closeApp, isAppBuilt, launchApp, type Launched } from './helpers/app';
import { seedUpdateSettings, startLocalUpdateFeed } from './helpers/update-feed';

test.describe.configure({ mode: 'serial' });

/** Opens Settings and jumps to Updates through search. */
async function openUpdatesPane(window: Page): Promise<void> {
  await window.getByRole('button', { name: 'Open settings' }).click();
  const overlay = window.locator('tx-settings-overlay');
  await expect(overlay).toBeVisible();
  await overlay.locator('#settings-search').fill('Automatic updates');
  await overlay.getByRole('button', { name: /Automatic updates/i }).click();
  await expect(overlay.locator('tx-update-settings-pane')).toBeVisible();
}

test.describe('tx-update-settings-pane', () => {
  test.skip(!isAppBuilt(), 'Run `npm run build` first.');

  let launched: Launched;

  test.beforeAll(async () => {
    const userData = await mkdtemp(path.join(os.tmpdir(), 'testrix-e2e-updates-'));
    await seedUpdateSettings(userData, { autoCheck: false, autoDownload: false });
    launched = await launchApp(userData);
  });

  test.afterAll(async () => {
    await closeApp(launched);
  });

  test('shows why an unpackaged build cannot update itself', async () => {
    await openUpdatesPane(launched.window);
    const unsupported =
      process.platform === 'win32'
        ? 'Development builds do not update themselves'
        : 'Automatic updates are only available on Windows';
    await expect(launched.window.locator('tx-update-settings-pane')).toContainText(unsupported);
    await expect(launched.window.getByRole('button', { name: 'Download & Install' })).toHaveCount(
      0,
    );
  });
});

test.describe('in-app updater feed', () => {
  test.skip(!isAppBuilt(), 'Run `npm run build` first.');

  let launched: Launched;
  let feed: Awaited<ReturnType<typeof startLocalUpdateFeed>>;
  let installDir: string;

  test.beforeAll(async () => {
    feed = await startLocalUpdateFeed('99.0.0');
    const root = await mkdtemp(path.join(os.tmpdir(), 'testrix-e2e-feed-'));
    installDir = path.join(root, 'install');
    const userData = path.join(root, 'profile');
    await seedUpdateSettings(userData, {
      autoCheck: false,
      autoDownload: false,
      channel: 'stable',
    });
    launched = await launchApp(userData, {
      TESTRIX_UPDATE_FEED: feed.origin,
      TESTRIX_UPDATE_PUBLIC_KEY: feed.publicKey,
      TESTRIX_UPDATE_INSTALL_DIR: installDir,
    });
  });

  test.afterAll(async () => {
    await closeApp(launched);
    await feed.close();
  });

  test('discovers the signed feed and offers Download & Install', async () => {
    const status = await launched.window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          testrix: {
            update: {
              getStatus: () => Promise<{
                phase: string;
                error: string | null;
                isSupported: boolean;
                release: { version: string } | null;
              }>;
              check: () => Promise<{
                phase: string;
                error: string | null;
                isSupported: boolean;
                release: { version: string } | null;
              }>;
            };
          };
        }
      ).testrix.update;
      const current = await api.getStatus();
      if (current.phase === 'available' || current.phase === 'ready') return current;
      return api.check();
    });
    expect(status.isSupported).toBe(true);
    expect(status.phase).toBe('available');
    expect(status.release?.version).toBe('99.0.0');
    expect(status.error).toBeNull();

    await openUpdatesPane(launched.window);
    const pane = launched.window.locator('tx-update-settings-pane');
    await expect(pane).toContainText(/Testrix 99\.0.*is available/);
    await expect(pane.getByRole('button', { name: 'Download & Install' })).toBeEnabled();

    const toast = launched.window.locator('tx-toast-layer').getByRole('status');
    await expect(toast).toContainText('Testrix 99.0 is available.');
    await expect(toast.getByRole('button', { name: 'Later' })).toBeVisible();
    await launched.window.getByRole('button', { name: 'Close settings' }).click();
  });

  test('Download & Install leaves 100% behind and starts the install toast', async () => {
    const toast = launched.window.locator('tx-toast-layer').getByRole('status');
    await toast.getByRole('button', { name: 'Download & Install' }).click();
    await expect(toast).toContainText(
      /Downloading Testrix 99\.0|Preparing the update|Installing update|The update is no longer ready/,
      { timeout: 30_000 },
    );
    await expect(toast.getByText('100%', { exact: true })).toHaveCount(0);
    await expect(toast).toContainText(
      /Preparing the update|Installing update|Could not start Testrix|The update is no longer ready/,
      { timeout: 30_000 },
    );
  });
});
