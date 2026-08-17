import { describe, expect, it } from 'vitest';

import {
  formatDisplayVersion,
  isPrereleaseVersion,
  isReleaseVersionNewer,
  normalizeReleaseTag,
  resolveUpdateChannelForVersion,
} from './release-version';

describe('release-version', () => {
  it('normalizes release tags', () => {
    expect(normalizeReleaseTag('v0.9.0-beta.2')).toBe('0.9.0-beta.2');
  });

  it('formats display versions with a leading v', () => {
    expect(formatDisplayVersion('1.0.3-beta.9')).toBe('v1.0.3-beta.9');
    expect(formatDisplayVersion('v1.0.3')).toBe('v1.0.3');
    expect(formatDisplayVersion('')).toBe('');
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
    expect(isReleaseVersionNewer('1.0.0-beta.9', '1.0.0-beta.10')).toBe(true);
    expect(isReleaseVersionNewer('1.0.0-beta.10', '1.0.0-beta.9')).toBe(false);
    expect(isReleaseVersionNewer('1.0.0-beta.9', '1.0.1-beta.1')).toBe(true);
  });

  it('treats a same-core stable as newer than its beta', () => {
    expect(isReleaseVersionNewer('1.0.0-beta.9', '1.0.0')).toBe(true);
    expect(isReleaseVersionNewer('1.0.0', '1.0.0-beta.9')).toBe(false);
    expect(isReleaseVersionNewer('1.0.3-beta.10', '1.0.4')).toBe(true);
  });

  it('treats a lower-core stable as older than an installed beta', () => {
    expect(isReleaseVersionNewer('0.9.0-beta.2', '0.1.3')).toBe(false);
  });
});
