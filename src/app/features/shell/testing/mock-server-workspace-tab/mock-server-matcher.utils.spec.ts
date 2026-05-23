import { describe, expect, it } from 'vitest';

import { createDefaultMockRuleMatcher } from '../../../../../../shared/testing/mock-server.schema';

import { moveMockMatcher, syncMockMatcherPriorities } from './mock-server-matcher.utils';

describe('mock-server-matcher.utils', () => {
  it('syncs priority from list order', () => {
    const a = { ...createDefaultMockRuleMatcher('a'), priority: 9 };
    const b = { ...createDefaultMockRuleMatcher('b'), priority: 2 };
    const synced = syncMockMatcherPriorities([a, b]);
    expect(synced[0]?.priority).toBe(0);
    expect(synced[1]?.priority).toBe(1);
  });

  it('moves matchers and re-syncs priority', () => {
    const a = createDefaultMockRuleMatcher('a');
    const b = createDefaultMockRuleMatcher('b');
    const moved = moveMockMatcher([a, b], 0, 1);
    expect(moved[0]?.id).toBe('b');
    expect(moved[1]?.id).toBe('a');
    expect(moved[0]?.priority).toBe(0);
    expect(moved[1]?.priority).toBe(1);
  });
});
