import { app } from 'electron';

import { getInstalledAppVersion } from '../services/app-info.service';

/** Chromium `additionalArguments` prefix so preload can read the installed semver before `contextBridge` expose. */
export const TESTRIX_APP_VERSION_ARG_PREFIX = '--testrix-app-version=';

/**
 * Formats the installed app version for BrowserWindow `additionalArguments`.
 *
 * @param version Installed semver (empty values are omitted by the caller).
 */
export function formatBootAppVersionArgument(version: string): string {
  return `${TESTRIX_APP_VERSION_ARG_PREFIX}${version.trim()}`;
}

/**
 * Returns Chromium args so preload can publish `versions.app` synchronously.
 *
 * `contextBridge.exposeInMainWorld` clones the API object. Mutating `versions` after expose
 * does not update `window.testrix.versions` in the renderer.
 */
export function bootAppVersionAdditionalArguments(): readonly string[] {
  const version = getInstalledAppVersion(app).trim();
  if (!version) {
    return [];
  }
  return [formatBootAppVersionArgument(version)];
}
