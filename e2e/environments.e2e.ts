import { expect, test } from '@playwright/test';

import { clickRail, closeApp, isAppBuilt, launchApp, type Launched } from './helpers/app';

test.describe.configure({ mode: 'serial' });

test.describe('tx-environments-sidebar', () => {
  test.skip(!isAppBuilt(), 'Run `npm run build` first.');

  let launched: Launched;

  test.beforeAll(async () => {
    launched = await launchApp();
  });

  test.afterAll(async () => {
    await closeApp(launched);
  });

  test('opens the default Local environment in the editor', async () => {
    await clickRail(launched.window, 'Environments');
    const sidebar = launched.window.locator('tx-environments-sidebar');
    await expect(sidebar).toBeVisible();
    await sidebar.getByRole('option', { name: /Local/ }).click();
    await expect(launched.window.locator('tx-environment-editor')).toBeVisible();
  });
});
