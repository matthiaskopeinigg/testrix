import { describe, expect, it } from 'vitest';

import { filterPrefixSuggestions } from './filter-prefix-suggestions';

describe('filterPrefixSuggestions', () => {
  const catalog = ['Content-Type', 'Content-Length', 'Cookie', 'Authorization'];

  it('returns a prefix of the catalog when query is empty', () => {
    expect(filterPrefixSuggestions('', catalog, 2)).toEqual(['Content-Type', 'Content-Length']);
  });

  it('matches case-insensitively', () => {
    expect(filterPrefixSuggestions('auth', catalog)).toEqual(['Authorization']);
  });

  it('returns no matches when nothing fits', () => {
    expect(filterPrefixSuggestions('zzz', catalog)).toEqual([]);
  });
});
