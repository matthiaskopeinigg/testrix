import { describe, expect, it } from 'vitest';

import {
  COMMON_HTTP_HEADER_NAMES,
  filterHttpHeaderNameSuggestions,
} from './common-http-header-names';

describe('filterHttpHeaderNameSuggestions', () => {
  it('returns a prefix of the catalog when query is empty', () => {
    expect(filterHttpHeaderNameSuggestions('', { limit: 3 })).toEqual([
      'Accept',
      'Accept-Charset',
      'Accept-Encoding',
    ]);
  });

  it('matches case-insensitively', () => {
    expect(filterHttpHeaderNameSuggestions('content')).toEqual([
      'Content-Disposition',
      'Content-Encoding',
      'Content-Language',
      'Content-Length',
      'Content-Location',
      'Content-MD5',
      'Content-Range',
      'Content-Type',
    ]);
  });

  it('returns no matches outside the catalog', () => {
    expect(filterHttpHeaderNameSuggestions('Not-A-Real-Header')).toEqual([]);
  });

  it('keeps catalog order', () => {
    const all = filterHttpHeaderNameSuggestions('a', { limit: COMMON_HTTP_HEADER_NAMES.length });
    expect(all[0]).toBe('Accept');
    expect(all).toContain('Authorization');
  });
});
