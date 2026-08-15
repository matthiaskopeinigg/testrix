import { describe, expect, it } from 'vitest';

import { filterPrefixSuggestions, inlineCompletionSuffix } from './filter-prefix-suggestions';

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

describe('inlineCompletionSuffix', () => {
  it('returns the untyped remainder of the suggestion', () => {
    expect(inlineCompletionSuffix('u', 'users')).toBe('sers');
    expect(inlineCompletionSuffix('USE', 'users')).toBe('rs');
  });

  it('returns empty when there is no remainder', () => {
    expect(inlineCompletionSuffix('', 'users')).toBe('');
    expect(inlineCompletionSuffix('users', 'users')).toBe('');
    expect(inlineCompletionSuffix('id', 'email')).toBe('');
  });
});
