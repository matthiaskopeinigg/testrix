function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const g = globalThis as {
    btoa?: (s: string) => string;
    Buffer?: { from(data: Uint8Array): { toString(enc: string): string } };
  };
  const b64 =
    typeof g.btoa === 'function'
      ? g.btoa(binary)
      : (g.Buffer?.from(bytes).toString('base64') ?? '');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Creates a PKCE S256 verifier and challenge pair.
 */
export async function createPkceS256Pair(): Promise<{
  readonly verifier: string;
  readonly challenge: string;
}> {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  const verifier = toBase64Url(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: toBase64Url(new Uint8Array(digest)) };
}

/**
 * Builds the authorization-code URL for an OAuth2 IdP.
 */
export function buildOAuthAuthorizeUrl(input: {
  readonly authUrl: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scope: string;
  readonly state: string;
  readonly challenge?: string;
}): string {
  const url = new URL(input.authUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  if (input.scope.trim()) {
    url.searchParams.set('scope', input.scope.trim());
  }
  url.searchParams.set('state', input.state);
  if (input.challenge) {
    url.searchParams.set('code_challenge', input.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}
