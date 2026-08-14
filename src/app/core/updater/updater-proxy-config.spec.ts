import { describe, expect, it } from 'vitest';

import { buildUpdaterProxyConfig, toChromiumProxyServer } from '@shared/updater/updater-proxy-config';

describe('buildUpdaterProxyConfig', () => {
  it('uses the OS proxy when the in-app proxy is disabled', () => {
    expect(
      buildUpdaterProxyConfig({
        enabled: false,
        httpProxy: 'http://127.0.0.1:8080',
        httpsProxy: 'http://127.0.0.1:8080',
        bypass: 'localhost',
      }),
    ).toEqual({ mode: 'system' });
  });

  it('uses a single proxy server for HTTP and HTTPS when they match', () => {
    expect(
      buildUpdaterProxyConfig({
        enabled: true,
        httpProxy: 'http://127.0.0.1:8080',
        httpsProxy: 'http://127.0.0.1:8080',
        bypass: 'localhost,127.0.0.1',
      }),
    ).toEqual({
      mode: 'fixed_servers',
      proxyRules: '127.0.0.1:8080',
      proxyBypassRules: 'localhost,127.0.0.1',
    });
  });

  it('splits HTTP and HTTPS when they differ', () => {
    expect(
      buildUpdaterProxyConfig({
        enabled: true,
        httpProxy: 'http://127.0.0.1:8080',
        httpsProxy: 'http://proxy.internal:8443',
        bypass: '',
      }),
    ).toEqual({
      mode: 'fixed_servers',
      proxyRules: 'http=127.0.0.1:8080;https=proxy.internal:8443',
      proxyBypassRules: '',
    });
  });

  it('falls back to the OS proxy when enabled but empty', () => {
    expect(
      buildUpdaterProxyConfig({
        enabled: true,
        httpProxy: '  ',
        httpsProxy: '',
        bypass: 'localhost',
      }),
    ).toEqual({ mode: 'system' });
  });
});

describe('toChromiumProxyServer', () => {
  it('strips credentials and scheme from a proxy URL', () => {
    expect(toChromiumProxyServer('http://user:pass@127.0.0.1:8888')).toBe('127.0.0.1:8888');
  });
});
