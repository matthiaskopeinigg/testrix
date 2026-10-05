import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { IpcChannels } from '@testrix/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => '',
    on: vi.fn(),
    off: vi.fn(),
    getVersion: () => '0.0.0-test',
  },
  session: { fromPartition: () => ({}) },
  BrowserWindow: class BrowserWindow {},
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn(), openExternal: vi.fn() },
  nativeTheme: { shouldUseDarkColors: true, themeSource: 'system' },
  safeStorage: undefined,
}));

const { ConfigStore } = await import('../config.service');
const { DatabaseHost } = await import('../database/database-host.service');
const { HttpHost } = await import('../http-host.service');
const { TestingRuntime } = await import('./testing-runtime');

describe('TestingRuntime live events', () => {
  let root = '';

  afterEach(async () => {
    if (root)
      await rm(root, { recursive: true, force: true });
  });

  it('broadcasts run events instead of sending them only to the first window', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'testrix-testing-runtime-'));
    const store = new ConfigStore({ getPath: () => root } as unknown as ConstructorParameters<typeof ConfigStore>[0]);
    const primarySend = vi.fn();
    const broadcast = vi.fn();
    const runtime = new TestingRuntime({
      store,
      http: new HttpHost(),
      database: new DatabaseHost(),
      getMainWindow: () => ({ isDestroyed: () => false, webContents: { send: primarySend } }) as never,
      broadcast,
    });
    const payload = { phase: 'step', id: 'flow-1' };

    (runtime as unknown as { send(channel: string, payload: unknown): void }).send(
      IpcChannels.flowEvent,
      payload,
    );

    expect(broadcast).toHaveBeenCalledOnce();
    expect(broadcast).toHaveBeenCalledWith(IpcChannels.flowEvent, payload);
    expect(primarySend).not.toHaveBeenCalled();
  });
});
