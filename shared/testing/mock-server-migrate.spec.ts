import { describe, expect, it } from 'vitest';

import { migrateMockServerFile } from './mock-server-migrate';
import { createDefaultMockServerFile, isMockServerEndpoint } from './mock-server.schema';

describe('migrateMockServerFile', () => {
  it('creates defaults for empty v2 shell', () => {
    const file = createDefaultMockServerFile();
    expect(file.options.cors.enabled).toBe(false);
    expect(file.options.cors.allowOrigin).toBe('*');
  });

  it('passes through v2 files', () => {
    const file = migrateMockServerFile({
      schemaVersion: 2,
      options: { port: 'auto' },
      items: [],
    });
    expect(file.schemaVersion).toBe(2);
    expect(file.options.port).toBe('auto');
    expect(file.options.cors.enabled).toBe(false);
  });

  it('fills missing cors on legacy v2 files', () => {
    const file = migrateMockServerFile({
      schemaVersion: 2,
      options: { port: 'auto', host: '127.0.0.1' },
      items: [],
    });
    expect(file.options.cors.allowOrigin).toBe('*');
  });

  it('migrates v1 flat endpoints to v2 tree', () => {
    const file = migrateMockServerFile({
      schemaVersion: 1,
      options: { port: 3000, host: '0.0.0.0' },
      endpoints: [
        {
          id: 'e1',
          name: 'Users',
          method: 'GET',
          path: '/users',
          statusCode: 200,
          body: '{"ok":true}',
          latencyMs: 5,
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(file.schemaVersion).toBe(2);
    expect(file.options.port).toBe(3000);
    expect(file.items).toHaveLength(1);
    const item = file.items[0];
    expect(isMockServerEndpoint(item)).toBe(true);
    if (isMockServerEndpoint(item)) {
      expect(item.matchers[0]?.methods).toEqual(['GET']);
      expect(item.matchers[0]?.path.value).toBe('/users');
      expect(item.response.statusCode).toBe(200);
      expect(item.response.latencyMs).toBe(5);
    }
  });
});
