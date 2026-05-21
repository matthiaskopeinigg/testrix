import { describe, expect, it } from 'vitest';

import { parseUrl, transformUrl } from './url.logic';

describe('url.logic', () => {
  it('encodes a URI component', () => {
    const result = transformUrl({ value: 'a b', encode: true, componentOnly: true });
    expect(result.error).toBeNull();
    expect(result.output).toBe('a%20b');
  });

  it('parses query parameters', () => {
    const parsed = parseUrl('https://example.com/path?foo=1&bar=two');
    expect(parsed.error).toBeNull();
    expect(parsed.host).toBe('example.com');
    expect(parsed.queryEntries).toEqual([
      { key: 'foo', value: '1' },
      { key: 'bar', value: 'two' },
    ]);
  });
});
