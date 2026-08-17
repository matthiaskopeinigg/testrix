import { z } from 'zod';

/** Java `Cipher.getInstance` transform matched by Node RSA OAEP SHA-1 / MGF1 SHA-1. */
export const RSA_OAEP_JAVA_TRANSFORM = 'RSA/ECB/OAEPWithSHA-1AndMGF1Padding' as const;

/** Encrypt or decrypt a UTF-8 string with RSA OAEP. */
export const rsaOaepModeSchema = z.enum(['encrypt', 'decrypt']);

export type RsaOaepMode = z.infer<typeof rsaOaepModeSchema>;

/** IPC / helper payload for RSA OAEP SHA-1 (standard Base64 ciphertext). */
export const rsaOaepCipherPayloadSchema = z.object({
  mode: rsaOaepModeSchema,
  pem: z.string().min(1, 'PEM key is required.'),
  keyPassword: z.string().default(''),
  input: z.string(),
  algorithm: z.literal(RSA_OAEP_JAVA_TRANSFORM).default(RSA_OAEP_JAVA_TRANSFORM),
});

export type RsaOaepCipherPayload = z.infer<typeof rsaOaepCipherPayloadSchema>;

export const rsaOaepCipherResultSchema = z.object({
  output: z.string(),
});

export type RsaOaepCipherResult = z.infer<typeof rsaOaepCipherResultSchema>;

const PRIVATE_PEM_HEADER = /-----BEGIN (?:ENCRYPTED |RSA )?PRIVATE KEY-----/i;

/**
 * Returns true when the PEM looks like a private key (PKCS#8, PKCS#1, or encrypted PKCS#8).
 */
export function pemLooksLikePrivateKey(pem: string): boolean {
  return PRIVATE_PEM_HEADER.test(pem);
}
