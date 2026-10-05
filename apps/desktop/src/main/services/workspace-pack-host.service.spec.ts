import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConfigStore } from './config.service';
import { WorkspacePackHost } from './workspace-pack-host.service';

vi.mock('electron', () => ({ dialog: {} }));

describe('WorkspacePackHost import allowlist', () => {
  let dir = '';
  let host: WorkspacePackHost;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'testrix-pack-'));
    host = new WorkspacePackHost({} as ConfigStore, () => null, () => '1.0.0');
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(dir, { recursive: true, force: true });
  });

  it('refuses a path the user never picked or dropped', async () => {
    // Arrange
    const file = path.join(dir, 'secret.json');
    await writeFile(file, '{}');

    // Act
    const inspect = host.importInspect(file);

    // Assert
    await expect(inspect).rejects.toThrow(/Choose the file again/);
  });

  it('refuses an allowed path with an unsupported extension', async () => {
    // Arrange
    const file = path.join(dir, 'payload.exe');
    await writeFile(file, 'MZ');
    host.allowImportPath(file);

    // Act
    const inspect = host.importInspect(file);

    // Assert
    await expect(inspect).rejects.toThrow(/cannot import \.exe/);
  });

  it('forgets an allowed path after it expires', async () => {
    // Arrange
    const file = path.join(dir, 'old.json');
    await writeFile(file, '{}');
    vi.useFakeTimers({ toFake: ['Date'] });
    host.allowImportPath(file);
    vi.setSystemTime(Date.now() + 31 * 60 * 1000);

    // Act
    const inspect = host.importInspect(file);

    // Assert
    await expect(inspect).rejects.toThrow(/Choose the file again/);
  });

  it('refuses dropped bytes over the size limit', async () => {
    // Arrange
    const huge = { byteLength: 201 * 1024 * 1024 } as Uint8Array;

    // Act
    const inspect = host.importInspectBytes('big.zip', huge);

    // Assert
    await expect(inspect).rejects.toThrow(/larger than 200 MB/);
  });

  it('refuses an import apply for a path that was never allowed', async () => {
    // Arrange
    const file = path.join(dir, 'pack.testrix');
    await writeFile(file, '{}');

    // Act
    const apply = host.importApply({ path: file, mode: 'new', selection: {} as never });

    // Assert
    await expect(apply).rejects.toThrow(/Choose the file again/);
  });
});
