import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Agent, ProxyAgent, fetch, type Dispatcher } from 'undici';
import {
  expiryFromExpiresIn,
  oauthClientConfigSchema,
  type OAuthClientConfig,
  type OAuthDeviceStartResult,
  type OAuthTokenResult,
} from '@testrix/contracts';

import {
  buildAuthorizeUrl,
  buildDeviceAuthorizationBody,
  buildOAuthTokenBody,
  buildRefreshTokenBody,
  DEVICE_CODE_GRANT,
} from './oauth-form';
import { generateOAuthState, generatePkce } from './pkce';

const AUTHORIZE_TIMEOUT_MS = 5 * 60 * 1000;

function dispatcherFor(config: OAuthClientConfig): Dispatcher | undefined {
  const connect = { rejectUnauthorized: config.verifyTls };
  const proxy = config.proxy;
  if (proxy && proxy.mode === 'http' && proxy.host.trim()) {
    const auth = proxy.username
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
      : '';
    return new ProxyAgent({
      uri: `http://${auth}${proxy.host.trim()}:${proxy.port.trim() || '80'}`,
      requestTls: connect,
    });
  }
  if (!config.verifyTls)
    return new Agent({ connect });
  return undefined;
}

function fail(error: string): OAuthTokenResult {
  return {
    ok: false,
    error,
    accessToken: '',
    refreshToken: '',
    tokenType: 'Bearer',
    expiresAt: '',
  };
}

export function parseOAuthTokenPayload(raw: unknown, previousRefresh = ''): OAuthTokenResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    return fail('Token response was not JSON.');
  const data = raw as Record<string, unknown>;
  if (typeof data['error'] === 'string' && data['error']) {
    const description = typeof data['error_description'] === 'string' ? data['error_description'] : data['error'];
    return fail(description);
  }
  const accessToken = typeof data['access_token'] === 'string' ? data['access_token'] : '';
  if (!accessToken)
    return fail('Token response did not include access_token.');
  const expiresIn = typeof data['expires_in'] === 'number' ? data['expires_in'] : Number(data['expires_in'] ?? 0);
  return {
    ok: true,
    error: null,
    accessToken,
    refreshToken: typeof data['refresh_token'] === 'string' ? data['refresh_token'] : previousRefresh,
    tokenType: typeof data['token_type'] === 'string' && data['token_type'] ? data['token_type'] : 'Bearer',
    expiresAt: expiryFromExpiresIn(Number.isFinite(expiresIn) ? expiresIn : 0),
  };
}

async function postForm(
  url: string,
  body: URLSearchParams,
  config: OAuthClientConfig,
): Promise<{ status: number; json: unknown; text: string }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
    dispatcher: dispatcherFor(config),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

export async function requestOAuthToken(
  config: OAuthClientConfig,
  extra: Readonly<Record<string, string>> = {},
): Promise<OAuthTokenResult> {
  const parsed = oauthClientConfigSchema.safeParse(config);
  const next = parsed.success ? parsed.data : config;
  if (!next.tokenUrl.trim())
    return fail('Token URL is required.');
  try {
    const posted = await postForm(next.tokenUrl, buildOAuthTokenBody(next, extra), next);
    if (posted.json)
      return parseOAuthTokenPayload(posted.json, next.refreshToken);
    return fail(posted.text.trim() || `Token endpoint returned ${posted.status}.`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Token request failed.');
  }
}

export async function refreshOAuthToken(config: OAuthClientConfig): Promise<OAuthTokenResult> {
  const parsed = oauthClientConfigSchema.safeParse(config);
  const next = parsed.success ? parsed.data : config;
  if (!next.tokenUrl.trim())
    return fail('Token URL is required.');
  if (!next.refreshToken.trim())
    return fail('No refresh token is stored.');
  try {
    const posted = await postForm(next.tokenUrl, buildRefreshTokenBody(next), next);
    if (posted.json)
      return parseOAuthTokenPayload(posted.json, next.refreshToken);
    return fail(posted.text.trim() || `Token endpoint returned ${posted.status}.`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Refresh request failed.');
  }
}

export interface DeviceAuthorizationState {
  readonly deviceCode: string;
  readonly interval: number;
  readonly expiresAt: number;
  cancelled: boolean;
}

export async function startDeviceAuthorization(
  config: OAuthClientConfig,
): Promise<{ result: OAuthDeviceStartResult; state: DeviceAuthorizationState | null }> {
  const parsed = oauthClientConfigSchema.safeParse(config);
  const next = parsed.success ? parsed.data : config;
  const empty = {
    ok: false,
    error: 'Device authorization URL is required.',
    sessionId: '',
    userCode: '',
    verificationUri: '',
    verificationUriComplete: '',
    interval: 5,
    expiresIn: 0,
  };
  if (!next.deviceAuthUrl.trim())
    return { result: empty, state: null };
  try {
    const posted = await postForm(next.deviceAuthUrl, buildDeviceAuthorizationBody(next), next);
    const data = posted.json && typeof posted.json === 'object' ? (posted.json as Record<string, unknown>) : null;
    if (!data || typeof data['device_code'] !== 'string' || typeof data['user_code'] !== 'string') {
      const error = data && typeof data['error_description'] === 'string'
        ? data['error_description']
        : posted.text.trim() || 'Device authorization failed.';
      return { result: { ...empty, error }, state: null };
    }
    const interval = typeof data['interval'] === 'number' ? data['interval'] : 5;
    const expiresIn = typeof data['expires_in'] === 'number' ? data['expires_in'] : 900;
    return {
      result: {
        ok: true,
        error: null,
        sessionId: '',
        userCode: data['user_code'],
        verificationUri: typeof data['verification_uri'] === 'string' ? data['verification_uri'] : '',
        verificationUriComplete:
          typeof data['verification_uri_complete'] === 'string' ? data['verification_uri_complete'] : '',
        interval,
        expiresIn,
      },
      state: {
        deviceCode: data['device_code'],
        interval,
        expiresAt: Date.now() + expiresIn * 1000,
        cancelled: false,
      },
    };
  } catch (error) {
    return {
      result: { ...empty, error: error instanceof Error ? error.message : 'Device authorization failed.' },
      state: null,
    };
  }
}

export async function pollDeviceAuthorization(
  config: OAuthClientConfig,
  state: DeviceAuthorizationState,
): Promise<OAuthTokenResult & { pending: boolean; cancelled: boolean }> {
  if (state.cancelled)
    return { ...fail('Device authorization was cancelled.'), pending: false, cancelled: true };
  if (Date.now() > state.expiresAt)
    return { ...fail('Device code expired.'), pending: false, cancelled: false };
  const result = await requestOAuthToken(
    { ...config, grantType: 'device_code' },
    { grant_type: DEVICE_CODE_GRANT, device_code: state.deviceCode },
  );
  if (result.ok)
    return { ...result, pending: false, cancelled: false };
  const pending = /authorization_pending|slow_down/i.test(result.error ?? '');
  return { ...result, error: pending ? null : result.error, pending, cancelled: false };
}

function htmlPage(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Segoe UI,sans-serif;background:#111;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}main{max-width:28rem;padding:2rem}</style>
</head><body><main>${body}</main></body></html>`;
}

function sendHtml(res: ServerResponse, status: number, title: string, body: string): void {
  const html = htmlPage(title, body);
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

export async function authorizeWithLoopback(
  config: OAuthClientConfig,
  openExternal: (url: string) => Promise<void>,
): Promise<OAuthTokenResult> {
  const parsed = oauthClientConfigSchema.safeParse(config);
  const next = parsed.success ? parsed.data : config;
  if (!next.authUrl.trim() || !next.tokenUrl.trim())
    return fail('Authorization URL and token URL are required.');
  if (!next.clientId.trim())
    return fail('Client ID is required.');

  const pkce = next.pkce ? generatePkce() : null;
  const state = generateOAuthState();

  return await new Promise<OAuthTokenResult>((resolve) => {
    let redirectUri = next.redirectUri.trim();
    let settled = false;
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const host = req.headers.host ?? '127.0.0.1';
      let requestUrl: URL;
      try {
        requestUrl = new URL(req.url ?? '/', `http://${host}`);
      } catch {
        sendHtml(res, 400, 'Invalid request', '<p>The redirect could not be parsed.</p>');
        return;
      }
      const error = requestUrl.searchParams.get('error');
      const code = requestUrl.searchParams.get('code');
      const returnedState = requestUrl.searchParams.get('state');
      if (error) {
        sendHtml(res, 400, 'Authorization failed', `<p>${error}</p>`);
        finish(fail(requestUrl.searchParams.get('error_description') || error));
        return;
      }
      if (!code || returnedState !== state) {
        sendHtml(res, 400, 'Authorization failed', '<p>Missing code or mismatched state.</p>');
        finish(fail('Authorization redirect was missing a code or state.'));
        return;
      }
      sendHtml(res, 200, 'Testrix', '<p>You can return to Testrix. This window can be closed.</p>');
      const extra: Record<string, string> = {
        code,
        redirect_uri: redirectUri,
      };
      if (pkce)
        extra['code_verifier'] = pkce.verifier;
      void requestOAuthToken({ ...next, grantType: 'authorization_code' }, extra).then(finish);
    });

    const finish = (result: OAuthTokenResult): void => {
      if (settled)
        return;
      settled = true;
      clearTimeout(timer);
      server.close();
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish(fail('Authorization timed out.'));
    }, AUTHORIZE_TIMEOUT_MS);

    server.listen(0, '127.0.0.1', () => {
      const port = addressPort(server);
      redirectUri = `http://127.0.0.1:${port}/callback`;
      const authorizeUrl = buildAuthorizeUrl(next, {
        redirectUri,
        state,
        challenge: pkce?.challenge,
      });
      void openExternal(authorizeUrl).catch((error: unknown) => {
        finish(fail(error instanceof Error ? error.message : 'Could not open the system browser.'));
      });
    });
  });
}

function addressPort(server: ReturnType<typeof createServer>): number {
  const address = server.address();
  return address && typeof address === 'object' ? address.port : 0;
}
