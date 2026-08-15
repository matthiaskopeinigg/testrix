/** Electron/Node platform slugs that ship a Testrix Setup installer. */
export type UpdaterPlatform = 'win32' | 'linux' | 'darwin';

/** Display name of the setup shell (window title, .app bundle). */
export const INSTALLER_PRODUCT_NAME = 'Testrix Setup';

/**
 * GitHub release asset stem. Spaces become dots on github.com (`Testrix.Setup`),
 * so shipped files use a hyphen instead (`Testrix-Setup.exe`).
 */
export const INSTALLER_ARTIFACT_NAME = 'Testrix-Setup';

const INSTALLER_ASSET_BY_PLATFORM: Readonly<Record<UpdaterPlatform, string>> = {
  win32: `${INSTALLER_ARTIFACT_NAME}.exe`,
  linux: `${INSTALLER_ARTIFACT_NAME}.AppImage`,
  darwin: `${INSTALLER_ARTIFACT_NAME}.dmg`,
};

/**
 * Returns the GitHub release asset filename for the given platform.
 *
 * @param platform Electron platform slug (`win32`, `linux`, `darwin`).
 */
export function resolveInstallerAssetName(platform: UpdaterPlatform): string {
  const name = INSTALLER_ASSET_BY_PLATFORM[platform];
  if (!name) {
    throw new Error(`Updates are not supported on platform: ${platform}`);
  }
  return name;
}

/**
 * Returns true when Testrix publishes an in-app updater installer for the platform.
 *
 * @param platform Electron platform slug.
 */
export function isInstallerPlatformSupported(platform: string): platform is UpdaterPlatform {
  return platform in INSTALLER_ASSET_BY_PLATFORM;
}
