import { describe, expect, it } from 'vitest';

import {
  isReleaseVersionNewer,
  normalizeReleaseTag,
} from './release-version';

describe('release-version', () => {
  it('normalizes release tags', () => {
    expect(normalizeReleaseTag('v0.9.0-beta.2')).toBe('0.9.0-beta.2');
  });

  it('detects newer beta releases', () => {
    expect(isReleaseVersionNewer('0.9.0-beta.1', '0.9.0-beta.2')).toBe(true);
    expect(isReleaseVersionNewer('0.9.0-beta.2', '0.9.0-beta.2')).toBe(false);
  });

  it('treats stable releases as older than installed beta builds', () => {
    expect(isReleaseVersionNewer('0.9.0-beta.2', '0.1.3')).toBe(false);
  });
});
