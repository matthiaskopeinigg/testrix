import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IpcChannels } from '@testrix/contracts';

import { IpcValidationError } from './ipc-handle';
import type { IpcContext } from './register-ipc';

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showOpenDialog: vi.fn() },
  nativeTheme: { shouldUseDarkColors: true, themeSource: 'system', on: vi.fn() },
  app: { getVersion: () => '0.0.0-test' },
}));

const { registerIpc } = await import('./register-ipc');

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function fakeIpcMain() {
  const listeners = new Map<string, Listener>();
  const ipcMain = {
    handle: (channel: string, listener: Listener) => void listeners.set(channel, listener),
    on: vi.fn(),
  } as unknown as IpcMain;
  const invoke = (channel: string, url: string, ...args: unknown[]) =>
    listeners.get(channel)!({ senderFrame: { url } } as unknown as IpcMainInvokeEvent, ...args);
  return { ipcMain, invoke };
}

const TRUSTED = 'file:///app/index.html';

describe('registerIpc', () => {
  let invoke: (channel: string, url: string, ...args: unknown[]) => unknown;

  beforeEach(() => {
    const fake = fakeIpcMain();
    registerIpc(fake.ipcMain, { getMainWindow: () => null } as IpcContext);
    invoke = fake.invoke;
  });

  it('rejects a settings patch that is not an object', () => {
    expect(() => invoke(IpcChannels.settingsSet, TRUSTED, 'dark')).toThrow(IpcValidationError);
  });

  it('rejects a workspace switch with a non-id payload', () => {
    expect(() => invoke(IpcChannels.workspacesSwitch, TRUSTED, { not: 'an id' })).toThrow(/Invalid request/);
  });

  it('rejects a config reveal target outside the allowlist', () => {
    expect(() => invoke(IpcChannels.configReveal, TRUSTED, '../../../etc/passwd')).toThrow(/Invalid request/);
  });

  it('rejects extra arguments on a no-arg channel', () => {
    expect(() => invoke(IpcChannels.appGetVersion, TRUSTED, 'surprise')).toThrow(IpcValidationError);
  });

  it('minimizes after the current input event', async () => {
    vi.useFakeTimers();
    const win = {
      isDestroyed: () => false,
      setMinimizable: vi.fn(),
      minimize: vi.fn(),
      on: vi.fn(),
    };
    const fake = fakeIpcMain();
    registerIpc(fake.ipcMain, { getMainWindow: () => win } as unknown as IpcContext);
    fake.invoke(IpcChannels.windowMinimize, TRUSTED);
    expect(win.minimize).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(win.setMinimizable).toHaveBeenCalledWith(true);
    expect(win.minimize).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('toggles maximize after the current input event', async () => {
    vi.useFakeTimers();
    const win = {
      isDestroyed: () => false,
      setMaximizable: vi.fn(),
      isMaximized: () => true,
      unmaximize: vi.fn(),
      maximize: vi.fn(),
      on: vi.fn(),
    };
    const fake = fakeIpcMain();
    registerIpc(fake.ipcMain, { getMainWindow: () => win } as unknown as IpcContext);
    fake.invoke(IpcChannels.windowMaximize, TRUSTED);
    expect(win.unmaximize).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(win.unmaximize).toHaveBeenCalledOnce();
    expect(win.maximize).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
