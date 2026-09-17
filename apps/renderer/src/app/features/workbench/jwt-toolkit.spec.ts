import { describe, expect, it } from 'vitest';

import { decodeJwt, encodeHs256Jwt, verifyHs256Jwt } from './jwt-toolkit';

describe('jwt toolkit', () => {
  it('decodes header and payload JSON', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'ada' })).toString('base64url');
    const result = decodeJwt(`${header}.${payload}.`);
    expect(result.error).toBeNull();
    expect(result.parts?.alg).toBe('none');
    expect(result.parts?.payloadJson).toContain('ada');
  });

  it('rejects tokens that are not three segments', () => {
    expect(decodeJwt('only-one').error).toBe('JWT must have three segments');
  });

  it('encodes and verifies HS256', async () => {
    const token = await encodeHs256Jwt('{"sub":"ada"}', 's3cret');
    expect(token.split('.')).toHaveLength(3);
    expect(await verifyHs256Jwt(token, 's3cret')).toBe('match');
    expect(await verifyHs256Jwt(token, 'other')).toBe('mismatch');
  });
});
