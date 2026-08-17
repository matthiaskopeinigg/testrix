import { describe, expect, it } from 'vitest';

import {
  pemLooksLikePrivateKey,
  RSA_OAEP_JAVA_TRANSFORM,
  rsaOaepCipherPayloadSchema,
} from './rsa-oaep.schema';

describe('rsa-oaep.schema', () => {
  it('fixes the algorithm to Java OAEP SHA-1', () => {
    const parsed = rsaOaepCipherPayloadSchema.parse({
      mode: 'encrypt',
      pem: '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----',
      input: 'secret',
    });
    expect(parsed.algorithm).toBe(RSA_OAEP_JAVA_TRANSFORM);
    expect(parsed.keyPassword).toBe('');
  });

  it('detects private PEM headers', () => {
    expect(pemLooksLikePrivateKey('-----BEGIN ENCRYPTED PRIVATE KEY-----\n')).toBe(true);
    expect(pemLooksLikePrivateKey('-----BEGIN PRIVATE KEY-----\n')).toBe(true);
    expect(pemLooksLikePrivateKey('-----BEGIN RSA PRIVATE KEY-----\n')).toBe(true);
    expect(pemLooksLikePrivateKey('-----BEGIN PUBLIC KEY-----\n')).toBe(false);
  });

  it('treats a headerless PKCS#8 Base64 body as a private key', () => {
    const body = `${'MIIJ'.padEnd(80, 'A')}==`;
    expect(pemLooksLikePrivateKey(body)).toBe(true);
    expect(pemLooksLikePrivateKey(`"${body}"`)).toBe(true);
    expect(pemLooksLikePrivateKey(body.replace(/\+/g, '-').replace(/\//g, '_'))).toBe(true);
  });

  it('does not treat a public PEM with escaped newlines as private', () => {
    expect(
      pemLooksLikePrivateKey(
        '-----BEGIN PUBLIC KEY-----\\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\\n-----END PUBLIC KEY-----',
      ),
    ).toBe(false);
  });
});
