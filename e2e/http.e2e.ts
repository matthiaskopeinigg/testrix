import { createServer } from 'node:http';

import { expect, test } from '@playwright/test';

import { closeApp, isAppBuilt, launchApp, type Launched } from './helpers/app';

test.describe.configure({ mode: 'serial' });

test.describe('request send', () => {
  test.skip(!isAppBuilt(), 'Run `npm run build` first.');

  let launched: Launched;

  test.beforeAll(async () => {
    launched = await launchApp();
  });

  test.afterAll(async () => {
    await closeApp(launched);
  });

  test('sends an HTTP GET to a local server', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('pong');
    });
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        resolve(typeof address === 'object' && address ? address.port : 0);
      });
    });
    try {
      const result = await launched.window.evaluate(async (url) => {
        const bridge = (
          globalThis as unknown as {
            testrix: {
              http: {
                execute: (payload: { method: string; url: string }) => Promise<{ status: number; body: string }>;
              };
            };
          }
        ).testrix;
        return bridge.http.execute({ method: 'GET', url });
      }, `http://127.0.0.1:${port}/ping`);
      expect(result.status).toBe(200);
      expect(result.body).toBe('pong');
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
