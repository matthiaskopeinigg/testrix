import { describe, expect, it } from 'vitest';

import { applyCollectionRequestAuth } from './resolve-collection-request-auth';

describe('applyCollectionRequestAuth oauth2', () => {
  it('sets a Bearer header from the runtime access token', () => {
    const headers: Record<string, string> = {};
    applyCollectionRequestAuth(
      {
        type: 'oauth2',
        grantType: 'client_credentials',
        authUrl: '',
        tokenUrl: 'https://token.example',
        clientId: 'id',
        clientSecret: '',
        scope: '',
        redirectUri: '',
        usePkce: true,
        tokenType: 'Bearer',
        username: '',
        password: '',
      },
      headers,
      'https://api.example',
      'tok-1',
    );
    expect(headers['Authorization']).toBe('Bearer tok-1');
  });
});
