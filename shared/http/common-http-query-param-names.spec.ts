import { describe, expect, it } from 'vitest';

import { filterHttpQueryParamNameSuggestions } from './common-http-query-param-names';

describe('filterHttpQueryParamNameSuggestions', () => {
  it('returns catalog prefix when query is empty', () => {
    expect(filterHttpQueryParamNameSuggestions('', { limit: 2 })).toEqual([
      'access_token',
      'api_key',
    ]);
  });

  it('matches case-insensitively', () => {
    expect(filterHttpQueryParamNameSuggestions('Page')).toEqual(['page', 'pageSize']);
  });
});
