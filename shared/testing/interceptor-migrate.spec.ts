import { describe, expect, it } from 'vitest';

import { migrateInterceptorFile, migrateLegacyInterceptorMockBody } from './interceptor-migrate';

describe('migrateLegacyInterceptorMockBody', () => {
  it('converts legacy json string body', () => {
    const body = migrateLegacyInterceptorMockBody({
      id: 'r1',
      name: 'Rule',
      enabled: true,
      matchUrl: '*',
      action: 'mock',
      mockBodyType: 'json',
      mockBody: '{"ok":true}',
      updatedAt: '2020-01-01T00:00:00.000Z',
    });
    expect(body).toEqual({ mode: 'json', raw: '{"ok":true}' });
  });
});

describe('migrateInterceptorFile', () => {
  it('migrates file with legacy rule bodies', () => {
    const file = migrateInterceptorFile({
      schemaVersion: 1,
      items: [
        {
          id: 'r1',
          name: 'Legacy',
          enabled: true,
          matchUrl: '*',
          action: 'mock',
          mockBodyType: 'text',
          mockBody: 'hello',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    });
    const rule = file.items[0];
    expect(rule && 'matchUrl' in rule && rule.mockBody).toEqual({ mode: 'text', raw: 'hello' });
  });
});
