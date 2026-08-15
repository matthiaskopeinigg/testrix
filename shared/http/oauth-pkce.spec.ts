import { describe, expect, it } from 'vitest';

import { buildOAuthAuthorizeUrl, createPkceS256Pair } from './oauth-pkce';

describe('createPkceS256Pair', () => {
  it('returns a verifier and S256 challenge', async () => {
    const pair = await createPkceS256Pair();
    expect(pair.verifier.length).toBeGreaterThan(20);
    expect(pair.challenge.length).toBeGreaterThan(20);
    expect(pair.verifier).not.toContain('+');
    expect(pair.challenge).not.toContain('+');
  });
});

describe('buildOAuthAuthorizeUrl', () => {
  it('includes PKCE challenge parameters when provided', () => {
    const url = buildOAuthAuthorizeUrl({
      authUrl: 'https://idp.example/authorize',
      clientId: 'client-1',
      redirectUri: 'http://127.0.0.1:9876/callback',
      scope: 'openid profile',
      state: 'state-1',
      challenge: 'abc',
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('client_id')).toBe('client-1');
    expect(parsed.searchParams.get('code_challenge')).toBe('abc');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('scope')).toBe('openid profile');
  });
});
