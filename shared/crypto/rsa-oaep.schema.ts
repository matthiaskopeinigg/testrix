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

const PRIVATE_PEM_HEADER = /-{3,}BEGIN (?:ENCRYPTED |RSA )?PRIVATE KEY-{3,}/i;
const PUBLIC_PEM_HEADER = /-{3,}BEGIN (?:RSA )?PUBLIC KEY-{3,}|-{3,}BEGIN CERTIFICATE-{3,}/i;
/** Typical RSA 2048 SPKI public key Base64 prefix (no PEM armor). */
const SPKI_RSA_PUBLIC_PREFIX = /^MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A/i;
/** Max Base64 layers to peel (Java configs sometimes wrap PEM twice). */
const MAX_PEM_BASE64_UNWRAP = 4;

/**
 * Normalizes pasted key material: trim, strip quotes, turn literal `\n` into newlines.
 */
export function normalizePemInput(raw: string): string {
  let text = raw.replace(/^\uFEFF/, '').trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  return text.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
}

/**
 * Peels nested UTF-8 Base64 wrappers until PEM headers appear.
 *
 * Java `PasswordService` stores `Base64(PEM)` (and some YAML values wrap that again).
 * Headerless PKCS#8 DER Base64 is left unchanged so Node can load it as DER.
 */
export function unwrapNestedPemEncoding(raw: string): string {
  let current = normalizePemInput(raw);
  for (let i = 0; i < MAX_PEM_BASE64_UNWRAP; i++) {
    if (hasPemBeginMarker(current)) {
      return current;
    }
    const compact = current.replace(/\s+/g, '');
    if (compact.length < 16 || !looksLikeBase64Alphabet(compact)) {
      return current;
    }
    const decoded = decodeBase64ToUtf8(padBase64(compact.replace(/-/g, '+').replace(/_/g, '/')));
    if (!decoded || decoded === current || !isMostlyPrintableAscii(decoded)) {
      return current;
    }
    current = decoded.trim();
  }
  return current;
}

/**
 * Returns true when the text is a public PEM or a typical RSA SPKI Base64 blob.
 */
export function pemLooksLikePublicKey(pem: string): boolean {
  const resolved = unwrapNestedPemEncoding(pem);
  if (PUBLIC_PEM_HEADER.test(resolved)) {
    return true;
  }
  if (PRIVATE_PEM_HEADER.test(resolved)) {
    return false;
  }
  return SPKI_RSA_PUBLIC_PREFIX.test(compactPemBase64(resolved));
}

/**
 * Returns true when the PEM looks like a private key (PKCS#8, PKCS#1, encrypted PKCS#8,
 * OpenSSL `BEGIN RSA PRIVATE KEY` with `Proc-Type: 4,ENCRYPTED`, a Java Base64-wrapped PEM,
 * or a headerless PKCS#8 Base64 body).
 */
export function pemLooksLikePrivateKey(pem: string): boolean {
  const resolved = unwrapNestedPemEncoding(pem);
  if (PRIVATE_PEM_HEADER.test(resolved)) {
    return true;
  }
  if (pemLooksLikePublicKey(pem)) {
    return false;
  }
  return looksLikePkcsDerBase64(normalizePemInput(pem));
}

/**
 * Strips whitespace from a PEM body or headerless Base64 blob.
 */
export function compactPemBase64(pem: string): string {
  const normalized = normalizePemInput(pem);
  if (normalized.includes('-----BEGIN')) {
    const body = normalized
      .replace(/-----BEGIN [^-]+-----/gi, '')
      .replace(/-----END [^-]+-----/gi, '');
    return body.replace(/\s+/g, '');
  }
  return normalized.replace(/\s+/g, '');
}

/**
 * Wraps compact Base64 as a PEM block (64-character lines).
 */
export function wrapPemBlock(label: string, compactBase64: string): string {
  const lines = compactBase64.match(/.{1,64}/g) ?? [compactBase64];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

function looksLikePkcsDerBase64(text: string): boolean {
  if (hasPemBeginMarker(text)) {
    return false;
  }
  const compact = text.replace(/\s+/g, '');
  if (compact.length < 64) {
    return false;
  }
  if (/^[0-9a-fA-F]+$/.test(compact) && compact.length % 2 === 0) {
    return true;
  }
  return looksLikeBase64Alphabet(compact);
}

/**
 * Returns true when the text already has PEM armor.
 */
function hasPemBeginMarker(text: string): boolean {
  return text.includes('-----BEGIN') || /-{3,}BEGIN /i.test(text);
}

/**
 * Returns true when compact text is standard or URL-safe Base64.
 */
function looksLikeBase64Alphabet(compact: string): boolean {
  const padded = padBase64(compact.replace(/-/g, '+').replace(/_/g, '/'));
  return /^[A-Za-z0-9+/]+=*$/.test(padded);
}

/**
 * Decodes standard Base64 to UTF-8. Returns null when the payload is empty or invalid.
 */
function decodeBase64ToUtf8(padded: string): string | null {
  try {
    const binary = globalThis.atob(padded);
    if (!binary) {
      return null;
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Returns true when almost every character is printable ASCII (PEM / nested Base64).
 */
function isMostlyPrintableAscii(text: string): boolean {
  if (!text) {
    return false;
  }
  let printable = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126)) {
      printable += 1;
    }
  }
  return printable / text.length > 0.95;
}

/**
 * Normalizes URL-safe Base64 and missing padding so Node can decode a key body.
 */
export function padBase64(value: string): string {
  const compact = value.replace(/\s+/g, '');
  return compact + '='.repeat((4 - (compact.length % 4)) % 4);
}
