import type { Session } from 'electron';

export interface CspOptions {
  readonly connectSrc: string;
  readonly extraImgSrc?: string;
}

/** True when the URL is a Testrix app surface (not an open-web page). */
export function isAppOwnedUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.startsWith('devtools://') || lower.startsWith('chrome-extension://'))
    return false;
  if (lower.startsWith('file://'))
    return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return false;
    const host = parsed.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

function stripCspHeaders(
  headers: Record<string, string | string[]>,
): Record<string, string | string[]> {
  const next: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower === 'content-security-policy' || lower === 'content-security-policy-report-only')
      continue;
    next[key] = value;
  }
  return next;
}

/**
 * Applies a strict CSP to the default session for app-owned documents only.
 * Third-party pages keep their own headers so open-web loads are not rewritten.
 * DevTools and extensions stay unrestricted.
 */
export function attachDefaultCsp(session: Session, options: CspOptions): void {
  session.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
    const existing = details.responseHeaders ?? {};
    const urlLower = details.url.toLowerCase();
    if (urlLower.startsWith('devtools://') || urlLower.startsWith('chrome-extension://')) {
      callback({ responseHeaders: existing });
      return;
    }

    if (!isAppOwnedUrl(details.url)) {
      callback({ responseHeaders: existing });
      return;
    }

    const imgSrc = options.extraImgSrc
      ? `'self' data: blob: ${options.extraImgSrc}`
      : `'self' data: blob:`;
    const csp = [
      `default-src 'self'`,
      `script-src 'self' 'wasm-unsafe-eval'`,
      `style-src 'self' 'unsafe-inline'`,
      `font-src 'self' data:`,
      `img-src ${imgSrc}`,
      `connect-src ${options.connectSrc}`,
      `worker-src 'self' blob:`,
      `frame-src 'self'`,
      `child-src 'self'`,
    ].join('; ');

    callback({
      responseHeaders: {
        ...existing,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

/**
 * Relaxes response CSP on a testing partition so third-party pages (and their
 * analytics frames) are not blocked during E2E / listener / intercept runs.
 */
export function attachOpenWebCspPassthrough(session: Session): void {
  session.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
    const next = stripCspHeaders(details.responseHeaders ?? {});
    // Replace rather than only strip so meta-less header CSP cannot block frames.
    next['Content-Security-Policy'] = [
      "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-src *; child-src *; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src *; img-src * data: blob:; style-src * 'unsafe-inline'; font-src * data:;",
    ];
    callback({ responseHeaders: next });
  });
}
