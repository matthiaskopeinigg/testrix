import { app, session, type Session } from 'electron';

import { buildUpdaterProxyConfig } from '../../../shared/updater/updater-proxy-config';

import { parseProxyUrl } from '../http/node-http-request.client';
import { getMainSettings } from '../settings-runtime';

const UPDATER_PARTITION = 'persist:testrix-updater';

let appliedProxyKey = '';
let proxyLoginBound = false;

/**
 * Fetches a URL for the updater using Chromium networking.
 *
 * Node `fetch` ignores the Windows/macOS system proxy and Settings → HTTP → Proxy.
 * `session.fetch` uses a dedicated session that honors both.
 *
 * @param url Absolute HTTP(S) URL.
 * @param init Fetch headers, method, and redirect mode.
 */
export async function updaterNetFetch(url: string, init?: RequestInit): Promise<Response> {
  const ses = session.fromPartition(UPDATER_PARTITION);
  await configureUpdaterSessionProxy(ses);
  return ses.fetch(url, {
    method: init?.method,
    headers: headersToRecord(init?.headers),
    redirect: init?.redirect ?? 'follow',
    bypassCustomProtocolHandlers: true,
  });
}

async function configureUpdaterSessionProxy(ses: Session): Promise<void> {
  const proxy = getMainSettings().http.proxy;
  const config = buildUpdaterProxyConfig(proxy);
  const key = JSON.stringify(config);
  if (key !== appliedProxyKey) {
    appliedProxyKey = key;
    if (config.mode === 'system') {
      await ses.setProxy({ mode: 'system' });
    } else {
      await ses.setProxy({
        proxyRules: config.proxyRules,
        proxyBypassRules: config.proxyBypassRules,
      });
    }
  }

  bindProxyLoginOnce();
}

function bindProxyLoginOnce(): void {
  if (proxyLoginBound) {
    return;
  }
  proxyLoginBound = true;
  app.on('login', (event, _webContents, _details, authInfo, callback) => {
    if (!authInfo.isProxy) {
      return;
    }
    const creds = readProxyCredentials();
    if (!creds) {
      return;
    }
    event.preventDefault();
    callback(creds.user, creds.password);
  });
}

function readProxyCredentials(): { readonly user: string; readonly password: string } | null {
  const proxy = getMainSettings().http.proxy;
  if (!proxy.enabled) {
    return null;
  }
  const parsed =
    parseProxyUrl(proxy.httpsProxy.trim() || proxy.httpProxy.trim()) ??
    parseProxyUrl(proxy.httpProxy.trim());
  if (!parsed?.user) {
    return null;
  }
  return { user: parsed.user, password: parsed.password ?? '' };
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}
