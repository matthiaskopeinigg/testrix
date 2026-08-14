import { describe, expect, it } from 'vitest';

import { storedCookieSchema } from './stored-cookie.schema';

describe('storedCookieSchema', () => {
  it('parses a minimal stored cookie', () => {
    const parsed = storedCookieSchema.parse({
      key: 'session',
      value: 'abc',
      domain: 'example.com',
      path: '/',
    });
    expect(parsed.key).toBe('session');
  });
});
