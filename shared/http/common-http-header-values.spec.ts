import { describe, expect, it } from 'vitest';

import {
  filterHttpHeaderValueSuggestions,
  getHttpHeaderValueSuggestions,
} from './common-http-header-values';

describe('getHttpHeaderValueSuggestions', () => {
  it('returns values for a known header (case-insensitive)', () => {
    expect(getHttpHeaderValueSuggestions('Content-Type')).toContain('application/json');
  });

  it('returns empty for unknown headers', () => {
    expect(getHttpHeaderValueSuggestions('X-Custom-Header')).toEqual([]);
  });
});

describe('filterHttpHeaderValueSuggestions', () => {
  it('filters by value prefix', () => {
    expect(filterHttpHeaderValueSuggestions('Content-Type', 'application')).toEqual([
      'application/json',
      'application/xml',
      'application/pdf',
      'application/x-www-form-urlencoded',
    ]);
  });

  it('returns catalog prefix when value is empty', () => {
    const all = filterHttpHeaderValueSuggestions('Accept', '', { limit: 2 });
    expect(all).toEqual(['*/*', 'application/json']);
  });
});
