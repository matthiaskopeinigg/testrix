import type { CollectionTransportSettings } from './collection-transport-settings.schema';
import type { AncestorFolderRef } from './collect-collection-ancestors';
import type {
  HttpCertificatesSettings,
  HttpProxySettings,
  HttpRequestSettings,
  HttpSettings,
} from './http-settings.schema';

export interface ResolvedHttpTransport {
  readonly timeoutMs: number;
  readonly useCookies: boolean;
  readonly http2Enabled: boolean;
  readonly http2FallbackToHttp1: boolean;
  readonly followRedirects: boolean;
  readonly maxRedirects: number;
  readonly strictSsl: boolean;
  readonly disableCookiesGlobally: boolean;
  readonly ignoreInvalidSsl: boolean;
  readonly proxy: HttpProxySettings;
  readonly certificates: HttpCertificatesSettings;
  readonly dns: HttpSettings['dns'];
  readonly retries: HttpSettings['retries'];
}

function applyTransportPatch(
  base: HttpRequestSettings,
  patch: CollectionTransportSettings,
): HttpRequestSettings {
  return {
    ...base,
    timeoutMs: patch.timeoutMs ?? base.timeoutMs,
    useCookies: patch.useCookies ?? base.useCookies,
    http2Enabled: patch.http2Enabled ?? base.http2Enabled,
    http2FallbackToHttp1: patch.http2FallbackToHttp1 ?? base.http2FallbackToHttp1,
    followRedirects: patch.followRedirects ?? base.followRedirects,
    maxRedirects: patch.maxRedirects ?? base.maxRedirects,
    strictSsl: patch.strictSsl ?? base.strictSsl,
    disableCookiesGlobally: patch.disableCookiesGlobally ?? base.disableCookiesGlobally,
  };
}

function mergeProxy(
  globalProxy: HttpProxySettings,
  ancestors: readonly AncestorFolderRef[],
  requestTransport: CollectionTransportSettings,
): HttpProxySettings {
  let proxy = { ...globalProxy };

  for (const folder of ancestors) {
    const t = folder.settings.transport;
    if (t.proxyInherit === false && t.proxy) {
      proxy = { ...proxy, ...t.proxy };
      if (t.proxy.enabled !== undefined) {
        proxy.enabled = t.proxy.enabled;
      }
    } else if (t.proxy && Object.keys(t.proxy).length > 0) {
      proxy = { ...proxy, ...t.proxy };
    }
  }

  const rt = requestTransport;
  if (rt.proxyInherit === false && rt.proxy) {
    proxy = { ...proxy, ...rt.proxy };
    if (rt.proxy.enabled !== undefined) {
      proxy.enabled = rt.proxy.enabled;
    }
  } else if (rt.proxy) {
    proxy = { ...proxy, ...rt.proxy };
  }

  return proxy;
}

/**
 * Merges global HTTP settings with ancestor folder and request transport overrides.
 */
export function resolveCollectionTransport(
  http: HttpSettings,
  ancestorFolders: readonly AncestorFolderRef[],
  requestTransport: CollectionTransportSettings,
): ResolvedHttpTransport {
  let request = { ...http.request };

  for (const folder of ancestorFolders) {
    request = applyTransportPatch(request, folder.settings.transport);
  }
  request = applyTransportPatch(request, requestTransport);

  let ignoreInvalidSsl = http.certificates.ignoreInvalidSsl;
  for (const folder of ancestorFolders) {
    if (folder.settings.transport.ignoreInvalidSsl !== undefined) {
      ignoreInvalidSsl = folder.settings.transport.ignoreInvalidSsl;
    }
  }
  if (requestTransport.ignoreInvalidSsl !== undefined) {
    ignoreInvalidSsl = requestTransport.ignoreInvalidSsl;
  }

  const strictSsl = request.strictSsl && !ignoreInvalidSsl;

  return {
    timeoutMs: request.timeoutMs,
    useCookies: request.useCookies,
    http2Enabled: request.http2Enabled,
    http2FallbackToHttp1: request.http2FallbackToHttp1,
    followRedirects: request.followRedirects,
    maxRedirects: request.maxRedirects,
    strictSsl,
    disableCookiesGlobally: request.disableCookiesGlobally,
    ignoreInvalidSsl,
    proxy: mergeProxy(http.proxy, ancestorFolders, requestTransport),
    certificates: http.certificates,
    dns: http.dns,
    retries: http.retries,
  };
}
