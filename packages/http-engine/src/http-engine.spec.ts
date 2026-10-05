import { describe, expect, it } from 'vitest';

import { gzipSync, deflateSync } from 'node:zlib';

import { generatePkce, pkceChallengeS256 } from './pkce';
import { buildDeviceAuthorizationBody, buildOAuthTokenBody, DEVICE_CODE_GRANT } from './oauth-form';
import { parseOAuthTokenPayload } from './oauth';
import { parseSetCookie } from './cookies';
import { parseDigestChallenge } from './digest';
import { decodeHttpBody } from './decode-body';
import { isUnresolvedHostnameError } from './host-error';
import { isRedirectStatus, redirectHop, redirectMethod, resolveRedirectUrl } from './redirects';
import { runCollectionScript } from './scripts';

describe('pkceChallengeS256', () => {
  it('returns a url-safe S256 challenge', () => {
    const { verifier, challenge, method } = generatePkce();
    expect(method).toBe('S256');
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toBe(pkceChallengeS256(verifier));
    expect(challenge).not.toMatch(/[+/=]/);
  });
});

describe('OAuth grant payloads', () => {
  const config = {
    grantType: 'device_code' as const,
    pkce: true,
    authUrl: '',
    tokenUrl: 'https://idp.example/token',
    deviceAuthUrl: 'https://idp.example/device',
    clientId: 'client-1',
    clientSecret: 'secret',
    scope: 'openid',
    audience: '',
    redirectUri: '',
    username: '',
    password: '',
    refreshToken: '',
    verifyTls: true,
    timeoutMs: 30000,
  };

  it('builds the RFC 8628 device-code grant body', () => {
    const body = buildOAuthTokenBody(config, { device_code: 'dc-1' });
    expect(body.get('grant_type')).toBe(DEVICE_CODE_GRANT);
    expect(body.get('device_code')).toBe('dc-1');
    expect(body.get('client_id')).toBe('client-1');
    expect(body.get('scope')).toBe('openid');
  });

  it('builds the device authorization request', () => {
    const body = buildDeviceAuthorizationBody(config);
    expect(body.get('client_id')).toBe('client-1');
    expect(body.get('scope')).toBe('openid');
  });

  it('parses a token JSON payload', () => {
    const parsed = parseOAuthTokenPayload({
      access_token: 'at',
      refresh_token: 'rt',
      token_type: 'Bearer',
      expires_in: 3600,
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.accessToken).toBe('at');
    expect(parsed.refreshToken).toBe('rt');
    expect(parsed.expiresAt).toBeTruthy();
  });
});

describe('digest challenge', () => {
  it('parses WWW-Authenticate Digest', () => {
    const parsed = parseDigestChallenge(
      'Digest realm="api", nonce="abc", qop="auth", opaque="z", algorithm=MD5',
    );
    expect(parsed).toMatchObject({ realm: 'api', nonce: 'abc', qop: 'auth', opaque: 'z' });
  });
});

function scriptState(patch: Partial<Parameters<typeof runCollectionScript>[1]> = {}) {
  return {
    method: 'GET',
    url: 'https://api.local',
    headers: [],
    body: '',
    cookies: [],
    variables: {},
    status: 0,
    statusText: '',
    ...patch,
  };
}

describe('collection scripts', () => {
  it('mutates request headers through tx', () => {
    const next = runCollectionScript(`tx.request.headers.push({ key: 'X-Script', value: '1' });`, scriptState());
    expect(next.headers).toEqual([{ key: 'X-Script', value: '1' }]);
  });

  it('sets variables and reads JSON via the Postman-shaped pm alias', () => {
    const next = runCollectionScript(
      `pm.variables.set('id', pm.response.json().id); pm.test('ok', () => {});`,
      scriptState({ body: '{"id":"42"}', status: 200, statusText: 'OK' }),
    );
    expect(next.variables.id).toBe('42');
  });
});

describe('isUnresolvedHostnameError', () => {
  it('detects nested getaddrinfo failures', () => {
    const nested = new Error('fetch failed');
    nested.cause = Object.assign(new Error('getaddrinfo ENOTFOUND example.com'), { code: 'ENOTFOUND' });
    expect(isUnresolvedHostnameError(nested)).toBe(true);
    expect(isUnresolvedHostnameError(new Error('ECONNREFUSED'))).toBe(false);
  });
});

describe('parseSetCookie', () => {
  it('reads domain, path, flags, and max-age', () => {
    const parsed = parseSetCookie(
      'sid=abc; Path=/app; Domain=example.com; Secure; HttpOnly; Max-Age=60',
      'fallback.test',
    );
    expect(parsed).toMatchObject({
      name: 'sid',
      value: 'abc',
      domain: 'example.com',
      path: '/app',
      secure: true,
      httpOnly: true,
    });
    expect(parsed?.expires).toBeTruthy();
  });
});

describe('redirect helpers', () => {
  it('resolves relative Location headers', () => {
    expect(isRedirectStatus(301)).toBe(true);
    expect(isRedirectStatus(200)).toBe(false);
    expect(redirectMethod(303, 'POST')).toBe('GET');
    expect(redirectMethod(307, 'POST')).toBe('POST');
    expect(resolveRedirectUrl('https://example.com/a', '/b')).toBe('https://example.com/b');
    expect(redirectHop(301, 'https://example.com/a', 'https://example.com/b', 12)).toEqual({
      status: 301,
      url: 'https://example.com/a',
      location: 'https://example.com/b',
      durationMs: 12,
    });
  });
});

describe('decodeHttpBody', () => {
  it('inflates gzip HTML', () => {
    const html = '<!doctype html><html><body>Hello</body></html>';
    const body = decodeHttpBody(gzipSync(html), [
      { key: 'Content-Type', value: 'text/html; charset=utf-8' },
      { key: 'Content-Encoding', value: 'gzip' },
    ]);
    expect(body).toBe(html);
  });

  it('inflates gzip from magic bytes when Content-Encoding is missing', () => {
    const html = '<html><body>Hi</body></html>';
    expect(decodeHttpBody(gzipSync(html), [{ key: 'Content-Type', value: 'text/html' }])).toBe(html);
  });

  it('inflates deflate payloads', () => {
    const html = '<html>deflate</html>';
    const body = decodeHttpBody(deflateSync(html), [
      { key: 'Content-Encoding', value: 'deflate' },
    ]);
    expect(body).toBe(html);
  });

  it('reads charset from a meta tag', () => {
    const html = '<html><head><meta charset="utf-8"></head><body>café</body></html>';
    expect(decodeHttpBody(Buffer.from(html, 'utf8'), [{ key: 'Content-Type', value: 'text/html' }])).toBe(html);
  });
});
