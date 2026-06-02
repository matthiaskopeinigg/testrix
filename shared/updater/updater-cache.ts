import type { UpdaterStatus } from './updater-status.schema';

/**
 * Returns false for stale `available` cache entries that predate in-app installer downloads.
 *
 * @param status Cached updater status.
 */
export function isUpdaterCacheStatusUsable(status: UpdaterStatus): boolean {
  if (status.state !== 'available') {
    return true;
  }
  return Boolean(status.info?.installerDownloadUrl);
}
