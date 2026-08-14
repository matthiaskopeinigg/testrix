import { describe, expect, it } from 'vitest';

import { testSuiteTreeTags } from './test-suite-tree-tags';

describe('testSuiteTreeTags', () => {
  it('returns user tags only for flows with critical flag set separately', () => {
    expect(testSuiteTreeTags({ tags: ['smoke', 'api'] })).toEqual(['smoke', 'api']);
  });

  it('returns undefined when there are no tags', () => {
    expect(testSuiteTreeTags({ tags: [] })).toBeUndefined();
  });
});
