import nodeFs from 'node:fs';
import path from 'node:path';

import { PRODUCT_NAME } from '@testrix/contracts';

import { isPathInside } from './silent-update';

export interface PathExists {
  (file: string): boolean;
}

function normalizeKey(file: string): string {
  const resolved = path.resolve(file);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/** True when `dir` is a 1.x Squirrel layout (Update.exe + versioned app-* folder). */
export function isSquirrelInstallDir(dir: string, exists: PathExists = nodeFs.existsSync): boolean {
  return exists(path.join(dir, 'Update.exe')) || exists(path.join(dir, 'Squirrel-Shortcut.log'));
}

/** True when `dir` already holds a Testrix build that Setup may replace. */
export function isTestrixInstallTree(dir: string, exists: PathExists = nodeFs.existsSync): boolean {
  return (
    exists(path.join(dir, 'Testrix.exe')) ||
    exists(path.join(dir, '.install-meta.json')) ||
    exists(path.join(dir, 'resources', 'app.asar')) ||
    isSquirrelInstallDir(dir, exists)
  );
}

/**
 * 1.x Squirrel roots next to %LOCALAPPDATA%, never the 2.x `keepDir`.
 * Windows is case-insensitive, so `testrix` and `Testrix` collapse to one path.
 */
export function legacyV1InstallDirs(options: {
  readonly localAppData: string;
  readonly keepDir: string | null;
}): string[] {
  const unique = new Map<string, string>();
  for (const name of ['testrix', PRODUCT_NAME]) {
    const dir = path.join(options.localAppData, name);
    unique.set(normalizeKey(dir), dir);
  }
  return [...unique.values()].filter((dir) => {
    if (!options.keepDir) return true;
    return !isPathInside(dir, options.keepDir) && !isPathInside(options.keepDir, dir);
  });
}

export function squirrelStartMenuFolder(appData: string): string {
  return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', PRODUCT_NAME);
}

/**
 * Deletes leftover 1.x Squirrel trees and the Start Menu folder they created.
 * Does not touch `%APPDATA%\Testrix` user data or the 2.x `keepDir`.
 */
export async function removeLegacyV1Installs(options: {
  readonly keepDir: string;
  readonly localAppData: string;
  readonly appData: string;
  readonly exists?: PathExists;
  readonly isDirectory?: (file: string) => boolean;
  readonly remove: (target: string) => Promise<void>;
}): Promise<readonly string[]> {
  const exists = options.exists ?? ((file) => nodeFs.existsSync(file));
  const isDirectory =
    options.isDirectory ??
    ((file) => {
      try {
        return nodeFs.statSync(file).isDirectory();
      } catch {
        return false;
      }
    });
  const removed: string[] = [];
  for (const dir of legacyV1InstallDirs({
    localAppData: options.localAppData,
    keepDir: options.keepDir,
  })) {
    if (!exists(dir) || !isSquirrelInstallDir(dir, exists)) continue;
    await options.remove(dir);
    removed.push(dir);
  }
  const startMenu = squirrelStartMenuFolder(options.appData);
  if (exists(startMenu) && isDirectory(startMenu)) {
    await options.remove(startMenu);
    removed.push(startMenu);
  }
  return removed;
}

/**
 * Empties `dest` when it already looks like Testrix so 1.x files do not survive an overlay copy.
 */
export async function prepareInstallDestination(
  dest: string,
  options: {
    readonly exists?: PathExists;
    readonly remove: (target: string) => Promise<void>;
  },
): Promise<boolean> {
  const exists = options.exists ?? ((file) => nodeFs.existsSync(file));
  if (!exists(dest) || !isTestrixInstallTree(dest, exists)) return false;
  await options.remove(dest);
  return true;
}
