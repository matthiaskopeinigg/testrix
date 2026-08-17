import {
  constants,
  createPrivateKey,
  createPublicKey,
  privateDecrypt,
  publicEncrypt,
  type KeyObject,
} from 'node:crypto';

import {
  compactPemBase64,
  padBase64,
  pemLooksLikePrivateKey,
  pemLooksLikePublicKey,
  RSA_OAEP_JAVA_TRANSFORM,
  unwrapNestedPemEncoding,
  wrapPemBlock,
  normalizePemArmor,
} from '../../../shared/crypto/rsa-oaep.schema';

/** Node options matching Java `RSA/ECB/OAEPWithSHA-1AndMGF1Padding`. */
const RSA_OAEP_SHA1 = {
  padding: constants.RSA_PKCS1_OAEP_PADDING,
  oaepHash: 'sha1',
} as const;

export interface RsaOaepEncryptParams {
  readonly pem: string;
  readonly keyPassword: string;
  readonly plaintext: string;
}

export interface RsaOaepDecryptParams {
  readonly pem: string;
  readonly keyPassword: string;
  readonly ciphertext: string;
}

interface PrivateKeyCandidate {
  readonly key: string | Buffer;
  readonly format: 'pem' | 'der';
  readonly type?: 'pkcs8' | 'pkcs1';
}

/**
 * Encrypts UTF-8 plaintext to standard Base64 using RSA OAEP SHA-1.
 *
 * Public PEM encrypts without a password. Private PEM is unlocked with `keyPassword`
 * and the public key is derived.
 */
export function encryptUtf8ToBase64(params: RsaOaepEncryptParams): string {
  const pem = unwrapNestedPemEncoding(params.pem);
  if (!pem) {
    throw new Error('PEM key is required to encrypt.');
  }
  const publicKey = loadPublicKeyForEncrypt(pem, params.keyPassword);
  const encrypted = publicEncrypt(
    { key: publicKey, ...RSA_OAEP_SHA1 },
    Buffer.from(params.plaintext, 'utf8'),
  );
  return encrypted.toString('base64');
}

/**
 * Decrypts standard Base64 ciphertext to UTF-8 using RSA OAEP SHA-1 and a private PEM.
 */
export function decryptBase64ToUtf8(params: RsaOaepDecryptParams): string {
  const pem = unwrapNestedPemEncoding(params.pem);
  if (!pem) {
    throw new Error('PEM key is required to decrypt.');
  }
  if (pemLooksLikePublicKey(pem)) {
    throw new Error(
      'That value is a public key or certificate. Decrypt needs a private key (BEGIN PRIVATE KEY / BEGIN RSA PRIVATE KEY / BEGIN ENCRYPTED PRIVATE KEY), a Java Base64-wrapped PEM, or a headerless PKCS#8 body.',
    );
  }
  const privateKey = loadPrivateKey(pem, params.keyPassword, 'decrypt');
  let cipherBytes: Buffer;
  try {
    cipherBytes = Buffer.from(params.ciphertext.trim(), 'base64');
  } catch {
    throw new Error('Ciphertext is not valid Base64.');
  }
  if (cipherBytes.length === 0) {
    throw new Error('Ciphertext is empty or not valid Base64.');
  }
  try {
    const decrypted = privateDecrypt({ key: privateKey, ...RSA_OAEP_SHA1 }, cipherBytes);
    return decrypted.toString('utf8');
  } catch (error: unknown) {
    throw new Error(cipherOperationFailureMessage('decrypt', error));
  }
}

/**
 * Java transform name this helper implements.
 */
export function rsaOaepJavaTransform(): string {
  return RSA_OAEP_JAVA_TRANSFORM;
}

function loadPublicKeyForEncrypt(pem: string, keyPassword: string): KeyObject {
  if (!pemLooksLikePrivateKey(pem)) {
    try {
      const resolved = unwrapNestedPemEncoding(pem);
      const armored = resolved.includes('-----BEGIN')
        ? normalizePemArmor(resolved)
        : wrapPemBlock('PUBLIC KEY', compactPemBase64(resolved));
      return createPublicKey({ key: armored, format: 'pem' });
    } catch (error: unknown) {
      throw new Error(cipherOperationFailureMessage('load public key', error));
    }
  }
  const privateKey = loadPrivateKey(pem, keyPassword, 'encrypt');
  try {
    return createPublicKey(privateKey);
  } catch (error: unknown) {
    throw new Error(cipherOperationFailureMessage('derive public key', error));
  }
}

function loadPrivateKey(pem: string, keyPassword: string, operation: 'encrypt' | 'decrypt'): KeyObject {
  const candidates = privateKeyLoadCandidates(pem);
  if (candidates.length === 0) {
    throw new Error(
      'Could not read a private key. Paste PEM including the BEGIN/END lines, a Java Base64-wrapped PEM, or the Base64 PKCS#8 body (often a long MII… string).',
    );
  }
  const passphrases: readonly (string | undefined)[] = keyPassword.trim()
    ? passphraseCandidates(keyPassword.trim())
    : [undefined];
  for (const candidate of candidates) {
    for (const tryPassphrase of passphrases) {
      try {
        return createPrivateKey({
          key: candidate.key,
          format: candidate.format,
          type: candidate.type,
          ...(tryPassphrase ? { passphrase: tryPassphrase } : {}),
        });
      } catch {
        continue;
      }
    }
  }
  throw new Error(
    keyPassword.trim()
      ? 'Could not unlock the private key. Check the PEM (BEGIN/END lines, Java Base64-wrapped OpenSSL PEM, or PKCS#8 Base64) and private-key password (plain or Base64).'
      : operation === 'decrypt'
        ? 'Could not read the private key. If it is password-protected, enter the private-key password.'
        : 'Could not read the private key. Encrypt with a public PEM, or unlock a private PEM with its password.',
  );
}

/**
 * Tries the password as configured, then as UTF-8 of Base64 (Spring YAML often stores both that way).
 */
function passphraseCandidates(password: string): string[] {
  const candidates = [password];
  const compact = password.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/_-]+=*$/.test(compact) || compact.length < 4) {
    return candidates;
  }
  try {
    const decoded = Buffer.from(padBase64(compact.replace(/-/g, '+').replace(/_/g, '/')), 'base64').toString(
      'utf8',
    );
    if (decoded && decoded !== password && /^[\x20-\x7E]+$/.test(decoded) && decoded.length <= 256) {
      candidates.push(decoded);
    }
  } catch {
    return candidates;
  }
  return candidates;
}

function privateKeyLoadCandidates(pem: string): PrivateKeyCandidate[] {
  const resolved = unwrapNestedPemEncoding(pem);
  const armored = resolved.includes('-----BEGIN') ? normalizePemArmor(resolved) : resolved;
  if (/-{3,}BEGIN (?:ENCRYPTED |RSA )?PRIVATE KEY-{3,}/i.test(armored)) {
    return [{ key: armored, format: 'pem' }];
  }
  const compact = compactPemBase64(resolved);
  const der = decodeHeaderlessKeyBlob(compact);
  if (!der) {
    return [{ key: resolved, format: 'pem' }];
  }
  const standardB64 = der.toString('base64');
  return [
    { key: wrapPemBlock('ENCRYPTED PRIVATE KEY', standardB64), format: 'pem' },
    { key: wrapPemBlock('PRIVATE KEY', standardB64), format: 'pem' },
    { key: wrapPemBlock('RSA PRIVATE KEY', standardB64), format: 'pem' },
    { key: der, format: 'der', type: 'pkcs8' },
    { key: der, format: 'der', type: 'pkcs1' },
  ];
}

/**
 * Decodes a headerless private-key blob from standard Base64, URL-safe Base64, or hex.
 */
function decodeHeaderlessKeyBlob(compact: string): Buffer | null {
  if (compact.length < 64) {
    return null;
  }
  if (/^[0-9a-fA-F]+$/.test(compact) && compact.length % 2 === 0) {
    const hex = Buffer.from(compact, 'hex');
    return hex.length >= 64 ? hex : null;
  }
  const padded = padBase64(compact.replace(/-/g, '+').replace(/_/g, '/'));
  if (!/^[A-Za-z0-9+/]+=*$/.test(padded)) {
    return null;
  }
  const der = Buffer.from(padded, 'base64');
  return der.length >= 64 ? der : null;
}

function cipherOperationFailureMessage(operation: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `RSA OAEP ${operation} failed: ${detail}`;
}
