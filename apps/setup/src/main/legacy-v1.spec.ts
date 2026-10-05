import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isSquirrelInstallDir,
  isTestrixInstallTree,
  legacyV1InstallDirs,
  prepareInstallDestination,
  removeLegacyV1Installs,
  squirrelStartMenuFolder,
} from './legacy-v1';

describe('isSquirrelInstallDir', () => {
  it('recognizes Update.exe as a 1.x install', () => {
    const squirrel = 'C:\\Users\\me\\AppData\\Local\\testrix';
    const next = 'C:\\Users\\me\\AppData\\Local\\Programs\\Testrix';
    const exists = (file: string) => file === path.join(squirrel, 'Update.exe');
    expect(isSquirrelInstallDir(squirrel, exists)).toBe(true);
    expect(isSquirrelInstallDir(next, exists)).toBe(false);
  });
});

describe('isTestrixInstallTree', () => {
  it('treats a 2.x payload folder as replaceable', () => {
    const exists = (file: string) => file.replace(/\\/g, '/').endsWith('resources/app.asar');
    expect(isTestrixInstallTree('C:\\Users\\me\\AppData\\Local\\Programs\\Testrix', exists)).toBe(
      true,
    );
  });
});

describe('legacyV1InstallDirs', () => {
  it('skips the 2.x keep folder and de-duplicates case on Windows', () => {
    const localAppData = 'C:\\Users\\me\\AppData\\Local';
    const keepDir = path.join(localAppData, 'Programs', 'Testrix');
    const dirs = legacyV1InstallDirs({ localAppData, keepDir });
    expect(dirs.some((dir) => path.basename(dir).toLowerCase() === 'testrix')).toBe(true);
    expect(dirs.some((dir) => dir === keepDir)).toBe(false);
    if (process.platform === 'win32') expect(dirs).toHaveLength(1);
  });
});

describe('removeLegacyV1Installs', () => {
  it('deletes the Squirrel tree and Start Menu folder, not the 2.x keep dir', async () => {
    const localAppData = 'C:\\Users\\me\\AppData\\Local';
    const appData = 'C:\\Users\\me\\AppData\\Roaming';
    const keepDir = path.join(localAppData, 'Programs', 'Testrix');
    const squirrel = legacyV1InstallDirs({ localAppData, keepDir })[0] ?? path.join(localAppData, 'testrix');
    const startMenu = squirrelStartMenuFolder(appData);
    const removed: string[] = [];
    const files = new Set([
      squirrel,
      path.join(squirrel, 'Update.exe'),
      keepDir,
      path.join(keepDir, 'Testrix.exe'),
      startMenu,
    ]);

    const gone = await removeLegacyV1Installs({
      keepDir,
      localAppData,
      appData,
      exists: (file) => files.has(file),
      isDirectory: (file) => file === startMenu || file === squirrel || file === keepDir,
      remove: async (target) => {
        removed.push(target);
      },
    });

    expect(gone).toEqual([squirrel, startMenu]);
    expect(removed).toEqual([squirrel, startMenu]);
  });
});

describe('prepareInstallDestination', () => {
  it('clears a previous Testrix tree so overlay copies cannot keep 1.x files', async () => {
    const dest = 'C:\\Users\\me\\AppData\\Local\\Programs\\Testrix';
    const files = new Set([dest, path.join(dest, 'Testrix.exe'), path.join(dest, 'Update.exe')]);
    const removed: string[] = [];
    const didWipe = await prepareInstallDestination(dest, {
      exists: (file) => files.has(file),
      remove: async (target) => {
        removed.push(target);
      },
    });
    expect(didWipe).toBe(true);
    expect(removed).toEqual([dest]);
  });

  it('leaves an unrelated empty folder alone', async () => {
    const dest = 'C:\\Users\\me\\Apps';
    const didWipe = await prepareInstallDestination(dest, {
      exists: (file) => file === dest,
      remove: async () => {
        throw new Error('must not wipe');
      },
    });
    expect(didWipe).toBe(false);
  });
});
