import { describe, expect, it } from 'vitest';

import {
  changelogVersionFromTag,
  extractChangelogReleaseNotes,
} from './changelog-release-notes';

const CHANGELOG = `# Changelog

## [Unreleased]

## [1.0.1-beta.8] - 2026-08-15

### Changed

- Dropdown labels include folders

## [1.0.1-beta.7] - 2026-08-15

### Fixed

- Oracle SERVICE_NAME

## [1.0.0-beta.1] - 2026-08-14

Initial public beta.

[Unreleased]: https://example.com/compare/v1.0.1-beta.8...HEAD
[1.0.1-beta.8]: https://example.com/releases/tag/v1.0.1-beta.8
`;

describe('extractChangelogReleaseNotes', () => {
  it('strips a leading v from tags', () => {
    expect(changelogVersionFromTag('v1.0.1-beta.8')).toBe('1.0.1-beta.8');
    expect(changelogVersionFromTag('1.0.1-beta.8')).toBe('1.0.1-beta.8');
  });

  it('returns the matching Keep a Changelog section', () => {
    expect(extractChangelogReleaseNotes(CHANGELOG, 'v1.0.1-beta.8')).toBe(
      `## [1.0.1-beta.8] - 2026-08-15

### Changed

- Dropdown labels include folders
`,
    );
  });

  it('stops before markdown link references on the last section', () => {
    expect(extractChangelogReleaseNotes(CHANGELOG, 'v1.0.0-beta.1')).toBe(
      `## [1.0.0-beta.1] - 2026-08-14

Initial public beta.
`,
    );
  });

  it('throws when the version is missing', () => {
    expect(() => extractChangelogReleaseNotes(CHANGELOG, 'v9.9.9')).toThrow(
      /No CHANGELOG.md section found for 9.9.9/,
    );
  });
});
