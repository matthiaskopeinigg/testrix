import { BrowserWindow } from 'electron';
import * as http from 'node:http';
import { URL } from 'node:url';

import type { CollectionFolderAuth } from '../../../shared/config';
import { buildOAuthAuthorizeUrl, createPkceS256Pair } from '../../../shared/http/oauth-pkce';
import { ErrorCodes, TestrixError } from '../../../shared/errors';

import { secretVaultService } from '../config/secret-vault.service';

export interface OAuthTokenStatus {
  readonly ownerId: string;
  readonly hasAccessToken: boolean;
  readonly expiresAt: number | null;
  readonly expired: boolean;
}

interface StoredOAuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number | null;
  readonly tokenType: string;
}

function vaultKey(ownerId: string): string {
  return `oauth:${ownerId}`;
}

function parseStored(raw: string | undefined): StoredOAuthTokens | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as StoredOAuthTokens;
    if (!parsed.accessToken) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function isExpired(expiresAt: number | null, skewMs = 60_000): boolean {
  if (!expiresAt) {
    return false;
  }
  return Date.now() + skewMs >= expiresAt;
}

/**
 * OAuth2 token fetch/refresh with PKCE, storing tokens in the local vault.
 */
export class OAuthTokenService {
  async status(profileDir: string, ownerId: string): Promise<OAuthTokenStatus> {
    const stored = parseStored((await secretVaultService.load(profileDir))[vaultKey(ownerId)]);
    return {
      ownerId,
      hasAccessToken: Boolean(stored?.accessToken),
      expiresAt: stored?.expiresAt ?? null,
      expired: stored ? isExpired(stored.expiresAt) : true,
    };
  }

  async clear(profileDir: string, ownerId: string): Promise<void> {
    const secrets = { ...(await secretVaultService.load(profileDir)) };
    delete secrets[vaultKey(ownerId)];
    await secretVaultService.save(profileDir, secrets);
  }

  async ensureAccessToken(
    profileDir: string,
    ownerId: string,
    auth: CollectionFolderAuth,
    getMainWindow: () => BrowserWindow | null,
  ): Promise<string> {
    if (auth.type !== 'oauth2') {
      throw new TestrixError(ErrorCodes.HTTP_OAUTH_FAILED, 'Auth type is not OAuth2.');
    }
    const stored = parseStored((await secretVaultService.load(profileDir))[vaultKey(ownerId)]);
    if (stored && !isExpired(stored.expiresAt)) {
      return stored.accessToken;
    }
    if (stored?.refreshToken) {
      try {
        return await this.exchangeAndStore(profileDir, ownerId, auth, {
          grant_type: 'refresh_token',
          refresh_token: stored.refreshToken,
        });
      } catch {
        /* fall through to interactive grant */
      }
    }
    if (auth.grantType === 'client_credentials') {
      return this.exchangeAndStore(profileDir, ownerId, auth, {
        grant_type: 'client_credentials',
        scope: auth.scope,
      });
    }
    if (auth.grantType === 'password') {
      return this.exchangeAndStore(profileDir, ownerId, auth, {
        grant_type: 'password',
        username: auth.username ?? '',
        password: auth.password ?? '',
        scope: auth.scope,
      });
    }
    return this.authorizationCodeFlow(profileDir, ownerId, auth, getMainWindow);
  }

  private async authorizationCodeFlow(
    profileDir: string,
    ownerId: string,
    auth: Extract<CollectionFolderAuth, { type: 'oauth2' }>,
    getMainWindow: () => BrowserWindow | null,
  ): Promise<string> {
    const redirectUri = auth.redirectUri.trim() || 'http://127.0.0.1:9876/callback';
    const state = globalThis.crypto.randomUUID();
    const pkce = auth.usePkce !== false ? await createPkceS256Pair() : null;
    const authorizeUrl = buildOAuthAuthorizeUrl({
      authUrl: auth.authUrl,
      clientId: auth.clientId,
      redirectUri,
      scope: auth.scope,
      state,
      challenge: pkce?.challenge,
    });
    const code = await this.captureAuthCode(authorizeUrl, redirectUri, state, getMainWindow);
    const body: Record<string, string> = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: auth.clientId,
    };
    if (pkce) {
      body['code_verifier'] = pkce.verifier;
    }
    return this.exchangeAndStore(profileDir, ownerId, auth, body);
  }

  private async captureAuthCode(
    authorizeUrl: string,
    redirectUri: string,
    state: string,
    getMainWindow: () => BrowserWindow | null,
  ): Promise<string> {
    const redirect = new URL(redirectUri);
    const server = http.createServer();
    const code = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new TestrixError(ErrorCodes.HTTP_OAUTH_FAILED, 'OAuth sign-in timed out.'));
      }, 180_000);
      server.on('request', (req, res) => {
        try {
          const arrived = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);
          if (arrived.searchParams.get('state') !== state) {
            res.statusCode = 400;
            res.end('Invalid state');
            return;
          }
          const nextCode = arrived.searchParams.get('code');
          const error = arrived.searchParams.get('error');
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end('<p>You can close this window and return to Testrix.</p>');
          clearTimeout(timer);
          if (error || !nextCode) {
            reject(
              new TestrixError(
                ErrorCodes.HTTP_OAUTH_FAILED,
                error ? `OAuth provider error: ${error}` : 'Authorization code missing.',
              ),
            );
            return;
          }
          resolve(nextCode);
        } catch (err) {
          reject(err);
        }
      });
      const port = redirect.port ? Number(redirect.port) : 9876;
      server.listen(port, redirect.hostname === 'localhost' ? '127.0.0.1' : redirect.hostname);
      const parent = getMainWindow();
      const win = new BrowserWindow({
        width: 480,
        height: 720,
        parent: parent ?? undefined,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
      });
      void win.loadURL(authorizeUrl);
      win.on('closed', () => {
        clearTimeout(timer);
        reject(new TestrixError(ErrorCodes.HTTP_OAUTH_FAILED, 'OAuth window was closed.'));
      });
    }).finally(() => {
      server.close();
    });
    return code;
  }

  private async exchangeAndStore(
    profileDir: string,
    ownerId: string,
    auth: Extract<CollectionFolderAuth, { type: 'oauth2' }>,
    body: Record<string, string>,
  ): Promise<string> {
    if (!auth.tokenUrl.trim()) {
      throw new TestrixError(ErrorCodes.HTTP_OAUTH_FAILED, 'OAuth token URL is required.');
    }
    const params = new URLSearchParams(body);
    if (auth.clientId) {
      params.set('client_id', auth.clientId);
    }
    if (auth.clientSecret) {
      params.set('client_secret', auth.clientSecret);
    }
    let response: Response;
    try {
      response = await fetch(auth.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: params.toString(),
      });
    } catch (error) {
      throw new TestrixError(ErrorCodes.HTTP_OAUTH_FAILED, 'Could not reach the OAuth token endpoint.', {
        cause: error,
      });
    }
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || typeof json['access_token'] !== 'string') {
      const description =
        typeof json['error_description'] === 'string'
          ? json['error_description']
          : `Token endpoint returned ${response.status}.`;
      throw new TestrixError(ErrorCodes.HTTP_OAUTH_FAILED, description);
    }
    const expiresIn = typeof json['expires_in'] === 'number' ? json['expires_in'] : null;
    const stored: StoredOAuthTokens = {
      accessToken: json['access_token'],
      refreshToken: typeof json['refresh_token'] === 'string' ? json['refresh_token'] : '',
      expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : null,
      tokenType: typeof json['token_type'] === 'string' ? json['token_type'] : auth.tokenType || 'Bearer',
    };
    const secrets = { ...(await secretVaultService.load(profileDir)) };
    secrets[vaultKey(ownerId)] = JSON.stringify(stored);
    await secretVaultService.save(profileDir, secrets);
    return stored.accessToken;
  }
}

export const oauthTokenService = new OAuthTokenService();
