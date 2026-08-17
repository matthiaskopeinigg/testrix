/**
 * Extracts a Keep a Changelog section for a GitHub release tag.
 */

/**
 * Strips a leading `v` from a GitHub tag (`v1.0.1-beta.8` → `1.0.1-beta.8`).
 *
 * @param tag GitHub tag or semver.
 */
export function changelogVersionFromTag(tag: string): string {
  return tag.trim().replace(/^v/i, '');
}

/**
 * Returns the CHANGELOG.md body for `tag`, without the `## [version]` heading or date.
 *
 * @param markdown Full changelog text.
 * @param tag GitHub tag (`v1.0.1-beta.8`) or version (`1.0.1-beta.8`).
 */
export function extractChangelogReleaseNotes(markdown: string, tag: string): string {
  const version = changelogVersionFromTag(tag);
  if (!version) {
    throw new Error('A release tag or version is required');
  }
  const heading = new RegExp(
    `^## \\[${escapeRegExp(version)}\\](?:\\s|$)`,
    'm',
  );
  const match = heading.exec(markdown);
  if (!match || match.index == null) {
    throw new Error(`No CHANGELOG.md section found for ${version}`);
  }
  const from = match.index;
  const rest = markdown.slice(from + match[0].length);
  const nextHeading = rest.search(/^## /m);
  const nextLinkRef = rest.search(/^\[[^\]]+\]:\s/m);
  let endOffset = rest.length;
  if (nextHeading >= 0) {
    endOffset = Math.min(endOffset, nextHeading);
  }
  if (nextLinkRef >= 0) {
    endOffset = Math.min(endOffset, nextLinkRef);
  }
  const section = markdown.slice(from, from + match[0].length + endOffset).trim();
  return stripChangelogVersionHeading(section) + '\n';
}

/**
 * Removes `## [1.0.3-beta.9]` / `## [1.0.3-beta.9] - 2026-08-17` from release notes.
 *
 * @param section Changelog section including the version heading.
 */
export function stripChangelogVersionHeading(section: string): string {
  return section.replace(/^## \[[^\]]+\](?:\s+-\s+\d{4}-\d{2}-\d{2})?\s*/, '').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
