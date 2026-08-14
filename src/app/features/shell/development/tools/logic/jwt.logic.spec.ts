import { describe, expect, it } from 'vitest';

import { generateJwt, decodeJwt, splitJwt, validateJwt } from './jwt.logic';
import { assembleJwtClaims } from './jwt-claims';
import { createDefaultJwtSigningProfile } from '@shared/config';

/** Minimal HS256 JWT: header.payload. (signature omitted for decode-only tests) */
const SAMPLE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3RyaXgifQ.signature';

describe('jwt.logic', () => {
  it('splits a JWT into segments', () => {
    const parts = splitJwt(SAMPLE_TOKEN);
    expect(parts?.header).toBeTruthy();
    expect(parts?.payload).toBeTruthy();
  });

  it('decodes header and payload JSON', () => {
    const result = decodeJwt(SAMPLE_TOKEN);
    expect(result.error).toBeNull();
    expect(result.algorithm).toBe('HS256');
    expect(result.headerJson).toContain('HS256');
    expect(result.payloadJson).toContain('Testrix');
  });

  it('generates and validates an HS256 token', async () => {
    const secret = 'testrix-dev-secret';
    const generated = await generateJwt({
      alg: 'HS256',
      secretMaterial: secret,
      payload: { sub: 'user-1', name: 'Testrix' },
      typ: 'JWT',
    });
    expect(generated.error).toBeNull();
    expect(generated.token.split('.')).toHaveLength(3);

    const valid = await validateJwt(generated.token, {
      alg: 'HS256',
      secretMaterial: secret,
    });
    expect(valid.valid).toBe(true);
    expect(valid.payload?.['sub']).toBe('user-1');

    const invalid = await validateJwt(generated.token, {
      alg: 'HS256',
      secretMaterial: 'wrong-secret',
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.issues.some((issue) => issue.code === 'signature')).toBe(true);
  });

  it('fails validation when token is expired', async () => {
    const secret = 'testrix-dev-secret';
    const now = Math.floor(Date.now() / 1000);
    const generated = await generateJwt({
      alg: 'HS256',
      secretMaterial: secret,
      payload: { sub: 'user-1', exp: now - 10 },
    });
    expect(generated.error).toBeNull();

    const result = await validateJwt(generated.token, {
      alg: 'HS256',
      secretMaterial: secret,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'claim')).toBe(true);
  });

  it('assembles claims for preview without rotating jti', () => {
    const profile = createDefaultJwtSigningProfile();
    const a = assembleJwtClaims({ ...profile, includeJti: true, sub: 'abc' }, { preview: true, nowSec: 1_700_000_000 });
    const b = assembleJwtClaims({ ...profile, includeJti: true, sub: 'abc' }, { preview: true, nowSec: 1_700_000_000 });
    expect(a.payload['jti']).toBe('<auto-uuid>');
    expect(b.payload['jti']).toBe('<auto-uuid>');
    expect(a.payload['sub']).toBe('abc');
    expect(a.payload['exp']).toBe(1_700_000_000 + 3_600);
  });
});
