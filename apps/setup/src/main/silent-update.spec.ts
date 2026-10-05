import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  copySetupRuntime,
  deferredDeleteSpawn,
  deleteInstallContents,
  isPathInside,
  nodeSwapFs,
  parseSilentUpdateArgs,
  resolvePayloadExePath,
  swapInstall,
  waitForExit,
  writeDeferredDeleteScript,
} from './silent-update';

describe('swapInstall', () => {
  let root: string;
  let installDir: string;
  let source: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'testrix-swap-'));
    installDir = path.join(root, 'Testrix');
    source = path.join(root, 'payload');
    await mkdir(installDir);
    await mkdir(source);
    await writeFile(path.join(installDir, 'Testrix.exe'), 'old');
    await writeFile(path.join(installDir, '.install-meta.json'), '{"scope":"user"}');
    await writeFile(path.join(installDir, 'uninstall.cmd'), 'uninstall');
    await writeFile(path.join(source, 'Testrix.exe'), 'new');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('copies resources/app.asar without leaving .new or .old folders', async () => {
    await mkdir(path.join(source, 'resources'));
    await writeFile(path.join(source, 'resources', 'app.asar'), 'asar');

    await swapInstall({ source, installDir });

    expect(await readFile(path.join(installDir, 'resources', 'app.asar'), 'utf8')).toBe('asar');
    expect(existsSync(`${installDir}.new`)).toBe(false);
    expect(existsSync(`${installDir}.old`)).toBe(false);
  });

  it('replaces the build and keeps the files Setup wrote', async () => {
    // Act
    await swapInstall({ source, installDir });

    // Assert
    expect(await readFile(path.join(installDir, 'Testrix.exe'), 'utf8')).toBe('new');
    expect(await readFile(path.join(installDir, 'uninstall.cmd'), 'utf8')).toBe('uninstall');
    expect(existsSync(path.join(installDir, '.install-meta.json'))).toBe(true);
    expect(existsSync(`${installDir}.old`)).toBe(false);
    expect(existsSync(`${installDir}.new`)).toBe(false);
  });

  it('restores the previous build when the new one cannot be moved in', async () => {
    // Arrange
    const rename = vi.fn(async (from: string, to: string) => {
      if (from === `${installDir}.new`) throw new Error('EBUSY');
      await nodeSwapFs.rename(from, to);
    });

    // Act
    const run = swapInstall({
      source,
      installDir,
      fs: { ...nodeSwapFs, rename },
      renameAttempts: 2,
      retryDelayMs: 1,
    });

    // Assert
    await expect(run).rejects.toThrow('EBUSY');
    expect(await readFile(path.join(installDir, 'Testrix.exe'), 'utf8')).toBe('old');
    expect(existsSync(`${installDir}.new`)).toBe(false);
    expect(existsSync(`${installDir}.old`)).toBe(false);
  });

  it('leaves the install untouched when the folder stays locked', async () => {
    // Arrange
    const log = vi.fn();
    const rename = vi.fn(async () => {
      throw new Error('EPERM');
    });

    // Act
    const run = swapInstall({
      source,
      installDir,
      fs: { ...nodeSwapFs, rename },
      log,
      renameAttempts: 3,
      retryDelayMs: 1,
    });

    // Assert
    await expect(run).rejects.toThrow('EPERM');
    expect(rename).toHaveBeenCalledTimes(3);
    expect(await readFile(path.join(installDir, 'Testrix.exe'), 'utf8')).toBe('old');
    expect(existsSync(`${installDir}.new`)).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('still in use'));
  });

  it('drops a half-written staging copy when copying fails', async () => {
    // Arrange
    const copyDir = vi.fn(async (_from: string, to: string) => {
      await mkdir(to);
      throw new Error('ENOSPC');
    });

    // Act
    const run = swapInstall({ source, installDir, fs: { ...nodeSwapFs, copyDir } });

    // Assert
    await expect(run).rejects.toThrow('ENOSPC');
    expect(existsSync(`${installDir}.new`)).toBe(false);
    expect(await readFile(path.join(installDir, 'Testrix.exe'), 'utf8')).toBe('old');
  });
});

describe('parseSilentUpdateArgs', () => {
  it('reads the hand-over arguments from the app', () => {
    // Act
    const args = parseSilentUpdateArgs([
      'Setup.exe',
      '--silent-update',
      '--wait-pid=812',
      '--relaunch',
      '--install-dir=C:\\Users\\me\\AppData\\Local\\Programs\\Testrix',
      '--updated-from=2.0.0',
      '--payload-file=C:\\Users\\me\\updates\\Testrix.exe',
    ]);

    // Assert
    expect(args).toEqual({
      installDir: 'C:\\Users\\me\\AppData\\Local\\Programs\\Testrix',
      waitPid: 812,
      relaunch: true,
      logFile: null,
      updatedFrom: '2.0.0',
      payloadFile: 'C:\\Users\\me\\updates\\Testrix.exe',
    });
  });

  it('prefers the downloaded portable wrapper over the extracted Setup exe', () => {
    const exists = (file: string) => file.endsWith('Testrix.exe');
    expect(
      resolvePayloadExePath({
        argv: ['--payload-file=C:\\updates\\Testrix.exe'],
        env: { PORTABLE_EXECUTABLE_FILE: 'C:\\Temp\\Testrix.exe' },
        fallbacks: ['C:\\Temp\\Testrix.exe'],
        exists,
      }),
    ).toBe('C:\\updates\\Testrix.exe');
    expect(
      resolvePayloadExePath({
        argv: [],
        env: { TESTRIX_PAYLOAD_FILE: 'C:\\updates\\Testrix.exe' },
        fallbacks: ['C:\\Temp\\Testrix.exe'],
        exists,
      }),
    ).toBe('C:\\updates\\Testrix.exe');
    expect(
      resolvePayloadExePath({
        argv: [],
        env: { PORTABLE_EXECUTABLE_FILE: 'C:\\Temp\\Testrix.exe' },
        fallbacks: ['C:\\Temp\\Testrix.exe'],
        exists,
      }),
    ).toBe('C:\\Temp\\Testrix.exe');
  });

  it('ignores a malformed pid', () => {
    expect(parseSilentUpdateArgs(['--wait-pid=abc']).waitPid).toBeNull();
  });

  it('defaults missing hand-over flags', () => {
    expect(parseSilentUpdateArgs(['--silent-update'])).toEqual({
      installDir: null,
      waitPid: null,
      relaunch: false,
      logFile: null,
      updatedFrom: null,
      payloadFile: null,
    });
  });
});

describe('waitForExit', () => {
  it('resolves once the process is gone', async () => {
    // Arrange
    const isAlive = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValue(false);

    // Act
    const hasExited = await waitForExit(1, 1000, isAlive, 1);

    // Assert
    expect(hasExited).toBe(true);
    expect(isAlive).toHaveBeenCalledTimes(3);
  });

  it('gives up after the timeout', async () => {
    expect(await waitForExit(1, 5, () => true, 1)).toBe(false);
  });
});

describe('copySetupRuntime', () => {
  it('copies the Electron runtime, not only the exe', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'testrix-setup-runtime-'));
    const from = path.join(root, 'unpacked');
    const to = path.join(root, 'install', 'setup');
    await mkdir(path.join(from, 'resources'), { recursive: true });
    await writeFile(path.join(from, 'Testrix.exe'), 'exe');
    await writeFile(path.join(from, 'icudtl.dat'), 'icu');
    await writeFile(path.join(from, 'resources', 'app.asar'), 'asar');
    await mkdir(path.join(root, 'install', 'setup'), { recursive: true });
    await writeFile(path.join(to, 'Testrix.exe'), 'orphan');

    copySetupRuntime(from, to);

    expect(await readFile(path.join(to, 'Testrix.exe'), 'utf8')).toBe('exe');
    expect(await readFile(path.join(to, 'icudtl.dat'), 'utf8')).toBe('icu');
    expect(await readFile(path.join(to, 'resources', 'app.asar'), 'utf8')).toBe('asar');
    await rm(root, { recursive: true, force: true });
  });

  it('skips when source and destination are the same folder', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'testrix-setup-same-'));
    await writeFile(path.join(dir, 'Testrix.exe'), 'keep');
    copySetupRuntime(dir, dir);
    expect(await readFile(path.join(dir, 'Testrix.exe'), 'utf8')).toBe('keep');
    await rm(dir, { recursive: true, force: true });
  });
});

describe('isPathInside', () => {
  it('treats a nested setup folder as inside the install dir', () => {
    const root = path.join(os.tmpdir(), 'testrix-install-root');
    expect(isPathInside(path.join(root, 'setup', 'Testrix.exe'), root)).toBe(true);
    expect(isPathInside(root, path.join(root, 'setup'))).toBe(false);
  });
});

describe('deleteInstallContents', () => {
  it('keeps the running Setup folder and removes the rest', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'testrix-uninstall-'));
    const installDir = path.join(root, 'Testrix');
    const setupDir = path.join(installDir, 'setup');
    await mkdir(path.join(setupDir, 'resources'), { recursive: true });
    await writeFile(path.join(installDir, 'Testrix.exe'), 'app');
    await writeFile(path.join(setupDir, 'Testrix.exe'), 'setup');
    await writeFile(path.join(setupDir, 'resources', 'app.asar'), 'asar');

    await deleteInstallContents(installDir, setupDir);

    expect(existsSync(path.join(installDir, 'Testrix.exe'))).toBe(false);
    expect(existsSync(path.join(setupDir, 'Testrix.exe'))).toBe(true);
    expect(existsSync(path.join(setupDir, 'resources', 'app.asar'))).toBe(true);
    await rm(root, { recursive: true, force: true });
  });
});

describe('writeDeferredDeleteScript', () => {
  it('waits for Testrix.exe then removes the folder without find.exe', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'testrix-deferred-'));
    const script = path.join(dir, 'cleanup.vbs');
    writeDeferredDeleteScript('C:\\Users\\me\\Testrix', 4242, script);
    const body = await readFile(script, 'utf8');
    expect(body).toContain('pid = 4242');
    expect(body).toContain('name <> "testrix.exe"');
    expect(body).toContain('rmdir /s /q """ & folder & """');
    expect(body).not.toContain('find ');
    expect(deferredDeleteSpawn(script)).toEqual({
      command: 'wscript.exe',
      args: ['//B', '//Nologo', script],
    });
    await rm(dir, { recursive: true, force: true });
  });
});
