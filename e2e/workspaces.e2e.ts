import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { closeApp, isAppBuilt, launchApp, relaunchApp, type Launched } from './helpers/app';

test.describe.configure({ mode: 'serial' });

test.describe('tx-workspace-switcher', () => {
  test.skip(!isAppBuilt(), 'Run `npm run build` first.');

  let launched: Launched;

  test.beforeAll(async () => {
    launched = await launchApp();
  });

  test.afterAll(async () => {
    await closeApp(launched);
  });

  test('opens the switcher and Manage workspaces', async () => {
    await launched.window.getByRole('button', { name: 'Workspace' }).click();
    await expect(launched.window.getByRole('button', { name: 'Manage workspaces' })).toBeVisible();
    await launched.window.getByRole('button', { name: 'Manage workspaces' }).click();
    const manager = launched.window.locator('tx-workspace-manager');
    await expect(manager).toBeVisible();
    await expect(manager.getByRole('heading', { name: 'Manage workspaces' })).toBeVisible();
  });

  test('creates a workspace and keeps it after a restart', async () => {
    const created = await launched.window.evaluate(async () => {
      const bridge = (
        globalThis as unknown as {
          testrix: { workspaces: { create: (name: string) => Promise<{ workspaces: { activeId: string } }> } };
        }
      ).testrix;
      const snapshot = await bridge.workspaces.create('E2E workspace');
      return snapshot.workspaces.activeId;
    });
    launched = await relaunchApp(launched);
    await launched.window.waitForSelector('tx-shell', { timeout: 60_000 });
    const catalog = JSON.parse(
      await readFile(path.join(launched.userData, 'workspaces', 'workspaces.json'), 'utf8'),
    ) as { activeId: string; items: { id: string; name: string }[] };
    expect(catalog.activeId).toBe(created);
    expect(catalog.items.find((item) => item.id === created)?.name).toBe('E2E workspace');
  });
});
