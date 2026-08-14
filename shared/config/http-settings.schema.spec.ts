import { describe, expect, it } from 'vitest';

import {
  createDefaultHttpSettings,
  normalizeHttpCertificatesSettings,
  normalizeHttpDnsSettings,
} from './http-settings.schema';

describe('normalizeHttpDnsSettings', () => {
  it('fills missing enabled on legacy host rows', () => {
    const dns = normalizeHttpDnsSettings({
      overrideEnabled: true,
      servers: '8.8.8.8',
      hosts: [{ id: 'h1', key: 'api.local', value: '127.0.0.1' }],
    });
    expect(dns.hosts[0]?.enabled).toBe(true);
    expect(dns.hosts[0]?.key).toBe('api.local');
  });
});

describe('normalizeHttpCertificatesSettings', () => {
  it('migrates legacy client cert paths into entries', () => {
    const normalized = normalizeHttpCertificatesSettings({
      clientCertPath: '/tmp/cert.pem',
      clientKeyPath: '/tmp/key.pem',
      entries: [],
    });
    expect(normalized.entries).toHaveLength(1);
    expect(normalized.entries[0]?.clientCertPath).toBe('/tmp/cert.pem');
  });
});

describe('createDefaultHttpSettings', () => {
  it('includes DNS defaults', () => {
    expect(createDefaultHttpSettings().dns.hosts).toEqual([]);
  });
});
