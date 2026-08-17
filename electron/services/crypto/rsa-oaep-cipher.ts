import {
  constants,
  createPrivateKey,
  createPublicKey,
  privateDecrypt,
  publicEncrypt,
  type KeyObject,
} from 'node:crypto';

import {
  pemLooksLikePrivateKey,
  RSA_OAEP_JAVA_TRANSFORM,
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

/**
 * Encrypts UTF-8 plaintext to standard Base64 using RSA OAEP SHA-1.
 *
 * Public PEM encrypts without a password. Private PEM is unlocked with `keyPassword`
 * and the public key is derived.
 */
export function encryptUtf8ToBase64(params: RsaOaepEncryptParams): string {
  const pem = params.pem.trim();
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
  const pem = params.pem.trim();
  if (!pem) {
    throw new Error('PEM key is required to decrypt.');
  }
  if (!pemLooksLikePrivateKey(pem)) {
    throw new Error('Decrypt needs a private key PEM.');
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
      return createPublicKey({ key: pem, format: 'pem' });
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
  const passphrase = keyPassword.trim();
  if (!passphrase) {
    throw new Error(
      operation === 'decrypt'
        ? 'Private-key password is required to decrypt.'
        : 'Private-key password is required to encrypt with a private PEM.',
    );
  }
  try {
    return createPrivateKey({ key: pem, format: 'pem', passphrase });
  } catch {
    throw new Error('Could not unlock the private key. Check the PEM and private-key password.');
  }
}

function cipherOperationFailureMessage(operation: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `RSA OAEP ${operation} failed: ${detail}`;
}
