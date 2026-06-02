import {
  INSTALLER_PRODUCT_NAME,
  isInstallerPlatformSupported,
  resolveInstallerAssetName,
  type UpdaterPlatform,
} from './installer-artifacts';

export interface InstallerAssetCandidate {
  readonly name?: string;
  readonly browser_download_url?: string;
  readonly size?: number;
}

export interface MatchedInstallerAsset {
  readonly name: string;
  readonly downloadUrl: string;
  readonly size: number;
}

/**
 * Matches a GitHub release asset to the platform installer for this app.
 *
 * @param assets Release asset list from GitHub API.
 * @param platform Electron platform slug.
 */
export function matchInstallerAsset(
  assets: readonly InstallerAssetCandidate[] | undefined,
  platform: UpdaterPlatform,
): MatchedInstallerAsset | null {
  if (!isInstallerPlatformSupported(platform) || !assets?.length) {
    return null;
  }

  const expectedName = resolveInstallerAssetName(platform);
  const exact = assets.find((entry) => entry.name === expectedName);
  if (exact?.name && exact.browser_download_url?.trim()) {
    return {
      name: exact.name,
      downloadUrl: exact.browser_download_url.trim(),
      size: exact.size ?? 0,
    };
  }

  const extension = platformExtension(platform);
  const fallback = assets.find((entry) => {
    const name = entry.name ?? '';
    return matchesInstallerProductName(name) && name.endsWith(extension);
  });

  if (fallback?.name && fallback.browser_download_url?.trim()) {
    return {
      name: fallback.name,
      downloadUrl: fallback.browser_download_url.trim(),
      size: fallback.size ?? 0,
    };
  }

  return null;
}

/**
 * Builds a user-facing error when the expected installer asset is missing.
 *
 * @param version Offered release version.
 * @param platform Electron platform slug.
 * @param assets Release asset list from GitHub API.
 */
export function formatMissingInstallerAssetMessage(
  version: string,
  platform: UpdaterPlatform,
  assets: readonly InstallerAssetCandidate[] | undefined,
): string {
  const expected = resolveInstallerAssetName(platform);
  const found = (assets ?? [])
    .map((entry) => entry.name)
    .filter((name): name is string => Boolean(name?.trim()));
  const assetList = found.length > 0 ? found.join(', ') : '(none)';
  return `Installer asset "${expected}" not found on release v${version.replace(/^v/i, '')}. Assets: ${assetList}`;
}

function platformExtension(platform: UpdaterPlatform): string {
  if (platform === 'win32') {
    return '.exe';
  }
  if (platform === 'linux') {
    return '.AppImage';
  }
  return '.dmg';
}

/** Matches GitHub assets named `Testrix Setup.*` or `Testrix.Setup.*`. */
function matchesInstallerProductName(name: string): boolean {
  const normalized = name.replace(/\./g, ' ');
  return normalized.includes(INSTALLER_PRODUCT_NAME);
}
