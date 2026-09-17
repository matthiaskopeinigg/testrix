import type { Session } from 'electron';

export interface CspOptions {
  readonly connectSrc: string;
  readonly extraImgSrc?: string;
}

/**
 * Applies a strict CSP to the default session. DevTools and extensions stay unrestricted.
 */
export function attachDefaultCsp(session: Session, options: CspOptions): void {
  session.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
    const existing = details.responseHeaders ?? {};
    const urlLower = details.url.toLowerCase();
    if (urlLower.startsWith('devtools://') || urlLower.startsWith('chrome-extension://')) {
      callback({ responseHeaders: existing });
      return;
    }

    const imgSrc = options.extraImgSrc
      ? `'self' data: blob: ${options.extraImgSrc}`
      : `'self' data: blob:`;
    const csp = [
      `default-src 'self'`,
      `script-src 'self'`,
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
