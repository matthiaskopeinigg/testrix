import { describe, expect, it } from 'vitest';

import {
  browserOpenUrlCandidates,
  ensureRequestUrlScheme,
  ensureWebsocketUrlScheme,
  isAbortedNavigationError,
  isDnsOrHostLoadError,
  isLocalRequestHost,
  isUsableBrowserPageUrl,
  withWwwHost,
} from './request-url';

describe('ensureRequestUrlScheme', () => {
  it('adds https for a public host without a scheme', () => {
    expect(ensureRequestUrlScheme('example.com/search?q=1')).toBe('https://example.com/search?q=1');
    expect(ensureRequestUrlScheme('www.example.com')).toBe('https://www.example.com');
    expect(ensureRequestUrlScheme('//cdn.example.com/lib.js')).toBe('https://cdn.example.com/lib.js');
  });

  it('adds http for localhost and IP hosts', () => {
    expect(ensureRequestUrlScheme('localhost:3000/api')).toBe('http://localhost:3000/api');
    expect(ensureRequestUrlScheme('127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
    expect(ensureRequestUrlScheme('[::1]:4100/health')).toBe('http://[::1]:4100/health');
    expect(ensureRequestUrlScheme('printer.local/status')).toBe('http://printer.local/status');
  });

  it('leaves schemes and templates alone', () => {
    expect(ensureRequestUrlScheme('https://example.com')).toBe('https://example.com');
    expect(ensureRequestUrlScheme('HTTP://Example.COM/x')).toBe('HTTP://Example.COM/x');
    expect(ensureRequestUrlScheme('{{baseUrl}}/users')).toBe('{{baseUrl}}/users');
    expect(ensureRequestUrlScheme('/relative')).toBe('/relative');
    expect(ensureRequestUrlScheme('')).toBe('');
  });
});

describe('withWwwHost', () => {
  it('prefixes www when the hostname is missing it', () => {
    expect(withWwwHost('https://example.com/search?q=1')).toBe('https://www.example.com/search?q=1');
    expect(withWwwHost('example.com')).toBe('https://www.example.com');
    expect(withWwwHost('https://api.example.com:8443/v1')).toBe('https://www.api.example.com:8443/v1');
  });

  it('skips hosts that already have www, IPs, and localhost', () => {
    expect(withWwwHost('https://www.example.com')).toBeNull();
    expect(withWwwHost('http://127.0.0.1')).toBeNull();
    expect(withWwwHost('http://localhost:3000')).toBeNull();
  });
});

describe('browserOpenUrlCandidates', () => {
  it('fills https and adds a www fallback for plain hostnames', () => {
    expect(browserOpenUrlCandidates('magenta.at')).toEqual([
      'https://magenta.at',
      'https://www.magenta.at',
    ]);
  });

  it('skips www when already present or local', () => {
    expect(browserOpenUrlCandidates('https://www.example.com')).toEqual(['https://www.example.com']);
    expect(browserOpenUrlCandidates('localhost:3000')).toEqual(['http://localhost:3000']);
  });
});

describe('isDnsOrHostLoadError', () => {
  it('detects Chromium and Node DNS failures', () => {
    expect(isDnsOrHostLoadError(new Error('ERR_NAME_NOT_RESOLVED'))).toBe(true);
    expect(isDnsOrHostLoadError(new Error('getaddrinfo ENOTFOUND magenta.at'))).toBe(true);
    expect(isDnsOrHostLoadError(new Error('net::ERR_CONNECTION_REFUSED'))).toBe(false);
  });
});

describe('isAbortedNavigationError', () => {
  it('detects Chromium aborted navigations from redirects', () => {
    expect(isAbortedNavigationError(new Error("ERR_ABORTED (-3) loading 'https://magenta.at/'"))).toBe(true);
    expect(isAbortedNavigationError(new Error('net::ERR_ABORTED'))).toBe(true);
    expect(isAbortedNavigationError(new Error('ERR_FAILED (-2)'))).toBe(false);
  });
});

describe('isUsableBrowserPageUrl', () => {
  it('accepts http(s) pages and rejects blank or chrome error pages', () => {
    expect(isUsableBrowserPageUrl('https://www.magenta.at/')).toBe(true);
    expect(isUsableBrowserPageUrl('about:blank')).toBe(false);
    expect(isUsableBrowserPageUrl('chrome-error://chromewebdata/')).toBe(false);
  });
});

describe('isLocalRequestHost', () => {
  it('detects loopback and mDNS names', () => {
    expect(isLocalRequestHost('localhost')).toBe(true);
    expect(isLocalRequestHost('::1')).toBe(true);
    expect(isLocalRequestHost('192.168.1.8')).toBe(true);
    expect(isLocalRequestHost('example.com')).toBe(false);
  });
});

describe('ensureWebsocketUrlScheme', () => {
  it('adds wss for a public host and ws for localhost', () => {
    expect(ensureWebsocketUrlScheme('example.com/socket')).toBe('wss://example.com/socket');
    expect(ensureWebsocketUrlScheme('localhost:8765/ws')).toBe('ws://localhost:8765/ws');
  });

  it('rewrites http schemes to websocket schemes', () => {
    expect(ensureWebsocketUrlScheme('https://example.com/ws')).toBe('wss://example.com/ws');
    expect(ensureWebsocketUrlScheme('http://127.0.0.1:8765')).toBe('ws://127.0.0.1:8765');
  });
});
