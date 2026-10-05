import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ipcIdSchema, ipcOptionalIdSchema } from '@testrix/contracts';

import { createIpcHandle, IpcValidationError } from './ipc-handle';

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function fakeIpcMain() {
  const listeners = new Map<string, Listener>();
  const ipcMain = {
    handle: (channel: string, listener: Listener) => void listeners.set(channel, listener),
  } as unknown as IpcMain;
  const invoke = (channel: string, url: string, ...args: unknown[]) =>
    listeners.get(channel)!({ senderFrame: { url } } as unknown as IpcMainInvokeEvent, ...args);
  return { ipcMain, invoke };
}

const TRUSTED = 'file:///app/index.html';
const isTrusted = (url: string) => url.startsWith('file://');

describe('createIpcHandle', () => {
  it('passes parsed arguments to the handler', async () => {
    // Arrange
    const { ipcMain, invoke } = fakeIpcMain();
    const run = vi.fn((_e: IpcMainInvokeEvent, id: string, count: number) => `${id}:${count}`);
    createIpcHandle(ipcMain, isTrusted)('test:run', [ipcIdSchema, z.number().int()], run);

    // Act
    const result = await invoke('test:run', TRUSTED, '  abc  ', 3);

    // Assert
    expect(result).toBe('abc:3');
  });

  it('rejects a payload that does not match the schema', async () => {
    // Arrange
    const { ipcMain, invoke } = fakeIpcMain();
    const run = vi.fn();
    createIpcHandle(ipcMain, isTrusted)('test:bad', [z.object({ name: z.string() })], run);

    // Act
    const call = () => invoke('test:bad', TRUSTED, { name: 42 });

    // Assert
    expect(call).toThrow(IpcValidationError);
    expect(call).toThrow(/test:bad argument 1 at name/);
    expect(run).not.toHaveBeenCalled();
  });

  it('rejects extra arguments', () => {
    // Arrange
    const { ipcMain, invoke } = fakeIpcMain();
    const run = vi.fn();
    createIpcHandle(ipcMain, isTrusted)('test:none', [], run);

    // Act
    const call = () => invoke('test:none', TRUSTED, 'surprise');

    // Assert
    expect(call).toThrow(IpcValidationError);
    expect(run).not.toHaveBeenCalled();
  });

  it('blocks invokes from an untrusted frame', () => {
    // Arrange
    const { ipcMain, invoke } = fakeIpcMain();
    const run = vi.fn();
    createIpcHandle(ipcMain, isTrusted)('test:frame', [], run);

    // Act
    const call = () => invoke('test:frame', 'https://evil.example/');

    // Assert
    expect(call).toThrow(/untrusted|did not come from/);
    expect(run).not.toHaveBeenCalled();
  });

  it('treats trailing undefined arguments as omitted', async () => {
    // Arrange
    const { ipcMain, invoke } = fakeIpcMain();
    const run = vi.fn((_e: IpcMainInvokeEvent, id: string, repoId: string | undefined) => [id, repoId]);
    createIpcHandle(ipcMain, isTrusted)('test:optional', [ipcIdSchema, ipcOptionalIdSchema], run);

    // Act
    const omitted = await invoke('test:optional', TRUSTED, 'flow-1', undefined);
    const blank = await invoke('test:optional', TRUSTED, 'flow-1', '  ');
    const zeroArgs = () => invoke('test:optional', TRUSTED, undefined, undefined);

    // Assert
    expect(omitted).toEqual(['flow-1', undefined]);
    expect(blank).toEqual(['flow-1', undefined]);
    expect(zeroArgs).toThrow(IpcValidationError);
  });
});
