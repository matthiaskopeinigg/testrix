import type { App } from 'electron';

export function getAppVersions(appRef: App): {
  app: string;
  electron: string;
  chrome: string;
} {
  return {
    app: appRef.getVersion(),
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
  };
}
