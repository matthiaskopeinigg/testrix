import { expect, test } from '@playwright/test';

import { closeApp, isAppBuilt, launchApp, type Launched } from './helpers/app';

test.describe.configure({ mode: 'serial' });

test.describe('tx-command-palette', () => {
  test.skip(!isAppBuilt(), 'Run `npm run build` first.');

  let launched: Launched;

  test.beforeAll(async () => {
    launched = await launchApp();
  });

  test.afterAll(async () => {
    await closeApp(launched);
  });

  test('opens with Ctrl+K, searches, and runs a command', async () => {
    await launched.window.keyboard.press('Control+K');
    const palette = launched.window.locator('tx-command-palette');
    await expect(palette).toBeVisible();
    const search = palette.locator('input[type="search"]');
    await search.fill('Open settings');
    await launched.window.keyboard.press('Enter');
    await expect(launched.window.locator('tx-settings-overlay')).toBeVisible();
  });
});
