import { createHash, randomBytes } from 'node:crypto';

function base64Url(bytes: Buffer): string {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** RFC 7636 code_verifier (43–128 chars). */
export function generatePkceVerifier(): string {
  return base64Url(randomBytes(32));
}

/** S256 code_challenge for a verifier. */
export function pkceChallengeS256(verifier: string): string {
  return base64Url(createHash('sha256').update(verifier).digest());
}

export function generatePkce(): { readonly verifier: string; readonly challenge: string; readonly method: 'S256' } {
  const verifier = generatePkceVerifier();
  return { verifier, challenge: pkceChallengeS256(verifier), method: 'S256' };
}

export function generateOAuthState(): string {
  return base64Url(randomBytes(16));
}
