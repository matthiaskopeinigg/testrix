import { describe, expect, it } from 'vitest';

import {
  isPrereleaseVersion,
  isReleaseVersionNewer,
  normalizeReleaseTag,
  resolveUpdateChannelForVersion,
} from './release-version';

describe('release-version', () => {
  it('normalizes release tags', () => {
    expect(normalizeReleaseTag('v0.9.0-beta.2')).toBe('0.9.0-beta.2');
  });

  it('detects prerelease versions', () => {
    expect(isPrereleaseVersion('0.9.0-beta.2')).toBe(true);
    expect(isPrereleaseVersion('1.0.0')).toBe(false);
  });

  it('maps installed versions to update channels', () => {
    expect(resolveUpdateChannelForVersion('0.9.0-beta.2')).toBe('beta');
    expect(resolveUpdateChannelForVersion('1.0.0')).toBe('stable');
  });

  it('detects newer beta releases', () => {
    expect(isReleaseVersionNewer('0.9.0-beta.1', '0.9.0-beta.2')).toBe(true);
    expect(isReleaseVersionNewer('0.9.0-beta.2', '0.9.0-beta.2')).toBe(false);
  });

  it('treats stable releases as older than installed beta builds', () => {
    expect(isReleaseVersionNewer('0.9.0-beta.2', '0.1.3')).toBe(false);
  });
});
