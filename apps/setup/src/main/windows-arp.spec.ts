import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ID } from '@testrix/contracts';

import {
  deleteWindowsUninstallKeys,
  resolveInstallLocation,
  STALE_WINDOWS_UNINSTALL_KEYS,
  WINDOWS_UNINSTALL_HIVES,
  WINDOWS_UNINSTALL_KEY_NAMES,
  windowsUninstallKey,
} from './windows-arp';

describe('windowsUninstallKey', () => {
  it('points at the Add/Remove Programs key Windows Settings reads', () => {
    expect(windowsUninstallKey('HKCU', APP_ID)).toBe(
      `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}`,
    );
  });
});

describe('deleteWindowsUninstallKeys', () => {
  it('deletes the current app id and leftover Squirrel keys in both hives', async () => {
    const keys: string[] = [];
    const run = async (args: readonly string[]): Promise<number> => {
      keys.push(args[1] ?? '');
      return 0;
    };

    await deleteWindowsUninstallKeys(run);

    expect(WINDOWS_UNINSTALL_KEY_NAMES).toEqual([APP_ID, ...STALE_WINDOWS_UNINSTALL_KEYS]);
    for (const hive of WINDOWS_UNINSTALL_HIVES) {
      for (const name of WINDOWS_UNINSTALL_KEY_NAMES) {
        expect(keys).toContain(windowsUninstallKey(hive, name));
      }
    }
    expect(keys).toHaveLength(WINDOWS_UNINSTALL_HIVES.length * WINDOWS_UNINSTALL_KEY_NAMES.length);
  });
});

describe('resolveInstallLocation', () => {
  const userDir = 'C:\\Users\\me\\AppData\\Local\\Programs\\Testrix';
  const machineDir = 'C:\\Program Files\\Testrix';

  it('prefers the install meta file when it is still present', () => {
    const located = resolveInstallLocation({
      meta: { installDir: machineDir, scope: 'machine' },
      execPath: path.join(userDir, 'setup', 'Testrix.exe'),
      userDir,
      machineDir,
      exists: () => true,
    });
    expect(located).toEqual({ installDir: machineDir, scope: 'machine' });
  });

  it('uses the Setup exe folder after a hung uninstall deleted the meta file', () => {
    const located = resolveInstallLocation({
      meta: null,
      execPath: path.join(userDir, 'setup', 'Testrix.exe'),
      userDir,
      machineDir,
      exists: () => false,
    });
    expect(located).toEqual({ installDir: userDir, scope: 'user' });
  });

  it('falls back to a leftover user install folder when Setup is not running from it', () => {
    const located = resolveInstallLocation({
      meta: null,
      execPath: 'C:\\Temp\\TestrixSetup\\Testrix.exe',
      userDir,
      machineDir,
      exists: (file) => file === userDir,
    });
    expect(located).toEqual({ installDir: userDir, scope: 'user' });
  });

  it('returns null when nothing is left on disk', () => {
    const located = resolveInstallLocation({
      meta: null,
      execPath: 'C:\\Temp\\TestrixSetup\\Testrix.exe',
      userDir,
      machineDir,
      exists: () => false,
    });
    expect(located).toBeNull();
  });
});
