import type { App } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Returns runtime version metadata exposed to the renderer.
 *
 * @param appRef Electron app reference.
 */
export function getAppVersions(appRef: App): {
  app: string;
  electron: string;
  chrome: string;
} {
  return {
    app: resolveAppVersion(appRef),
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
  };
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
