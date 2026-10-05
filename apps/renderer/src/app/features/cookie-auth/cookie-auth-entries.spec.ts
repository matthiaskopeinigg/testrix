import { describe, expect, it } from 'vitest';

import {
  clearedAuthSecrets,
  collectAuthEntries,
  filterJarCookies,
  isCookieExpired,
  maskSecret,
} from './cookie-auth-entries';

describe('cookie-auth-entries', () => {
  it('detects expired cookies', () => {
    expect(isCookieExpired('', new Date('2026-01-01T00:00:00Z'))).toBe(false);
    expect(isCookieExpired('2025-01-01T00:00:00Z', new Date('2026-01-01T00:00:00Z'))).toBe(true);
    expect(isCookieExpired('2027-01-01T00:00:00Z', new Date('2026-01-01T00:00:00Z'))).toBe(false);
  });

  it('filters jar cookies by query and flags', () => {
    const cookies = [
      {
        id: '1',
        enabled: true,
        name: 'session',
        value: 'abc',
        domain: 'api.example.com',
        path: '/',
        expires: '2025-01-01T00:00:00Z',
        secure: false,
        httpOnly: false,
      },
      {
        id: '2',
        enabled: false,
        name: 'theme',
        value: 'dark',
        domain: 'example.com',
        path: '/',
        expires: '',
        secure: false,
        httpOnly: false,
      },
    ];
    const now = new Date('2026-06-01T00:00:00Z');
    expect(filterJarCookies(cookies, { query: 'session', enabledOnly: false, expiredOnly: false, domain: '' }, now)).toHaveLength(1);
    expect(filterJarCookies(cookies, { query: '', enabledOnly: true, expiredOnly: false, domain: '' }, now)).toHaveLength(1);
    expect(filterJarCookies(cookies, { query: '', enabledOnly: false, expiredOnly: true, domain: '' }, now)).toHaveLength(1);
    expect(filterJarCookies(cookies, { query: '', enabledOnly: false, expiredOnly: false, domain: 'api' }, now)).toHaveLength(1);
  });

  it('collects auth from folders and requests with override auth', () => {
    const entries = collectAuthEntries([
      {
        id: 'f1',
        kind: 'folder',
        name: 'API',
        children: [
          {
            id: 'r1',
            kind: 'http',
            name: 'Login',
            method: 'POST',
            status: null,
            config: {
              url: '',
              authMode: 'bearer',
              auth: {
                type: 'bearer',
                token: 'tok',
                username: '',
                password: '',
                realm: '',
                apiKey: '',
                apiKeyHeader: 'X-Api-Key',
                apiKeyIn: 'header',
                grantType: 'authorization_code',
                pkce: true,
                codeChallengeMethod: 'S256',
                authUrl: '',
                tokenUrl: '',
                deviceAuthUrl: '',
                clientId: '',
                clientSecret: '',
                scope: '',
                audience: '',
                redirectUri: '',
                accessToken: '',
                refreshToken: '',
                tokenType: 'Bearer',
                expiresAt: '',
              },
            },
          },
        ],
        config: {
          auth: {
            type: 'oauth2',
            token: '',
            username: '',
            password: '',
            realm: '',
            apiKey: '',
            apiKeyHeader: 'X-Api-Key',
            apiKeyIn: 'header',
            grantType: 'authorization_code',
            pkce: true,
            codeChallengeMethod: 'S256',
            authUrl: '',
            tokenUrl: '',
            deviceAuthUrl: '',
            clientId: '',
            clientSecret: '',
            scope: '',
            audience: '',
            redirectUri: '',
            accessToken: 'a',
            refreshToken: '',
            tokenType: 'Bearer',
            expiresAt: '2020-01-01T00:00:00Z',
          },
        },
      },
    ] as never);
    expect(entries.map((entry) => entry.authType)).toEqual(['oauth2', 'bearer']);
    expect(entries[0]?.path).toBe('API');
    expect(entries[0]?.isExpired).toBe(true);
    expect(entries[1]?.path).toBe('API › Login');
  });

  it('clears secrets without dropping auth type', () => {
    const cleared = clearedAuthSecrets({
      type: 'oauth2',
      token: 't',
      username: 'u',
      password: 'p',
      realm: '',
      apiKey: 'k',
      apiKeyHeader: 'X-Api-Key',
      apiKeyIn: 'header',
      grantType: 'authorization_code',
      pkce: true,
      codeChallengeMethod: 'S256',
      authUrl: 'https://auth',
      tokenUrl: 'https://token',
      deviceAuthUrl: '',
      clientId: 'cid',
      clientSecret: 'sec',
      scope: 'openid',
      audience: '',
      redirectUri: '',
      accessToken: 'at',
      refreshToken: 'rt',
      tokenType: 'Bearer',
      expiresAt: '2026-01-01T00:00:00Z',
    });
    expect(cleared.type).toBe('oauth2');
    expect(cleared.clientId).toBe('cid');
    expect(cleared.authUrl).toBe('https://auth');
    expect(cleared.token).toBe('');
    expect(cleared.password).toBe('');
    expect(cleared.apiKey).toBe('');
    expect(cleared.clientSecret).toBe('');
    expect(cleared.accessToken).toBe('');
    expect(cleared.refreshToken).toBe('');
    expect(cleared.expiresAt).toBe('');
  });

  it('masks secrets until revealed', () => {
    expect(maskSecret('secret', false)).toBe('••••••••');
    expect(maskSecret('secret', true)).toBe('secret');
    expect(maskSecret('', false)).toBe('');
  });
});
