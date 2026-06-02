import type { App } from 'electron';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const APP_ID = 'dev.testrix.app';
const REG_SUBKEY = `Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}`;
const META_FILE = '.install-meta.json';
const WIN_MAIN_EXE = 'Testrix.exe';
const LINUX_MAIN_EXE = 'testrix';
const MAC_APP_BUNDLE = 'Testrix.app';

export type InstallScope = 'user' | 'machine' | 'unknown';

export interface InstallLocation {
  readonly installDir: string;
  readonly scope: InstallScope;
  readonly mainExePath: string;
}

interface InstallMeta {
  readonly installDir?: string;
  readonly scope?: string;
}

/**
 * Returns the on-disk install location for a packaged Testrix build, if known.
 *
 * @param appRef Electron app reference.
 */
export function resolveInstallLocation(appRef: App): InstallLocation | null {
  if (!appRef.isPackaged) {
    return null;
  }

  const fromMeta = resolveFromInstallMeta(appRef);
  if (fromMeta) {
    return fromMeta;
  }

  if (process.platform === 'win32') {
    return resolveFromWindowsRegistry();
  }

  return resolveFromExecutableLayout(appRef);
}

function resolveFromInstallMeta(appRef: App): InstallLocation | null {
  let dir = dirname(appRef.getPath('exe'));
  for (let depth = 0; depth < 8; depth += 1) {
    const meta = readInstallMeta(dir);
    if (meta?.installDir && existsSync(meta.installDir)) {
      const scope = meta.scope === 'machine' ? 'machine' : 'user';
      return {
        installDir: meta.installDir,
        scope,
        mainExePath: resolveMainExePath(meta.installDir),
      };
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return null;
}

function resolveFromWindowsRegistry(): InstallLocation | null {
  for (const root of ['HKLM', 'HKCU'] as const) {
    try {
      const query = spawnSync('reg', ['query', `${root}\\${REG_SUBKEY}`, '/v', 'InstallLocation'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      const match = /InstallLocation\s+REG_SZ\s+(.*)/.exec(query.stdout || '');
      const installDir = match?.[1]?.trim();
      if (!installDir || !existsSync(installDir)) {
        continue;
      }
      const meta = readInstallMeta(installDir);
      return {
        installDir,
        scope: root === 'HKLM' || meta?.scope === 'machine' ? 'machine' : 'user',
        mainExePath: join(installDir, WIN_MAIN_EXE),
      };
    } catch {
      continue;
    }
  }
  return null;
}

function resolveFromExecutableLayout(appRef: App): InstallLocation | null {
  const exePath = appRef.getPath('exe');

  if (process.platform === 'darwin') {
    const segments = exePath.split(sep);
    const appIndex = segments.findIndex((segment) => segment.endsWith('.app'));
    if (appIndex >= 0) {
      const installDir = segments.slice(0, appIndex + 1).join(sep);
      return {
        installDir,
        scope: installDir.startsWith('/Applications/') ? 'machine' : 'user',
        mainExePath: join(installDir, 'Contents', 'MacOS', 'Testrix'),
      };
    }
  }

  const installDir = dirname(exePath);
  if (!existsSync(resolveMainExePath(installDir))) {
    return null;
  }

  return {
    installDir,
    scope: 'unknown',
    mainExePath: resolveMainExePath(installDir),
  };
}

function resolveMainExePath(installDir: string): string {
  if (process.platform === 'win32') {
    return join(installDir, WIN_MAIN_EXE);
  }
  if (process.platform === 'linux') {
    return join(installDir, LINUX_MAIN_EXE);
  }
  if (process.platform === 'darwin') {
    const bundlePath = normalize(installDir).endsWith('.app')
      ? installDir
      : join(installDir, MAC_APP_BUNDLE);
    return join(bundlePath, 'Contents', 'MacOS', 'Testrix');
  }
  return join(installDir, WIN_MAIN_EXE);
}

function readInstallMeta(installDir: string): InstallMeta | null {
  const metaPath = join(installDir, META_FILE);
  if (!existsSync(metaPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(metaPath, 'utf8')) as InstallMeta;
  } catch {
    return null;
  }
}
