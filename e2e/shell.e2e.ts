import { expect, test } from '@playwright/test';

import { clickRail, closeApp, isAppBuilt, launchApp, type Launched } from './helpers/app';

test.describe.configure({ mode: 'serial' });

test.describe('tx-shell', () => {
  test.skip(!isAppBuilt(), 'Run `npm run build` first.');

  let launched: Launched;

  test.beforeAll(async () => {
    launched = await launchApp();
  });

  test.afterAll(async () => {
    await closeApp(launched);
  });

  test('boots into the workbench without renderer errors', async () => {
    const errors: string[] = [];
    launched.window.on('pageerror', (error) => errors.push(error.message));
    await launched.window.waitForTimeout(1_000);
    await expect(launched.window.locator('tx-shell')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('keeps Node out of the renderer and blocks popups', async () => {
    const probe = await launched.window.evaluate(() => ({
      hasRequire: typeof (globalThis as { require?: unknown }).require !== 'undefined',
      hasProcess: typeof (globalThis as { process?: unknown }).process !== 'undefined',
      hasBridge: typeof (globalThis as { testrix?: unknown }).testrix === 'object',
      popup: window.open('about:blank') === null,
    }));
    expect(probe).toEqual({ hasRequire: false, hasProcess: false, hasBridge: true, popup: true });
    expect(launched.app.windows().length).toBe(1);
  });

  test('rail clicks show the matching sidebar', async () => {
    await clickRail(launched.window, 'Database');
    await expect(launched.window.locator('tx-database-sidebar')).toBeVisible();
    await clickRail(launched.window, 'Services');
    await expect(launched.window.locator('tx-services-sidebar')).toBeVisible();
    await expect(launched.window.getByRole('option', { name: 'Flows' })).toBeVisible();
    await clickRail(launched.window, 'Environments');
    await expect(launched.window.locator('tx-environments-sidebar')).toBeVisible();
    await clickRail(launched.window, 'Tools');
    await expect(launched.window.locator('tx-tools-sidebar')).toBeVisible();
    await clickRail(launched.window, 'History');
    await expect(launched.window.locator('tx-history-sidebar')).toBeVisible();
    await clickRail(launched.window, 'Collections');
    await expect(launched.window.locator('tx-collections-sidebar')).toBeVisible();
  });

  test('opens Help from the rail', async () => {
    await launched.window.getByRole('button', { name: 'Open help' }).click();
    const help = launched.window.locator('tx-help-overlay');
    await expect(help).toBeVisible();
    await expect(help.getByRole('navigation', { name: 'Help sections' })).toBeVisible();
  });
});
