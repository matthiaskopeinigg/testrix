export function decodeBase64Url(segment: string): string {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + '='.repeat(padLen));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export interface JwtParts {
  readonly header: string;
  readonly payload: string;
  readonly signature: string;
}

export function splitJwt(token: string): JwtParts | null {
  const parts = token.trim().split('.');
  if (parts.length < 2) {
    return null;
  }
  return {
    header: parts[0] ?? '',
    payload: parts[1] ?? '',
    signature: parts[2] ?? '',
  };
}

export interface JwtDecodeResult {
  readonly headerJson: string;
  readonly payloadJson: string;
  readonly algorithm: string | null;
  readonly expiresAt: string | null;
  readonly issuedAt: string | null;
  readonly error: string | null;
}

function formatClaimEpoch(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  try {
    return new Date(value * 1000).toLocaleString();
  } catch {
    return null;
  }
}

export function decodeJwt(token: string): JwtDecodeResult {
  const parts = splitJwt(token);
  if (!parts) {
    return {
      headerJson: '',
      payloadJson: '',
      algorithm: null,
      expiresAt: null,
      issuedAt: null,
      error: 'JWT must have at least header and payload segments.',
    };
  }
  try {
    const header = JSON.parse(decodeBase64Url(parts.header)) as Record<string, unknown>;
    const payload = JSON.parse(decodeBase64Url(parts.payload)) as Record<string, unknown>;
    return {
      headerJson: JSON.stringify(header, null, 2),
      payloadJson: JSON.stringify(payload, null, 2),
      algorithm: typeof header['alg'] === 'string' ? header['alg'] : null,
      expiresAt: formatClaimEpoch(payload['exp']),
      issuedAt: formatClaimEpoch(payload['iat']),
      error: null,
    };
  } catch {
    return {
      headerJson: '',
      payloadJson: '',
      algorithm: null,
      expiresAt: null,
      issuedAt: null,
      error: 'Could not decode JWT segments. Check that the token is valid.',
    };
  }
}

export async function encodeJwtHs256(
  headerJson: string,
  payloadJson: string,
  secret: string,
): Promise<{ readonly token: string; readonly error: string | null }> {
  try {
    const header = JSON.parse(headerJson) as Record<string, unknown>;
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    const alg = typeof header['alg'] === 'string' ? header['alg'] : 'HS256';
    if (alg !== 'HS256') {
      return { token: '', error: 'Only HS256 signing is supported in this tool.' };
    }
    if (!secret.trim()) {
      return { token: '', error: 'Enter a secret for HS256 signing.' };
    }
    const headerPart = encodeBase64Url(JSON.stringify(header));
    const payloadPart = encodeBase64Url(JSON.stringify(payload));
    const signingInput = `${headerPart}.${payloadPart}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
    const bytes = new Uint8Array(signature);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    const sig = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    return { token: `${signingInput}.${sig}`, error: null };
  } catch {
    return { token: '', error: 'Header and payload must be valid JSON.' };
  }
}

export async function verifyJwtHs256(
  token: string,
  secret: string,
): Promise<{ readonly valid: boolean; readonly error: string | null }> {
  const parts = splitJwt(token);
  if (!parts?.signature) {
    return { valid: false, error: 'Token must include a signature segment.' };
  }
  if (!secret.trim()) {
    return { valid: false, error: 'Enter the HS256 secret to verify.' };
  }
  try {
    const header = JSON.parse(decodeBase64Url(parts.header)) as Record<string, unknown>;
    if (header['alg'] !== 'HS256') {
      return { valid: false, error: 'Verification supports HS256 tokens only.' };
    }
    const signingInput = `${parts.header}.${parts.payload}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const sigBytes = Uint8Array.from(
      atob(parts.signature.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0),
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(signingInput),
    );
    return { valid, error: null };
  } catch {
    return { valid: false, error: 'Could not verify token.' };
  }
}
