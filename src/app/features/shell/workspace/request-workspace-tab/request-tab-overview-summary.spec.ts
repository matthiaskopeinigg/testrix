import { describe, expect, it } from 'vitest';

import {
  countEnabledKeyValueRows,
  formatRequestAuthLabel,
  formatRequestBodyModeLabel,
} from './request-tab-overview-summary';

describe('request-tab-overview-summary', () => {
  it('formats body mode labels', () => {
    expect(formatRequestBodyModeLabel({ mode: 'json', raw: '{}' })).toBe('JSON');
    expect(formatRequestBodyModeLabel({ mode: 'none' })).toBe('No body');
  });

  it('counts enabled key/value rows', () => {
    expect(
      countEnabledKeyValueRows([
        { id: '1', enabled: true, key: 'page', value: '1' },
        { id: '2', enabled: false, key: 'skip', value: 'x' },
        { id: '3', enabled: true, key: ' ', value: 'x' },
      ]),
    ).toBe(1);
  });

  it('formats auth labels', () => {
    expect(formatRequestAuthLabel({ type: 'inherit' })).toBe('Inherit from folder');
    expect(formatRequestAuthLabel({ type: 'bearer', token: '' })).toBe('Bearer token');
    expect(formatRequestAuthLabel({ type: 'oauth2', grantType: 'client_credentials', authUrl: '', tokenUrl: '', clientId: '', clientSecret: '', scope: '', redirectUri: '' })).toBe('OAuth 2.0');
  });
});
