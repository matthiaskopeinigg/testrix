import { describe, expect, it } from 'vitest';

import { selectNewestReleaseForChannel } from './select-github-release';

describe('selectNewestReleaseForChannel', () => {
  it('picks the highest semver beta even when GitHub lists an older tag first', () => {
    const newest = selectNewestReleaseForChannel(
      [
        { tag_name: 'v1.0.0-beta.9', draft: false },
        { tag_name: 'v1.0.0-beta.8', draft: false },
        { tag_name: 'v1.0.0-beta.10', draft: false },
      ],
      'beta',
    );

    expect(newest?.tag_name).toBe('v1.0.0-beta.10');
  });

  it('picks a 1.0.1 beta over any 1.0.0 beta', () => {
    const newest = selectNewestReleaseForChannel(
      [
        { tag_name: 'v1.0.0-beta.9', draft: false },
        { tag_name: 'v1.0.1-beta.1', draft: false },
        { tag_name: 'v1.0.0-beta.10', draft: false },
      ],
      'beta',
    );

    expect(newest?.tag_name).toBe('v1.0.1-beta.1');
  });

  it('ignores drafts on the beta channel and includes a newer stable', () => {
    const newest = selectNewestReleaseForChannel(
      [
        { tag_name: 'v1.0.0-beta.11', draft: true },
        { tag_name: 'v1.0.0', draft: false },
        { tag_name: 'v1.0.0-beta.9', draft: false },
      ],
      'beta',
    );

    expect(newest?.tag_name).toBe('v1.0.0');
  });

  it('picks a newer stable over an older published beta on the beta channel', () => {
    const newest = selectNewestReleaseForChannel(
      [
        { tag_name: 'v1.0.3-beta.10', draft: false },
        { tag_name: 'v1.0.4', draft: false },
      ],
      'beta',
    );

    expect(newest?.tag_name).toBe('v1.0.4');
  });

  it('picks the newest stable tag and ignores betas', () => {
    const newest = selectNewestReleaseForChannel(
      [
        { tag_name: 'v1.0.0-beta.10', draft: false },
        { tag_name: 'v0.9.0', draft: false },
        { tag_name: 'v1.0.0', draft: false },
      ],
      'stable',
    );

    expect(newest?.tag_name).toBe('v1.0.0');
  });
});
