import { describe, expect, it } from 'vitest';

import {
  channelForVersion,
  compareVersions,
  effectiveUpdateChannel,
  githubRateLimitMessage,
  githubRetryAfterAt,
  isAllowedUpdateUrl,
  isGitHubRateLimitStatus,
  parseUpdateManifest,
  shouldSkipScheduledUpdateCheck,
  updateFetchUserAgent,
  parseUpdatePrefs,
  updateManifestUrl,
  updatePrefsPatchSchema,
  updateRejection,
  type UpdateManifest,
} from './update';

const SHA = `${'A'.repeat(86)}==`;

function manifest(overrides: Partial<UpdateManifest> = {}): UpdateManifest {
  return {
    version: '2.1.0',
    channel: 'stable',
    releasedAt: '2026-10-01T00:00:00.000Z',
    notes: 'Notes',
    url: 'https://github.com/o/r/releases/download/v2.1.0/Testrix.exe',
    sha512: SHA,
    size: 1024,
    ...overrides,
  };
}

describe('compareVersions', () => {
  it('orders releases, prereleases and numeric identifiers', () => {
    // Act
    const sorted = ['2.0.0', '2.0.0-beta.10', 'v1.0.0', '2.0.0-beta.2', '2.0.0-rc.1', 'nonsense'].sort(compareVersions);

    // Assert
    expect(sorted).toEqual(['nonsense', 'v1.0.0', '2.0.0-beta.2', '2.0.0-beta.10', '2.0.0-rc.1', '2.0.0']);
    expect(compareVersions('2.0.0+build.1', '2.0.0')).toBe(0);
    expect(compareVersions('2.0.0-beta', '2.0.0-beta.1')).toBe(-1);
  });
});

describe('update channels', () => {
  it('follows the build channel until the user picks one', () => {
    // Act
    const results = {
      beta: channelForVersion('2.0.0-beta.1'),
      stable: channelForVersion('2.0.0'),
      followsBuild: effectiveUpdateChannel({ channel: null, autoCheck: true, autoDownload: true }, '2.0.0-rc.1'),
      chosen: effectiveUpdateChannel({ channel: 'stable', autoCheck: true, autoDownload: true }, '2.0.0-rc.1'),
    };

    // Assert
    expect(results).toEqual({ beta: 'beta', stable: 'stable', followsBuild: 'beta', chosen: 'stable' });
    expect(updateManifestUrl('beta', 'o/r')).toBe('https://github.com/o/r/releases/download/updates/beta.json');
    expect(updateManifestUrl('stable', 'o/r', 'http://127.0.0.1:4173/')).toBe(
      'http://127.0.0.1:4173/o/r/releases/download/updates/stable.json',
    );
  });
});

describe('update manifests', () => {
  it('accepts a well-formed manifest and rejects bad fields', () => {
    // Act
    const valid = parseUpdateManifest(manifest());
    const insecure = parseUpdateManifest(manifest({ url: 'http://github.com/x.exe' }));
    const badDigest = parseUpdateManifest(manifest({ sha512: 'abc' }));
    const badVersion = parseUpdateManifest(manifest({ version: 'latest' }));

    // Assert
    expect(valid).not.toBeNull();
    expect([insecure, badDigest, badVersion]).toEqual([null, null, null]);
    const local = parseUpdateManifest(manifest({ url: 'http://127.0.0.1:9/Testrix.exe' }), (url) =>
      url.startsWith('http://127.0.0.1:9/'),
    );
    expect(local?.url).toBe('http://127.0.0.1:9/Testrix.exe');
  });

  it('explains why an update cannot be installed', () => {
    // Act
    const results = [
      updateRejection(manifest(), '2.0.0', 'stable'),
      updateRejection(manifest(), '2.1.0', 'stable'),
      updateRejection(manifest({ version: '2.0.9' }), '2.1.0', 'stable'),
      updateRejection(manifest(), '2.0.0', 'beta'),
      updateRejection(manifest({ minVersion: '2.0.5' }), '2.0.0', 'stable'),
    ];

    // Assert
    expect(results).toEqual([
      null,
      'Already up to date',
      'Already up to date',
      'Manifest is for the stable channel',
      'Testrix 2.1.0 needs 2.0.5 or newer installed first',
    ]);
  });

  it('only allows https downloads from GitHub release hosts', () => {
    // Act
    const results = [
      'https://github.com/o/r/releases/download/v1/Testrix.exe',
      'https://objects.githubusercontent.com/github-production-release-asset/1',
      'http://github.com/o/r',
      'https://github.com.evil.test/x',
      'not a url',
    ].map(isAllowedUpdateUrl);

    // Assert
    expect(results).toEqual([true, true, false, false, false]);
  });
});

describe('update prefs', () => {
  it('keeps a patch to the fields it names', () => {
    expect(updatePrefsPatchSchema.parse({ autoCheck: false })).toEqual({ autoCheck: false });
    expect(updatePrefsPatchSchema.safeParse({ channel: 'nightly' }).success).toBe(false);
  });

  it('defaults invalid stored fields', () => {
    expect(parseUpdatePrefs({ channel: 'beta', autoCheck: 'yes' })).toEqual({
      channel: 'beta',
      autoCheck: true,
      autoDownload: true,
    });
    expect(parseUpdatePrefs(null).channel).toBeNull();
  });
});

describe('GitHub rate limits', () => {
  const now = new Date('2026-10-03T12:00:00.000Z');

  it('treats 429 and exhausted 403 as rate limits', () => {
    expect(isGitHubRateLimitStatus(429, new Headers())).toBe(true);
    expect(isGitHubRateLimitStatus(403, new Headers({ 'x-ratelimit-remaining': '0' }))).toBe(true);
    expect(isGitHubRateLimitStatus(403, new Headers({ 'retry-after': '30' }))).toBe(true);
    expect(isGitHubRateLimitStatus(403, new Headers())).toBe(false);
    expect(isGitHubRateLimitStatus(404, new Headers())).toBe(false);
  });

  it('reads Retry-After seconds and x-ratelimit-reset', () => {
    expect(githubRetryAfterAt(new Headers({ 'retry-after': '90' }), now).toISOString()).toBe(
      '2026-10-03T12:01:30.000Z',
    );
    const reset = String(Math.floor(now.getTime() / 1000) + 60);
    expect(githubRetryAfterAt(new Headers({ 'x-ratelimit-reset': reset }), now).toISOString()).toBe(
      '2026-10-03T12:01:00.000Z',
    );
  });

  it('skips scheduled checks during backoff or inside the interval', () => {
    expect(
      shouldSkipScheduledUpdateCheck({
        lastCheckedAt: '2026-10-03T08:00:00.000Z',
        retryAfterAt: null,
        now,
      }),
    ).toBe(true);
    expect(
      shouldSkipScheduledUpdateCheck({
        lastCheckedAt: '2026-10-02T12:00:00.000Z',
        retryAfterAt: null,
        now,
      }),
    ).toBe(false);
    expect(
      shouldSkipScheduledUpdateCheck({
        lastCheckedAt: '2026-10-02T12:00:00.000Z',
        retryAfterAt: '2026-10-03T12:10:00.000Z',
        now,
      }),
    ).toBe(true);
  });

  it('names the client in the User-Agent', () => {
    expect(updateFetchUserAgent('2.0.0-beta.1', 'acme/testrix')).toBe(
      'Testrix/2.0.0-beta.1 (+https://github.com/acme/testrix)',
    );
    expect(githubRateLimitMessage(new Date('2026-10-03T12:10:00.000Z'), now)).toBe(
      'GitHub rate-limited the update check. Try again in 10 minutes.',
    );
  });
});
