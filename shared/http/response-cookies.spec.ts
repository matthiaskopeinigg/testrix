import { describe, expect, it } from 'vitest';

import { parseSetCookieHeaders } from './response-cookies';

describe('parseSetCookieHeaders', () => {
  it('parses Set-Cookie name and value', () => {
    const rows = parseSetCookieHeaders([
      { key: 'Set-Cookie', value: 'session=abc; Path=/' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe('session');
    expect(rows[0]?.value).toBe('abc');
  });
});
