export function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function decodeBase64Utf8(value: string): string {
  const binary = atob(value.trim());
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function toUrlSafeBase64(value: string): string {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function fromUrlSafeBase64(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return padded + '='.repeat(padLen);
}

export interface Base64TransformInput {
  readonly value: string;
  readonly encode: boolean;
  readonly urlSafe: boolean;
}

export interface Base64TransformResult {
  readonly output: string;
  readonly error: string | null;
}

export function transformBase64(input: Base64TransformInput): Base64TransformResult {
  const { value, encode, urlSafe } = input;
  if (!value) {
    return { output: '', error: null };
  }
  try {
    let output = encode ? encodeBase64Utf8(value) : decodeBase64Utf8(value);
    if (urlSafe) {
      output = encode ? toUrlSafeBase64(output) : decodeBase64Utf8(fromUrlSafeBase64(value.trim()));
    }
    return { output, error: null };
  } catch {
    return { output: '', error: 'Invalid Base64 input. Check padding and characters.' };
  }
}
