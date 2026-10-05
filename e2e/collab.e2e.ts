import { expect, test } from '@playwright/test';

import { closeApp, isAppBuilt, launchApp, type Launched } from './helpers/app';

test.describe.configure({ mode: 'serial' });

test.describe('tx-collab-panel', () => {
  test.skip(!isAppBuilt(), 'Run `npm run build` first.');

  let launched: Launched;

  test.beforeAll(async () => {
    launched = await launchApp();
  });

  test.afterAll(async () => {
    await closeApp(launched);
  });

  test('opens the dock from the titlebar and shows Connect a repository', async () => {
    await launched.window.getByRole('button', { name: 'Collab' }).click();
    await expect(launched.window.locator('tx-collab-panel')).toBeVisible();
    await expect(launched.window.getByRole('button', { name: 'Connect a repository' })).toBeVisible();
  });
});
