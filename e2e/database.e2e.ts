import { expect, test } from '@playwright/test';

import { clickRail, closeApp, isAppBuilt, launchApp, type Launched } from './helpers/app';

test.describe.configure({ mode: 'serial' });

test.describe('tx-database-sidebar', () => {
  test.skip(!isAppBuilt(), 'Run `npm run build` first.');

  let launched: Launched;

  test.beforeAll(async () => {
    launched = await launchApp();
  });

  test.afterAll(async () => {
    await closeApp(launched);
  });

  test('opens the Database rail and shows the sidebar', async () => {
    await clickRail(launched.window, 'Database');
    const sidebar = launched.window.locator('tx-database-sidebar');
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Connections' })).toBeVisible();
  });
});
