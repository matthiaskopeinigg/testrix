import { expect, test } from '@playwright/test';

import { clickRail, closeApp, isAppBuilt, launchApp, type Launched } from './helpers/app';

test.describe.configure({ mode: 'serial' });

test.describe('tx-tools-sidebar', () => {
  test.skip(!isAppBuilt(), 'Run `npm run build` first.');

  let launched: Launched;

  test.beforeAll(async () => {
    launched = await launchApp();
  });

  test.afterAll(async () => {
    await closeApp(launched);
  });

  test('opens UUID Generator from the Tools rail', async () => {
    await clickRail(launched.window, 'Tools');
    const sidebar = launched.window.locator('tx-tools-sidebar');
    await expect(sidebar).toBeVisible();
    await sidebar.getByRole('option', { name: 'UUID Generator' }).click();
    await expect(launched.window.locator('tx-uuid-generator-editor')).toBeVisible();
  });
});
