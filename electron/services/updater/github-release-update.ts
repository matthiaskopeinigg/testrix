import type { UpdateChannel } from '../../../shared/updater/updater-status.schema';
import {
  formatMissingInstallerAssetMessage,
  matchInstallerAsset,
  type InstallerAssetCandidate,
} from '../../../shared/updater/installer-asset-resolver';
import { isPrereleaseVersion, isReleaseVersionNewer, normalizeReleaseTag } from '../../../shared/updater/release-version';
import { selectNewestReleaseForChannel } from '../../../shared/updater/select-github-release';

import { GITHUB_REPOSITORY } from '../../config/repository';
import { updaterNetFetch } from './updater-fetch';
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
 * Both channels scan `/releases` and pick by semver. `/releases/latest` only
 * tracks GitHub's Latest badge, which is never a prerelease.
 *
 * @param channel Installed update channel.
 */
export async function fetchLatestGitHubRelease(
  channel: UpdateChannel,
): Promise<GitHubReleaseSummary | null> {
  try {
    const releases = await fetchGitHubJson<GitHubReleaseJson[]>(
      githubApiUrl('/releases?per_page=100'),
    );
    const candidate = selectNewestReleaseForChannel(releases, channel);
    return candidate ? mapRelease(candidate) : null;
  } catch (error: unknown) {
    if (isGitHubNotFound(error)) {
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
    if (isGitHubNotFound(error)) {
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

/**
 * Returns true when a GitHub API failure is a missing release (HTTP 404).
 *
 * Duck-types `status` so bundled copies of `GitHubApiError` still match.
 *
 * @param error Rejection from `fetchGitHubJson` or Chromium `session.fetch`.
 */
function isGitHubNotFound(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    if ((error as { status: unknown }).status === 404) {
      return true;
    }
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /\b404\b/.test(message);
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
    prerelease: isPrereleaseVersion(tagName) || release.prerelease === true,
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
  let response: Response;
  try {
    response = await updaterNetFetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Testrix-Updater',
        'X-GitHub-Api-Version': '2022-11-28',
        ...readGitHubAuthHeaders(),
      },
    });
  } catch (error: unknown) {
    throw new Error(formatUpdaterFetchError(error));
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new GitHubApiError(
      response.status,
      body.trim() || `GitHub API request failed (${response.status})`,
    );
  }

  return (await response.json()) as T;
}

/**
 * Turns a Chromium/Node network failure into a stable updater error string.
 *
 * @param error Rejection from Chromium `session.fetch`.
 */
export function formatUpdaterFetchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const compact = message.replace(/\s+/g, ' ').trim() || 'network error';
  return `Could not reach GitHub to check for updates (${compact}).`;
}
