import type { MockRuleMatcher } from '@shared/testing';

/** Assigns matcher `priority` from list index so UI order matches evaluation order. */
export function syncMockMatcherPriorities(
  matchers: readonly MockRuleMatcher[],
): MockRuleMatcher[] {
  return matchers.map((matcher, index) => ({ ...matcher, priority: index }));
}

/** Moves a matcher within the list and re-syncs priorities. */
export function moveMockMatcher(
  matchers: readonly MockRuleMatcher[],
  fromIndex: number,
  direction: -1 | 1,
): MockRuleMatcher[] {
  const toIndex = fromIndex + direction;
  if (fromIndex < 0 || fromIndex >= matchers.length || toIndex < 0 || toIndex >= matchers.length) {
    return [...matchers];
  }
  const next = [...matchers];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item!);
  return syncMockMatcherPriorities(next);
}
