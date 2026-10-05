export type JwtMode = 'decode' | 'encode';

export interface JwtParts {
  readonly headerJson: string;
  readonly payloadJson: string;
  readonly signature: string;
  readonly alg: string | null;
}

export interface JwtDecodeResult {
  readonly parts: JwtParts | null;
  readonly error: string | null;
}

const HS256_HEADER = {
  alg: 'HS256',
  typ: 'JWT',
};

/**
 * Split a compact JWT and pretty-print header and payload JSON.
 */
export function decodeJwt(token: string): JwtDecodeResult {
  const trimmed = token.trim();
  if (!trimmed)
    return { parts: null, error: null };
  const segments = trimmed.split('.');
  if (segments.length !== 3)
    return { parts: null, error: 'JWT must have three segments' };
  const [headerSeg, payloadSeg, signature] = segments;
  if (!headerSeg || !payloadSeg || signature === undefined)
    return { parts: null, error: 'JWT must have three segments' };
  try {
    const header = parseJsonSegment(headerSeg, 'header');
    const payload = parseJsonSegment(payloadSeg, 'payload');
    const alg = typeof header['alg'] === 'string' ? header['alg'] : null;
    return {
      parts: {
        headerJson: JSON.stringify(header, null, 2),
        payloadJson: JSON.stringify(payload, null, 2),
        signature,
        alg,
      },
      error: null,
    };
  } catch (error) {
    return { parts: null, error: error instanceof Error ? error.message : 'Invalid JWT' };
  }
}

/**
 * Sign a JSON payload as a compact HS256 JWT using a local secret.
 */
export async function encodeHs256Jwt(payloadJson: string, secret: string): Promise<string> {
  const payload = parsePayload(payloadJson);
  const headerSeg = base64UrlFromJson(HS256_HEADER);
  const payloadSeg = base64UrlFromJson(payload);
  const signingInput = `${headerSeg}.${payloadSeg}`;
  const signature = await hmacSha256(secret, signingInput);
  return `${signingInput}.${signature}`;
}

/**
 * Verify an HS256 JWT against a local secret. Other algorithms are unsupported.
 */
export async function verifyHs256Jwt(
  token: string,
  secret: string,
): Promise<'match' | 'mismatch' | 'unsupported' | 'invalid'> {
  const decoded = decodeJwt(token);
  if (!decoded.parts)
    return 'invalid';
  if (decoded.parts.alg !== 'HS256')
    return 'unsupported';
  const segments = token.trim().split('.');
  const signingInput = `${segments[0]}.${segments[1]}`;
  const expected = await hmacSha256(secret, signingInput);
  return timingSafeEqual(decoded.parts.signature, expected) ? 'match' : 'mismatch';
}

function parsePayload(payloadJson: string): Record<string, unknown> {
  const trimmed = payloadJson.trim();
  if (!trimmed)
    return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('Payload must be JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Payload must be a JSON object');
  return parsed as Record<string, unknown>;
}

function parseJsonSegment(segment: string, label: string): Record<string, unknown> {
  const text = utf8FromBase64Url(segment);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Invalid ${label} JSON`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error(`Invalid ${label} JSON`);
  return parsed as Record<string, unknown>;
}

function base64UrlFromJson(value: unknown): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function utf8FromBase64Url(value: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(base64UrlToBytes(value));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes)
    binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/u.test(value))
    throw new Error('Invalid Base64URL');
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function hmacSha256(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return bytesToBase64Url(new Uint8Array(signature));
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length)
    return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1)
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}
