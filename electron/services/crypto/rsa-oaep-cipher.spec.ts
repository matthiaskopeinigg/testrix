import { generateKeyPairSync } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { pemLooksLikePrivateKey } from '../../../shared/crypto/rsa-oaep.schema';
import { decryptBase64ToUtf8, encryptUtf8ToBase64 } from './rsa-oaep-cipher';

const PEM_PASSWORD = 'unit-test-pem-password';
const PLAINTEXT = 'profile-password-42';

function encryptedPkcs1Pair(): { readonly publicPem: string; readonly privatePem: string } {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: {
      type: 'pkcs1',
      format: 'pem',
      cipher: 'des-ede3-cbc',
      passphrase: PEM_PASSWORD,
    },
  });
  return { publicPem: pair.publicKey, privatePem: pair.privateKey };
}

function encryptedPkcs8Pair(): { readonly publicPem: string; readonly privatePem: string } {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
      cipher: 'aes-256-cbc',
      passphrase: PEM_PASSWORD,
    },
  });
  return { publicPem: pair.publicKey, privatePem: pair.privateKey };
}

describe('rsa-oaep-cipher', () => {
  it('round-trips UTF-8 through a password-protected PKCS#8 private key', () => {
    const { publicPem, privatePem } = encryptedPkcs8Pair();
    expect(pemLooksLikePrivateKey(privatePem)).toBe(true);
    expect(pemLooksLikePrivateKey(publicPem)).toBe(false);

    const ciphertext = encryptUtf8ToBase64({
      pem: publicPem,
      keyPassword: '',
      plaintext: PLAINTEXT,
    });
    expect(ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/);

    const decrypted = decryptBase64ToUtf8({
      pem: privatePem,
      keyPassword: PEM_PASSWORD,
      ciphertext,
    });
    expect(decrypted).toBe(PLAINTEXT);
  });

  it('encrypts by deriving the public key from an encrypted private PEM', () => {
    const { privatePem } = encryptedPkcs8Pair();
    const ciphertext = encryptUtf8ToBase64({
      pem: privatePem,
      keyPassword: PEM_PASSWORD,
      plaintext: PLAINTEXT,
    });
    const decrypted = decryptBase64ToUtf8({
      pem: privatePem,
      keyPassword: PEM_PASSWORD,
      ciphertext,
    });
    expect(decrypted).toBe(PLAINTEXT);
  });

  it('fails decrypt when the private-key password is wrong', () => {
    const { publicPem, privatePem } = encryptedPkcs8Pair();
    const ciphertext = encryptUtf8ToBase64({
      pem: publicPem,
      keyPassword: '',
      plaintext: PLAINTEXT,
    });
    expect(() =>
      decryptBase64ToUtf8({
        pem: privatePem,
        keyPassword: 'not-the-password',
        ciphertext,
      }),
    ).toThrow(/private-key password/i);
  });

  it('fails encrypt from a private PEM when the password is missing', () => {
    const { privatePem } = encryptedPkcs8Pair();
    expect(() =>
      encryptUtf8ToBase64({
        pem: privatePem,
        keyPassword: '',
        plaintext: PLAINTEXT,
      }),
    ).toThrow(/Private-key password is required to encrypt/);
  });

  it('decrypts a headerless PKCS#8 Base64 body', () => {
    const { publicPem, privatePem } = encryptedPkcs8Pair();
    const ciphertext = encryptUtf8ToBase64({
      pem: publicPem,
      keyPassword: '',
      plaintext: PLAINTEXT,
    });
    const body = privatePem
      .replace(/-----BEGIN [^-]+-----/g, '')
      .replace(/-----END [^-]+-----/g, '')
      .replace(/\s+/g, '');
    expect(pemLooksLikePrivateKey(body)).toBe(true);
    expect(
      decryptBase64ToUtf8({
        pem: body,
        keyPassword: PEM_PASSWORD,
        ciphertext,
      }),
    ).toBe(PLAINTEXT);

    const urlSafe = body.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(
      decryptBase64ToUtf8({
        pem: urlSafe,
        keyPassword: PEM_PASSWORD,
        ciphertext,
      }),
    ).toBe(PLAINTEXT);

    const hex = Buffer.from(body, 'base64').toString('hex');
    expect(
      decryptBase64ToUtf8({
        pem: hex,
        keyPassword: PEM_PASSWORD,
        ciphertext,
      }),
    ).toBe(PLAINTEXT);
  });

  it('decrypts a PEM with literal \\n escapes', () => {
    const { publicPem, privatePem } = encryptedPkcs8Pair();
    const ciphertext = encryptUtf8ToBase64({
      pem: publicPem,
      keyPassword: '',
      plaintext: PLAINTEXT,
    });
    const escaped = privatePem.replace(/\n/g, '\\n');
    expect(
      decryptBase64ToUtf8({
        pem: escaped,
        keyPassword: PEM_PASSWORD,
        ciphertext,
      }),
    ).toBe(PLAINTEXT);
  });

  it('rejects a public PEM on decrypt with a clear error', () => {
    const { publicPem } = encryptedPkcs8Pair();
    expect(() =>
      decryptBase64ToUtf8({
        pem: publicPem,
        keyPassword: PEM_PASSWORD,
        ciphertext: 'AAAA',
      }),
    ).toThrow(/public key or certificate/i);
  });

  it('decrypts a Java-style Base64-wrapped OpenSSL encrypted PKCS#1 key', () => {
    const { publicPem, privatePem } = encryptedPkcs1Pair();
    expect(privatePem).toContain('BEGIN RSA PRIVATE KEY');
    expect(privatePem).toMatch(/Proc-Type:\s*4,ENCRYPTED/i);

    const ciphertext = encryptUtf8ToBase64({
      pem: publicPem,
      keyPassword: '',
      plaintext: PLAINTEXT,
    });
    const once = Buffer.from(privatePem, 'utf8').toString('base64');
    const twice = Buffer.from(once, 'utf8').toString('base64');
    const passwordB64 = Buffer.from(PEM_PASSWORD, 'utf8').toString('base64');

    expect(
      decryptBase64ToUtf8({
        pem: once,
        keyPassword: PEM_PASSWORD,
        ciphertext,
      }),
    ).toBe(PLAINTEXT);
    expect(
      decryptBase64ToUtf8({
        pem: twice,
        keyPassword: passwordB64,
        ciphertext,
      }),
    ).toBe(PLAINTEXT);
  });
});
