import type { App } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getUpdaterService } from './updater/updater.service';

/**
 * Returns runtime version metadata exposed to the renderer.
 *
 * @param appRef Electron app reference.
 */
export function getAppVersions(appRef: App): {
  app: string;
  installedApp: string;
  electron: string;
  chrome: string;
} {
  const installedApp = resolveAppVersion(appRef);
  const devSimulated = getUpdaterService().getDevSimulatedVersion();
  return {
    app: devSimulated ?? installedApp,
    installedApp,
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
  };
}

/**
 * Returns the installed app semver without dev simulation overrides.
 *
 * @param appRef Electron app reference.
 */
export function getInstalledAppVersion(appRef: App): string {
  return resolveAppVersion(appRef);
}

function resolveAppVersion(appRef: App): string {
  const fromElectron = appRef.getVersion()?.trim();
  if (fromElectron) {
    return fromElectron;
  }

  try {
    const pkg = JSON.parse(readFileSync(join(appRef.getAppPath(), 'package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version?.trim() || '0.0.0';
  } catch {
    return '0.0.0';
  }
}
