import { describe, expect, it } from 'vitest';

import { decodeJwt, splitJwt } from './jwt.logic';

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
});
