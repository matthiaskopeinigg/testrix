import {
  createDefaultHttpSettings,
  type HttpRequestSettings,
} from '../config/http-settings.schema';
import { normalizeOutgoingRequestUrl } from '../config/normalize-outgoing-request-url';

/**
 * Normalizes a capture browser start URL (scheme, optional `www.`) before opening the window.
 * Always applies URL fixes; honors default scheme and `www.` preference from HTTP request settings.
 */
export function normalizeCaptureStartUrl(
  raw: string,
  request: Pick<HttpRequestSettings, 'defaultUrlScheme' | 'prependWwwOnSend'> = createDefaultHttpSettings()
    .request,
): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'about:blank';
  }
  if (/^about:/i.test(trimmed)) {
    return trimmed;
  }
  return normalizeOutgoingRequestUrl(trimmed, {
    defaultScheme: request.defaultUrlScheme,
    enabled: true,
    prependWww: request.prependWwwOnSend,
  });
}
