import { describe, expect, it } from 'vitest';

import { hashText, hmacSha256 } from './hash.logic';

describe('hash.logic', () => {
  it('computes MD5 of hello', async () => {
    expect(await hashText('md5', 'hello')).toBe('5d41402abc4b2a76b9719d911017c592');
  });

  it('computes SHA-256 of hello', async () => {
    expect(await hashText('sha-256', 'hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('computes HMAC-SHA256', async () => {
    const digest = await hmacSha256('key', 'hello');
    expect(digest).toHaveLength(64);
  });
});
