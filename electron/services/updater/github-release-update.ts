import type { UpdateChannel } from '../../../shared/updater/updater-status.schema';
import {
  formatMissingInstallerAssetMessage,
  matchInstallerAsset,
  type InstallerAssetCandidate,
} from '../../../shared/updater/installer-asset-resolver';
import { isReleaseVersionNewer, normalizeReleaseTag } from '../../../shared/updater/release-version';

import { GITHUB_REPOSITORY } from '../../config/repository';
import { runtimeUpdaterPlatform } from './updater-platform';

const [GITHUB_OWNER, GITHUB_REPO] = GITHUB_REPOSITORY.split('/') as [string, string];

export interface GitHubInstallerAsset {
  readonly name: string;
  readonly downloadUrl: string;
  readonly size: number;
}

export interface GitHubReleaseSummary {
  readonly version: string;
  readonly tagName: string;
  readonly releasePageUrl: string;
  readonly prerelease: boolean;
  readonly installerAsset: GitHubInstallerAsset | null;
  readonly assetNames: readonly string[];
}

interface GitHubReleaseJson {
  readonly tag_name?: string;
  readonly html_url?: string;
  readonly prerelease?: boolean;
  readonly draft?: boolean;
  readonly assets?: readonly InstallerAssetCandidate[];
}

export { isReleaseVersionNewer, normalizeReleaseTag };

/**
 * Resolves the newest GitHub release for the selected update channel.
 *
 * @param channel Stable uses `/releases/latest`; beta uses the newest prerelease.
 */
export async function fetchLatestGitHubRelease(
  channel: UpdateChannel,
): Promise<GitHubReleaseSummary | null> {
  if (channel === 'beta') {
    try {
      const releases = await fetchGitHubJson<GitHubReleaseJson[]>(
        githubApiUrl('/releases?per_page=30'),
      );
      const candidate = releases.find((release) => release.prerelease && !release.draft);
      return candidate ? mapRelease(candidate) : null;
    } catch (error: unknown) {
      if (error instanceof GitHubApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  try {
    const latest = await fetchGitHubJson<GitHubReleaseJson>(githubApiUrl('/releases/latest'));
    if (latest.draft || latest.prerelease) {
      return null;
    }
    return mapRelease(latest);
  } catch (error: unknown) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Loads a GitHub release (with assets) by tag name.
 *
 * @param tagName Release tag (with or without leading `v`).
 */
export async function fetchGitHubReleaseByTag(tagName: string): Promise<GitHubReleaseSummary | null> {
  const slug = tagName.startsWith('v') ? tagName : `v${tagName}`;
  try {
    const release = await fetchGitHubJson<GitHubReleaseJson>(
      githubApiUrl(`/releases/tags/${encodeURIComponent(slug)}`),
    );
    if (release.draft) {
      return null;
    }
    return mapRelease(release);
  } catch (error: unknown) {
    if (error instanceof GitHubApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Resolves the installer download asset for a release version.
 *
 * @param version Normalized release version.
 */
export async function resolveInstallerAssetForVersion(
  version: string,
): Promise<{ asset: GitHubInstallerAsset | null; assetNames: readonly string[] }> {
  const release = await fetchGitHubReleaseByTag(version);
  if (!release) {
    return { asset: null, assetNames: [] };
  }

  return {
    asset: release.installerAsset,
    assetNames: release.assetNames,
  };
}

/**
 * Builds a user-facing error when the installer asset is missing on a release.
 *
 * @param version Offered release version.
 * @param assetNames Asset basenames published on the release.
 */
export function formatInstallerAssetError(version: string, assetNames: readonly string[]): string {
  return formatMissingInstallerAssetMessage(
    version,
    runtimeUpdaterPlatform(),
    assetNames.map((name) => ({ name })),
  );
}

class GitHubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

function mapRelease(release: GitHubReleaseJson): GitHubReleaseSummary {
  const tagName = release.tag_name?.trim() || '';
  const assetNames = listAssetNames(release.assets);
  const matched = matchInstallerAsset(release.assets, runtimeUpdaterPlatform());
  return {
    version: normalizeReleaseTag(tagName),
    tagName,
    releasePageUrl: release.html_url ?? buildReleasePageUrl(tagName),
    prerelease: release.prerelease === true,
    assetNames,
    installerAsset: matched
      ? {
          name: matched.name,
          downloadUrl: matched.downloadUrl,
          size: matched.size,
        }
      : null,
  };
}

function listAssetNames(assets: readonly InstallerAssetCandidate[] | undefined): readonly string[] {
  return (assets ?? [])
    .map((entry) => entry.name?.trim())
    .filter((name): name is string => Boolean(name));
}

function buildReleasePageUrl(tagName: string): string {
  const slug = tagName.startsWith('v') ? tagName : `v${tagName}`;
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/${encodeURIComponent(slug)}`;
}

function githubApiUrl(path: string): string {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}${path}`;
}

function readGitHubAuthHeaders(): Record<string, string> {
  const token = process.env.TESTRIX_GITHUB_TOKEN?.trim();
  if (!token) {
    return {};
  }
  return { Authorization: `Bearer ${token}` };
}

async function fetchGitHubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Testrix-Updater',
      'X-GitHub-Api-Version': '2022-11-28',
      ...readGitHubAuthHeaders(),
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new GitHubApiError(
      response.status,
      body.trim() || `GitHub API request failed (${response.status})`,
    );
  }

  return (await response.json()) as T;
}
