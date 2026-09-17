import { describe, expect, it } from 'vitest';

import { applyQueryPairs, formatQueryPairs, parseQueryPairs, transformUrl } from './url-codec';

describe('transformUrl', () => {
  it('encodes a component', () => {
    expect(transformUrl('a b', 'encode', 'component').value).toBe('a%20b');
  });

  it('leaves URI separators in full URI mode', () => {
    const result = transformUrl('https://example.com/a b', 'encode', 'uri');
    expect(result.value).toContain('https://example.com/');
    expect(result.value).toContain('a%20b');
  });

  it('returns an error for malformed decode', () => {
    expect(transformUrl('%', 'decode', 'component').error).toBeTruthy();
  });
});

describe('query pairs', () => {
  it('round-trips a query string', () => {
    const pairs = parseQueryPairs('q=hello+world&n=1');
    expect(formatQueryPairs(pairs)).toBe('q=hello+world&n=1');
  });

  it('applies pairs onto a URI', () => {
    const next = applyQueryPairs('https://example.com/search?old=1', [
      { key: 'q', value: 'ada' },
    ]);
    expect(next).toContain('https://example.com/search');
    expect(next).toContain('q=ada');
    expect(next).not.toContain('old=1');
  });
});
