import * as jose from 'jose';

import type { JwtAlgorithm } from '@shared/config';

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
  readonly kid: string | null;
  readonly expiresAt: string | null;
  readonly issuedAt: string | null;
  readonly notBefore: string | null;
  readonly expired: boolean;
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

function isExpired(exp: unknown): boolean {
  return typeof exp === 'number' && Number.isFinite(exp) && exp * 1000 < Date.now();
}

/** Decodes a JWT header and payload without verifying the signature. */
export function decodeJwt(token: string): JwtDecodeResult {
  const trimmed = token.trim();
  if (!trimmed) {
    return {
      headerJson: '',
      payloadJson: '',
      algorithm: null,
      kid: null,
      expiresAt: null,
      issuedAt: null,
      notBefore: null,
      expired: false,
      error: null,
    };
  }

  try {
    const header = jose.decodeProtectedHeader(trimmed) as Record<string, unknown>;
    const payload = jose.decodeJwt(trimmed) as Record<string, unknown>;
    return {
      headerJson: JSON.stringify(header, null, 2),
      payloadJson: JSON.stringify(payload, null, 2),
      algorithm: typeof header['alg'] === 'string' ? header['alg'] : null,
      kid: typeof header['kid'] === 'string' ? header['kid'] : null,
      expiresAt: formatClaimEpoch(payload['exp']),
      issuedAt: formatClaimEpoch(payload['iat']),
      notBefore: formatClaimEpoch(payload['nbf']),
      expired: isExpired(payload['exp']),
      error: null,
    };
  } catch {
    return {
      headerJson: '',
      payloadJson: '',
      algorithm: null,
      kid: null,
      expiresAt: null,
      issuedAt: null,
      notBefore: null,
      expired: false,
      error: 'Could not decode JWT. Check that the token is valid.',
    };
  }
}

export interface JwtGenerateInput {
  readonly alg: JwtAlgorithm;
  readonly secretMaterial: string;
  readonly payload: Record<string, unknown>;
  readonly typ?: string;
  readonly kid?: string;
}

export interface JwtGenerateResult {
  readonly token: string;
  readonly error: string | null;
}

export interface JwtValidateOptions {
  readonly alg: JwtAlgorithm;
  readonly secretMaterial: string;
  readonly clockToleranceSec?: number;
  readonly issuer?: string | string[];
  readonly audience?: string | string[];
  readonly requiredClaims?: readonly string[];
}

export interface JwtValidateIssue {
  readonly code: 'signature' | 'claim' | 'key' | 'token';
  readonly message: string;
}

export interface JwtValidateResult {
  readonly valid: boolean;
  readonly issues: readonly JwtValidateIssue[];
  readonly payload: Record<string, unknown> | null;
}

function isHsAlg(alg: string): boolean {
  return alg.startsWith('HS');
}

function hsHashName(alg: JwtAlgorithm): AlgorithmIdentifier {
  if (alg === 'HS384') {
    return 'SHA-384';
  }
  if (alg === 'HS512') {
    return 'SHA-512';
  }
  return 'SHA-256';
}

async function importHsCryptoKey(
  secret: string,
  alg: JwtAlgorithm,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: hsHashName(alg) },
    false,
    usages,
  );
}

function parseAudienceList(aud: string | string[] | undefined): string | string[] | undefined {
  if (aud === undefined) {
    return undefined;
  }
  if (Array.isArray(aud)) {
    const cleaned = aud.map((a) => a.trim()).filter(Boolean);
    return cleaned.length === 0 ? undefined : cleaned.length === 1 ? cleaned[0] : cleaned;
  }
  const parts = aud
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }
  return parts.length === 1 ? parts[0] : parts;
}

async function importKeyMaterial(
  alg: JwtAlgorithm,
  secretMaterial: string,
  purpose: 'sign' | 'verify',
): Promise<CryptoKey | Uint8Array> {
  const material = secretMaterial.trim();
  if (!material) {
    throw new Error(purpose === 'sign' ? 'Signing key or secret is empty.' : 'Verification key or secret is empty.');
  }

  if (isHsAlg(alg)) {
    return importHsCryptoKey(material, alg, purpose === 'sign' ? ['sign'] : ['verify']);
  }

  if (material.startsWith('{')) {
    const jwk = JSON.parse(material) as jose.JWK;
    return jose.importJWK(jwk, alg);
  }

  if (material.includes('BEGIN PUBLIC KEY') || material.includes('BEGIN RSA PUBLIC KEY')) {
    if (purpose === 'sign') {
      throw new Error('A private key is required to sign. Provide a PKCS#8 private key or JWK.');
    }
    return jose.importSPKI(material, alg);
  }

  if (material.includes('BEGIN PRIVATE KEY')) {
    return jose.importPKCS8(material, alg);
  }

  if (material.includes('BEGIN RSA PRIVATE KEY') || material.includes('BEGIN EC PRIVATE KEY')) {
    throw new Error(
      'PKCS#1 PEM is not supported. Convert to PKCS#8 (BEGIN PRIVATE KEY) or use a JWK.',
    );
  }

  throw new Error('Unrecognized key format. Use a PEM key (PKCS#8 / SPKI), JWK JSON, or HMAC secret.');
}

/** Signs a JWT with the given algorithm and key material. */
export async function generateJwt(input: JwtGenerateInput): Promise<JwtGenerateResult> {
  try {
    const key = await importKeyMaterial(input.alg, input.secretMaterial, 'sign');
    const header: jose.JWTHeaderParameters = {
      alg: input.alg,
      typ: input.typ?.trim() || 'JWT',
    };
    if (input.kid?.trim()) {
      header.kid = input.kid.trim();
    }

    // Copy into a fresh Uint8Array so `instanceof` checks succeed under jsdom/Vitest.
    const payloadBytes = Uint8Array.from(
      new TextEncoder().encode(JSON.stringify(input.payload)),
    );
    const token = await new jose.CompactSign(payloadBytes).setProtectedHeader(header).sign(key);

    return { token, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not generate JWT.';
    return { token: '', error: message };
  }
}

/** Verifies signature and optional claim constraints. */
export async function validateJwt(
  token: string,
  options: JwtValidateOptions,
): Promise<JwtValidateResult> {
  const trimmed = token.trim();
  if (!trimmed) {
    return {
      valid: false,
      issues: [{ code: 'token', message: 'Enter a JWT to validate.' }],
      payload: null,
    };
  }

  let key: CryptoKey | Uint8Array;
  try {
    key = await importKeyMaterial(options.alg, options.secretMaterial, 'verify');
  } catch (err) {
    return {
      valid: false,
      issues: [
        {
          code: 'key',
          message: err instanceof Error ? err.message : 'Could not load verification key.',
        },
      ],
      payload: null,
    };
  }

  const issues: JwtValidateIssue[] = [];
  const verifyOpts: jose.JWTVerifyOptions = {
    algorithms: [options.alg],
    clockTolerance: options.clockToleranceSec ?? 0,
  };

  const issuer = parseAudienceList(
    typeof options.issuer === 'string' ? options.issuer : options.issuer,
  );
  if (issuer !== undefined) {
    verifyOpts.issuer = issuer;
  }
  const audience = parseAudienceList(options.audience);
  if (audience !== undefined) {
    verifyOpts.audience = audience;
  }
  if (options.requiredClaims?.length) {
    verifyOpts.requiredClaims = [...options.requiredClaims];
  }

  try {
    const result = await jose.jwtVerify(trimmed, key, verifyOpts);
    return {
      valid: true,
      issues: [],
      payload: result.payload as Record<string, unknown>,
    };
  } catch (err) {
    if (err instanceof jose.errors.JWTExpired) {
      issues.push({ code: 'claim', message: err.message || 'Token has expired (exp).' });
    } else if (err instanceof jose.errors.JWTClaimValidationFailed) {
      issues.push({ code: 'claim', message: err.message || 'Claim validation failed.' });
    } else if (err instanceof jose.errors.JWSSignatureVerificationFailed) {
      issues.push({ code: 'signature', message: 'Signature does not match the provided key.' });
    } else if (err instanceof jose.errors.JOSEAlgNotAllowed) {
      issues.push({
        code: 'signature',
        message: `Algorithm not allowed. Expected ${options.alg}.`,
      });
    } else {
      const message = err instanceof Error ? err.message : 'Validation failed.';
      const looksLikeSig =
        /signature|compact jws|invalid jws/i.test(message) &&
        !/claim|exp|nbf|iat|aud|iss/i.test(message);
      issues.push({
        code: looksLikeSig ? 'signature' : 'claim',
        message,
      });
    }
    return { valid: false, issues, payload: null };
  }
}

/** @deprecated Use {@link generateJwt}. */
export async function encodeJwtHs256(
  headerJson: string,
  payloadJson: string,
  secret: string,
): Promise<{ readonly token: string; readonly error: string | null }> {
  try {
    const header = JSON.parse(headerJson) as Record<string, unknown>;
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    const alg = (typeof header['alg'] === 'string' ? header['alg'] : 'HS256') as JwtAlgorithm;
    return generateJwt({
      alg,
      secretMaterial: secret,
      payload,
      typ: typeof header['typ'] === 'string' ? header['typ'] : 'JWT',
      kid: typeof header['kid'] === 'string' ? header['kid'] : undefined,
    });
  } catch {
    return { token: '', error: 'Header and payload must be valid JSON.' };
  }
}

/** @deprecated Use {@link validateJwt}. */
export async function verifyJwtHs256(
  token: string,
  secret: string,
): Promise<{ readonly valid: boolean; readonly error: string | null }> {
  const result = await validateJwt(token, { alg: 'HS256', secretMaterial: secret });
  return {
    valid: result.valid,
    error: result.issues[0]?.message ?? null,
  };
}
