import type { Session } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import { attachDefaultCsp, isAppOwnedUrl } from './csp';

describe('isAppOwnedUrl', () => {
  it('accepts local app surfaces', () => {
    expect(isAppOwnedUrl('http://localhost:4200/')).toBe(true);
    expect(isAppOwnedUrl('http://127.0.0.1:4200/main.js')).toBe(true);
    expect(isAppOwnedUrl('file:///C:/app/index.html')).toBe(true);
  });

  it('rejects open-web and tooling URLs', () => {
    expect(isAppOwnedUrl('https://www.magenta.at/')).toBe(false);
    expect(isAppOwnedUrl('https://sst.magenta.at/ns.html?id=GTM-1')).toBe(false);
    expect(isAppOwnedUrl('devtools://devtools/bundled/')).toBe(false);
  });
});

describe('attachDefaultCsp', () => {
  it('does not rewrite CSP for third-party responses', () => {
    let handler:
      | ((
          details: { readonly url: string; readonly responseHeaders?: Record<string, string[]> },
          callback: (response: { responseHeaders: Record<string, string | string[]> }) => void,
        ) => void)
      | null = null;

    const fakeSession = {
      webRequest: {
        onHeadersReceived: (
          _filter: unknown,
          next: typeof handler extends null ? never : NonNullable<typeof handler>,
        ) => {
          handler = next;
        },
      },
    };

    attachDefaultCsp(fakeSession as unknown as Session, { connectSrc: `'self'` });
    expect(handler).toBeTruthy();

    const callback = vi.fn();
    handler?.(
      {
        url: 'https://sst.magenta.at/ns.html?id=GTM-NWSW7Q2',
        responseHeaders: {
          'Content-Type': ['text/html'],
          'Content-Security-Policy': ["frame-src 'self'"],
        },
      },
      callback,
    );

    expect(callback).toHaveBeenCalledWith({
      responseHeaders: {
        'Content-Type': ['text/html'],
        'Content-Security-Policy': ["frame-src 'self'"],
      },
    });
  });

  it('allows wasm compile for offline PlantUML GraphViz on app-owned pages', () => {
    let handler:
      | ((
          details: { readonly url: string; readonly responseHeaders?: Record<string, string[]> },
          callback: (response: { responseHeaders: Record<string, string | string[]> }) => void,
        ) => void)
      | null = null;

    const fakeSession = {
      webRequest: {
        onHeadersReceived: (
          _filter: unknown,
          next: typeof handler extends null ? never : NonNullable<typeof handler>,
        ) => {
          handler = next;
        },
      },
    };

    attachDefaultCsp(fakeSession as unknown as Session, { connectSrc: `'self' http://localhost:4200` });
    const callback = vi.fn();
    handler?.(
      {
        url: 'http://localhost:4200/',
        responseHeaders: { 'Content-Type': ['text/html'] },
      },
      callback,
    );

    const headers = callback.mock.calls[0]?.[0]?.responseHeaders as Record<string, string[]>;
    const csp = headers['Content-Security-Policy']?.[0] ?? '';
    expect(csp).toContain(`script-src 'self' 'wasm-unsafe-eval'`);
    expect(csp).toContain(`worker-src 'self' blob:`);
  });
});
