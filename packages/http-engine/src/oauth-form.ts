import type { OAuthClientConfig } from '@testrix/contracts';

export const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

function appendOptional(body: URLSearchParams, key: string, value: string): void {
  if (value.trim())
    body.set(key, value);
}

/** Device authorization request (RFC 8628). */
export function buildDeviceAuthorizationBody(config: OAuthClientConfig): URLSearchParams {
  const body = new URLSearchParams();
  body.set('client_id', config.clientId);
  appendOptional(body, 'scope', config.scope);
  appendOptional(body, 'audience', config.audience);
  return body;
}

/** Token endpoint form body for the supported grants. */
export function buildOAuthTokenBody(
  config: OAuthClientConfig,
  extra: Readonly<Record<string, string>> = {},
): URLSearchParams {
  const body = new URLSearchParams();
  if (config.grantType === 'authorization_code')
    body.set('grant_type', 'authorization_code');
  else if (config.grantType === 'client_credentials')
    body.set('grant_type', 'client_credentials');
  else if (config.grantType === 'password')
    body.set('grant_type', 'password');
  else
    body.set('grant_type', DEVICE_CODE_GRANT);

  body.set('client_id', config.clientId);
  appendOptional(body, 'client_secret', config.clientSecret);
  appendOptional(body, 'scope', config.scope);
  appendOptional(body, 'audience', config.audience);

  if (config.grantType === 'password') {
    body.set('username', config.username);
    body.set('password', config.password);
  }

  for (const [key, value] of Object.entries(extra)) {
    if (value !== '')
      body.set(key, value);
  }
  return body;
}

export function buildRefreshTokenBody(config: OAuthClientConfig): URLSearchParams {
  const body = new URLSearchParams();
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', config.refreshToken);
  body.set('client_id', config.clientId);
  appendOptional(body, 'client_secret', config.clientSecret);
  appendOptional(body, 'scope', config.scope);
  return body;
}

export function buildAuthorizeUrl(
  config: OAuthClientConfig,
  options: {
    readonly redirectUri: string;
    readonly state: string;
    readonly challenge?: string;
  },
): string {
  const url = new URL(config.authUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('state', options.state);
  if (config.scope.trim())
    url.searchParams.set('scope', config.scope);
  if (config.audience.trim())
    url.searchParams.set('audience', config.audience);
  if (options.challenge) {
    url.searchParams.set('code_challenge', options.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url.toString();
}
