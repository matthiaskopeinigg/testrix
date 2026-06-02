import type { UpdaterStatus } from './updater-status.schema';
import { isReleaseVersionNewer } from './release-version';

/**
 * Returns true when a cached offer is no longer newer than the installed app version.
 *
 * @param status Cached updater status.
 * @param installedVersion Installed app semver.
 */
export function isUpdaterCacheStatusStale(
  status: UpdaterStatus,
  installedVersion: string,
): boolean {
  const offered = status.info?.version?.trim();
  const installed = installedVersion.trim();
  if (!offered || !installed) {
    return false;
  }

  if (status.state !== 'available' && status.state !== 'downloaded') {
    return false;
  }

  return !isReleaseVersionNewer(installed, offered);
}

/**
 * Returns false for stale cache entries that predate in-app installer downloads
 * or no longer apply to the installed app version.
 *
 * @param status Cached updater status.
 * @param installedVersion Installed app semver (optional).
 */
export function isUpdaterCacheStatusUsable(
  status: UpdaterStatus,
  installedVersion?: string,
): boolean {
  if (installedVersion && isUpdaterCacheStatusStale(status, installedVersion)) {
    return false;
  }

  if (status.state !== 'available') {
    return true;
  }
  return Boolean(status.info?.installerDownloadUrl);
}
