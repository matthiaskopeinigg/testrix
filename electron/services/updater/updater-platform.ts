import { isInstallerPlatformSupported, type UpdaterPlatform } from '../../../shared/updater/installer-artifacts';

/**
 * Returns the current Electron platform when it supports in-app installer updates.
 */
export function runtimeUpdaterPlatform(): UpdaterPlatform {
  const platform = process.platform;
  if (!isInstallerPlatformSupported(platform)) {
    throw new Error(`Updates are not supported on platform: ${platform}`);
  }
  return platform;
}
