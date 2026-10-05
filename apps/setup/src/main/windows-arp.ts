import { spawn } from 'node:child_process';

import { APP_ID, type SetupScope } from '@testrix/contracts';

import { isPathInside } from './silent-update';

/** Current and leftover Add/Remove Programs key names for Testrix. */
export const WINDOWS_UNINSTALL_KEY_NAMES = [
  APP_ID,
  'testrix',
  'com.testrix.app',
] as const;

/** Older Squirrel ARP keys that must not stay listed after Setup takes over. */
export const STALE_WINDOWS_UNINSTALL_KEYS = ['testrix', 'com.testrix.app'] as const;

export const WINDOWS_UNINSTALL_HIVES = ['HKCU', 'HKLM'] as const;

export interface InstallLocation {
  readonly installDir: string;
  readonly scope: SetupScope;
}

export type RegRunner = (args: readonly string[]) => Promise<number>;

/**
 * Builds `HKCU|HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\<name>`.
 */
export function windowsUninstallKey(hive: string, name: string): string {
  return `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${name}`;
}

/**
 * Runs `reg.exe` and resolves when it exits. A missing key is not treated as failure.
 */
export function spawnReg(args: readonly string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('reg', [...args], { windowsHide: true });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

/**
 * Removes every Testrix Apps listing in HKCU and HKLM so Settings does not keep a ghost entry.
 */
export async function deleteWindowsUninstallKeys(run: RegRunner = spawnReg): Promise<void> {
  for (const hive of WINDOWS_UNINSTALL_HIVES) {
    for (const name of WINDOWS_UNINSTALL_KEY_NAMES) {
      await run(['delete', windowsUninstallKey(hive, name), '/f']);
    }
  }
}

/**
 * Finds the install folder even when `.install-meta.json` was already deleted by a hung uninstall.
 */
export function resolveInstallLocation(options: {
  readonly meta: InstallLocation | null;
  readonly execPath: string;
  readonly userDir: string;
  readonly machineDir: string;
  readonly exists: (file: string) => boolean;
}): InstallLocation | null {
  if (options.meta?.installDir) return options.meta;
  const candidates: readonly InstallLocation[] = [
    { installDir: options.userDir, scope: 'user' },
    { installDir: options.machineDir, scope: 'machine' },
  ];
  for (const candidate of candidates) {
    if (isPathInside(options.execPath, candidate.installDir)) return candidate;
  }
  for (const candidate of candidates) {
    if (options.exists(candidate.installDir)) return candidate;
  }
  return null;
}
