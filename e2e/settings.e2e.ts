import { expect, test } from '@playwright/test';

import { closeApp, isAppBuilt, launchApp, type Launched } from './helpers/app';

test.describe.configure({ mode: 'serial' });

test.describe('tx-settings-overlay', () => {
  test.skip(!isAppBuilt(), 'Run `npm run build` first.');

  let launched: Launched;

  test.beforeAll(async () => {
    launched = await launchApp();
  });

  test.afterAll(async () => {
    await closeApp(launched);
  });

  test('opens from the titlebar Settings button', async () => {
    await launched.window.getByRole('button', { name: 'Open settings' }).click();
    const overlay = launched.window.locator('tx-settings-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay.getByRole('heading', { name: /Get started|Appearance|Settings/ })).toBeVisible();
  });
});
