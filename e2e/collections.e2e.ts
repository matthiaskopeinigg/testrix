import { expect, test } from '@playwright/test';

import { clickRail, closeApp, isAppBuilt, launchApp, type Launched } from './helpers/app';

test.describe.configure({ mode: 'serial' });

test.describe('tx-collections-sidebar', () => {
  test.skip(!isAppBuilt(), 'Run `npm run build` first.');

  let launched: Launched;

  test.beforeAll(async () => {
    launched = await launchApp();
  });

  test.afterAll(async () => {
    await closeApp(launched);
  });

  test('creates a request and shows the editor', async () => {
    await clickRail(launched.window, 'Collections');
    const sidebar = launched.window.locator('tx-collections-sidebar');
    await expect(sidebar).toBeVisible();
    await sidebar.getByRole('button', { name: 'New request' }).click();
    await expect(launched.window.locator('tx-request-editor')).toBeVisible();
  });
});
