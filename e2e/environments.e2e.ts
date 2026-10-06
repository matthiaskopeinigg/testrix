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

  test('creates an environment and opens it in the editor', async () => {
    await clickRail(launched.window, 'Environments');
    const sidebar = launched.window.locator('tx-environments-sidebar');
    await expect(sidebar).toBeVisible();
    await sidebar.getByRole('button', { name: 'New environment' }).click();
    const rename = sidebar.locator('[data-env-rename]');
    await expect(rename).toBeVisible();
    await rename.press('Enter');
    await sidebar.getByRole('option', { name: /New environment/ }).click();
    await expect(launched.window.locator('tx-environment-editor')).toBeVisible();
  });
});
