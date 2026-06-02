import type { UpdateChannel } from './updater-status.schema';

/**
 * Normalizes GitHub release tags for version comparison.
 *
 * @param tag GitHub tag name.
 */
export function normalizeReleaseTag(tag: string): string {
  return tag.replace(/^v/i, '').trim();
}

/**
 * Returns true when `version` is a semver prerelease (e.g. `0.9.0-beta.2`).
 *
 * @param version Normalized or tagged app/release version.
 */
export function isPrereleaseVersion(version: string): boolean {
  const normalized = normalizeReleaseTag(version);
  return normalized.includes('-');
}

/**
 * Maps an installed app version to the matching update channel.
 *
 * @param version Installed app semver.
 */
export function resolveUpdateChannelForVersion(version: string): UpdateChannel {
  return isPrereleaseVersion(version) ? 'beta' : 'stable';
}

/**
 * Returns true when `candidate` is newer than `current`.
 *
 * Supports `x.y.z` and `x.y.z-beta.n` prerelease tags used by Testrix.
 *
 * @param current Installed app version.
 * @param candidate Offered release version or tag.
 */
export function isReleaseVersionNewer(current: string, candidate: string): boolean {
  const left = normalizeReleaseTag(current);
  const right = normalizeReleaseTag(candidate);
  if (!left || !right || left === right) {
    return false;
  }

  const split = (value: string) => {
    const [core, pre] = value.split('-', 2);
    const parts = (core ?? '').split('.').map((part) => Number.parseInt(part, 10) || 0);
    while (parts.length < 3) {
      parts.push(0);
    }
    return { parts: parts.slice(0, 3), pre: pre ?? '' };
  };

  const a = split(left);
  const b = split(right);

  for (let i = 0; i < 3; i += 1) {
    if (a.parts[i] !== b.parts[i]) {
      return b.parts[i] > a.parts[i];
    }
  }

  if (!a.pre && b.pre) {
    return true;
  }
  if (a.pre && !b.pre) {
    return false;
  }
  if (a.pre && b.pre) {
    return b.pre.localeCompare(a.pre, undefined, { numeric: true }) > 0;
  }

  return false;
}
