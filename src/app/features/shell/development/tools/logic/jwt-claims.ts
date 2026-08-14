import type { JwtAlgorithm, JwtSigningProfile } from '@shared/config';

export interface JwtAssembledPreview {
  readonly header: Record<string, unknown>;
  readonly payload: Record<string, unknown>;
  readonly headerJson: string;
  readonly payloadJson: string;
  readonly error: string | null;
}

function parseExtraClaims(json: string): { readonly claims: Record<string, unknown>; readonly error: string | null } {
  const trimmed = json.trim() || '{}';
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { claims: {}, error: 'Extra claims must be a JSON object.' };
    }
    return { claims: parsed as Record<string, unknown>, error: null };
  } catch {
    return { claims: {}, error: 'Extra claims must be valid JSON.' };
  }
}

function parseAudience(aud: string): string | string[] | undefined {
  const parts = aud
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }
  return parts.length === 1 ? parts[0] : parts;
}

/**
 * Assembles header/payload for live preview and signing from a signing profile.
 * Time claims use `nowSec` so callers can freeze the clock in tests.
 */
export function assembleJwtClaims(
  profile: JwtSigningProfile,
  options?: {
    readonly nowSec?: number;
    readonly jti?: string;
    readonly preview?: boolean;
  },
): JwtAssembledPreview {
  const nowSec = options?.nowSec ?? Math.floor(Date.now() / 1000);
  const extra = parseExtraClaims(profile.extraClaimsJson);
  const header: Record<string, unknown> = {
    alg: profile.alg,
    typ: profile.typ.trim() || 'JWT',
  };
  if (profile.kid.trim()) {
    header['kid'] = profile.kid.trim();
  }

  const payload: Record<string, unknown> = { ...extra.claims };

  if (profile.sub.trim()) {
    payload['sub'] = profile.sub.trim();
  }
  if (profile.iss.trim()) {
    payload['iss'] = profile.iss.trim();
  }
  const aud = parseAudience(profile.aud);
  if (aud !== undefined) {
    payload['aud'] = aud;
  }
  if (profile.includeIat) {
    payload['iat'] = nowSec;
  }
  if (profile.ttlSec > 0) {
    payload['exp'] = nowSec + profile.ttlSec;
  }
  if (profile.nbfOffsetSec > 0) {
    payload['nbf'] = nowSec + profile.nbfOffsetSec;
  }
  if (profile.includeJti) {
    if (options?.preview) {
      payload['jti'] = '<auto-uuid>';
    } else {
      payload['jti'] =
        options?.jti ??
        (typeof globalThis.crypto?.randomUUID === 'function'
          ? globalThis.crypto.randomUUID()
          : `jti-${nowSec}`);
    }
  }

  return {
    header,
    payload,
    headerJson: JSON.stringify(header, null, 2),
    payloadJson: JSON.stringify(payload, null, 2),
    error: extra.error,
  };
}

export const JWT_TTL_PRESETS: readonly { readonly label: string; readonly ttlSec: number }[] = [
  { label: '5 minutes', ttlSec: 300 },
  { label: '15 minutes', ttlSec: 900 },
  { label: '1 hour', ttlSec: 3_600 },
  { label: '24 hours', ttlSec: 86_400 },
  { label: 'No expiry', ttlSec: 0 },
];

export const JWT_ALGORITHM_OPTIONS: readonly { readonly value: JwtAlgorithm; readonly label: string }[] =
  [
    { value: 'HS256', label: 'HS256 (HMAC)' },
    { value: 'HS384', label: 'HS384 (HMAC)' },
    { value: 'HS512', label: 'HS512 (HMAC)' },
    { value: 'RS256', label: 'RS256 (RSA)' },
    { value: 'RS384', label: 'RS384 (RSA)' },
    { value: 'RS512', label: 'RS512 (RSA)' },
    { value: 'ES256', label: 'ES256 (ECDSA)' },
    { value: 'ES384', label: 'ES384 (ECDSA)' },
    { value: 'ES512', label: 'ES512 (ECDSA)' },
  ];
