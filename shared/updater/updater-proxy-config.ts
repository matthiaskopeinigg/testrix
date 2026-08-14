import type { HttpProxySettings } from '../config';

/** Chromium session proxy for updater GitHub requests. */
export type UpdaterProxyConfig =
  | { readonly mode: 'system' }
  | {
      readonly mode: 'fixed_servers';
      readonly proxyRules: string;
      readonly proxyBypassRules: string;
    };

/**
 * Maps Settings → HTTP → Proxy onto Chromium `session.setProxy` options.
 *
 * When the in-app proxy is off, the updater uses the OS/system proxy so GitHub
 * checks match the browser. Node `fetch` does not.
 *
 * @param proxy Testrix HTTP proxy settings.
 */
export function buildUpdaterProxyConfig(proxy: HttpProxySettings): UpdaterProxyConfig {
  if (!proxy.enabled) {
    return { mode: 'system' };
  }

  const httpRaw = proxy.httpProxy.trim();
  const httpsRaw = proxy.httpsProxy.trim();
  const httpServer = toChromiumProxyServer(httpRaw || httpsRaw);
  const httpsServer = toChromiumProxyServer(httpsRaw || httpRaw);
  if (!httpServer && !httpsServer) {
    return { mode: 'system' };
  }

  const proxyRules =
    httpServer && httpsServer && httpServer !== httpsServer
      ? `http=${httpServer};https=${httpsServer}`
      : (httpsServer || httpServer);

  return {
    mode: 'fixed_servers',
    proxyRules,
    proxyBypassRules: proxy.bypass.trim(),
  };
}

/**
 * Converts a proxy URL or `host:port` into Chromium's `host:port` form.
 *
 * @param value Settings proxy field.
 */
export function toChromiumProxyServer(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`);
    const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    return `${parsed.hostname}:${port}`;
  } catch {
    return trimmed;
  }
}
