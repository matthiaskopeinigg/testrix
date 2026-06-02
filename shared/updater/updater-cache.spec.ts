import { describe, expect, it } from 'vitest';

import { isUpdaterCacheStatusUsable } from './updater-cache';

describe('updater-cache', () => {
  it('rejects available cache entries without installerDownloadUrl', () => {
    expect(
      isUpdaterCacheStatusUsable({
        state: 'available',
        info: { version: '0.9.0-beta.2', externalOnly: true },
      }),
    ).toBe(false);
  });

  it('accepts available cache entries with installerDownloadUrl', () => {
    expect(
      isUpdaterCacheStatusUsable({
        state: 'available',
        info: {
          version: '0.9.0-beta.2',
          installerDownloadUrl: 'https://example.com/setup.exe',
        },
      }),
    ).toBe(true);
  });

  it('accepts non-available cache entries', () => {
    expect(isUpdaterCacheStatusUsable({ state: 'not-available', info: null })).toBe(true);
  });
});
