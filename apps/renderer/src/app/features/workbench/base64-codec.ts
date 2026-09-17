export type Base64Mode = 'encode' | 'decode';

export interface Base64Result {
  readonly value: string;
  readonly error: string | null;
}

/**
 * Encode UTF-8 text as Base64, or decode Base64 back to UTF-8.
 */
export function transformBase64(input: string, mode: Base64Mode, urlSafe: boolean): Base64Result {
  if (!input)
    return { value: '', error: null };
  try {
    if (mode === 'encode')
      return { value: bytesToBase64(utf8Bytes(input), urlSafe), error: null };
    return { value: utf8Text(base64ToBytes(input, urlSafe)), error: null };
  } catch (error) {
    return { value: '', error: errorMessage(error, 'Invalid Base64') };
  }
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function utf8Text(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function bytesToBase64(bytes: Uint8Array, urlSafe: boolean): string {
  let binary = '';
  for (const byte of bytes)
    binary += String.fromCharCode(byte);
  const encoded = btoa(binary);
  if (!urlSafe)
    return encoded;
  return encoded.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64ToBytes(value: string, urlSafe: boolean): Uint8Array {
  const trimmed = value.trim().replaceAll(/\s+/gu, '');
  if (!trimmed)
    return new Uint8Array();
  const normalized = urlSafe
    ? trimmed.replaceAll('-', '+').replaceAll('_', '/')
    : trimmed;
  if (urlSafe ? !/^[A-Za-z0-9\-_+/]*={0,2}$/u.test(trimmed) : !/^[A-Za-z0-9+/]*={0,2}$/u.test(trimmed))
    throw new Error('Invalid Base64');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message)
    return error.message;
  return fallback;
}
