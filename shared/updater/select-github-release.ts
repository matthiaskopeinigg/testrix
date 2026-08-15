import type { UpdateChannel } from './updater-status.schema';
import { isPrereleaseVersion, isReleaseVersionNewer, normalizeReleaseTag } from './release-version';

/**
 * GitHub release fields needed to pick an update-channel candidate.
 */
export interface GitHubReleaseChannelCandidate {
  readonly tag_name?: string;
  readonly draft?: boolean;
}

/**
 * Returns true when a GitHub release belongs on the given update channel.
 *
 * Channel membership uses the version string (`-` means beta). Hyphenated tags
 * are also GitHub prereleases; list order is not semver, so callers still pick
 * by version comparison.
 *
 * @param release GitHub release payload.
 * @param channel Installed update channel.
 */
export function isReleaseOnUpdateChannel(
  release: GitHubReleaseChannelCandidate,
  channel: UpdateChannel,
): boolean {
  if (release.draft) {
    return false;
  }
  const version = normalizeReleaseTag(release.tag_name ?? '');
  if (!version) {
    return false;
  }
  const isBeta = isPrereleaseVersion(version);
  return channel === 'beta' ? isBeta : !isBeta;
}

/**
 * Picks the newest non-draft release for an update channel by semver.
 *
 * GitHub's releases API is created_at order and the website sorts tags as
 * strings, so `v1.0.0-beta.10` can appear below `v1.0.0-beta.9`. Always compare
 * versions instead of taking the first match.
 *
 * @param releases GitHub release list.
 * @param channel Installed update channel.
 */
export function selectNewestReleaseForChannel<T extends GitHubReleaseChannelCandidate>(
  releases: readonly T[],
  channel: UpdateChannel,
): T | undefined {
  let newest: T | undefined;
  for (const release of releases) {
    if (!isReleaseOnUpdateChannel(release, channel)) {
      continue;
    }
    if (!newest || isReleaseVersionNewer(newest.tag_name ?? '', release.tag_name ?? '')) {
      newest = release;
    }
  }
  return newest;
}
