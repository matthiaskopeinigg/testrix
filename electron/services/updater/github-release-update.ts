import type { UpdateChannel } from '../../../shared/updater/updater-status.schema';
import { isReleaseVersionNewer, normalizeReleaseTag } from '../../../shared/updater/release-version';

const GITHUB_OWNER = 'matthiaskopeinigg';
const GITHUB_REPO = 'testrix';

export interface GitHubReleaseSummary {
  readonly version: string;
  readonly tagName: string;
  readonly releasePageUrl: string;
  readonly prerelease: boolean;
}

interface GitHubReleaseJson {
  readonly tag_name?: string;
  readonly html_url?: string;
  readonly prerelease?: boolean;
  readonly draft?: boolean;
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
    const releases = await fetchGitHubJson<GitHubReleaseJson[]>(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=30`,
    );
    const candidate = releases.find((release) => release.prerelease && !release.draft);
    return candidate ? mapRelease(candidate) : null;
  }

  try {
    const latest = await fetchGitHubJson<GitHubReleaseJson>(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    );
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
  return {
    version: normalizeReleaseTag(tagName),
    tagName,
    releasePageUrl: release.html_url ?? buildReleasePageUrl(tagName),
    prerelease: release.prerelease === true,
  };
}

function buildReleasePageUrl(tagName: string): string {
  const slug = tagName.startsWith('v') ? tagName : `v${tagName}`;
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tag/${encodeURIComponent(slug)}`;
}

async function fetchGitHubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Testrix-Updater',
      'X-GitHub-Api-Version': '2022-11-28',
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
