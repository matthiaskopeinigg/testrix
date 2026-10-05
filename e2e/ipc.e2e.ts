import { expect, test } from '@playwright/test';

import { closeApp, isAppBuilt, launchApp, type Launched } from './helpers/app';

test.describe.configure({ mode: 'serial' });

test.describe('preload IPC', () => {
  test.skip(!isAppBuilt(), 'Run `npm run build` first.');

  let launched: Launched;

  test.beforeAll(async () => {
    launched = await launchApp();
  });

  test.afterAll(async () => {
    await closeApp(launched);
  });

  test('rejects malformed IPC payloads', async () => {
    const message = await launched.window.evaluate(async () => {
      const bridge = (
        globalThis as unknown as { testrix: { workspaces: { switch: (id: unknown) => Promise<unknown> } } }
      ).testrix;
      try {
        await bridge.workspaces.switch({ not: 'an id' });
        return 'accepted';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    });
    expect(message).toMatch(/Invalid request/);
  });
});
