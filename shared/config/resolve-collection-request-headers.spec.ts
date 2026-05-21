import { describe, expect, it } from 'vitest';

import { createDefaultCollectionFolderSettings } from './collection-folder-settings.schema';
import { createDefaultCollectionRequestSettings } from './collection-request-settings.schema';
import { createHttpKeyValueRow } from './http-settings.schema';
import {
  listInheritedRequestHeaderRows,
  resolveCollectionRequestHeaders,
} from './resolve-collection-request-headers';

describe('resolveCollectionRequestHeaders', () => {
  it('merges global, folder, and request rows', () => {
    const request = createDefaultCollectionRequestSettings();
    request.headers.rows = [
      createHttpKeyValueRow({ key: 'X-Request', value: '1', enabled: true }),
    ];

    const resolved = resolveCollectionRequestHeaders({
      globalHeaders: {
        applyDefaultHeaders: true,
        rows: [createHttpKeyValueRow({ key: 'Accept', value: '*/*', enabled: true })],
      },
      ancestorFolders: [
        {
          id: 'f1',
          label: 'Auth',
          settings: {
            ...createDefaultCollectionFolderSettings(),
            headers: [{ id: 'h1', key: 'X-Folder', value: 'f', description: 'note' }],
          },
        },
      ],
      requestHeaders: request.headers,
    });

    const keys = resolved.map((r) => r.key);
    expect(keys).toContain('Accept');
    expect(keys).toContain('X-Folder');
    expect(keys).toContain('X-Request');
    const folder = resolved.find((r) => r.key === 'X-Folder');
    expect(folder?.readOnly).toBe(true);
    expect(folder?.source).toBe('folder');
  });

  it('applies overrides to disable inherited headers', () => {
    const request = createDefaultCollectionRequestSettings();
    request.headers.overrides = { Accept: { enabled: false } };

    const resolved = resolveCollectionRequestHeaders({
      globalHeaders: {
        applyDefaultHeaders: true,
        rows: [createHttpKeyValueRow({ key: 'Accept', value: '*/*', enabled: true })],
      },
      ancestorFolders: [],
      requestHeaders: request.headers,
    });

    expect(resolved.some((r) => r.key === 'Accept')).toBe(false);
  });

  it('lists disabled inherited headers for the panel', () => {
    const request = createDefaultCollectionRequestSettings();
    request.headers.overrides = { Accept: { enabled: false } };

    const inherited = listInheritedRequestHeaderRows({
      globalHeaders: {
        applyDefaultHeaders: true,
        rows: [createHttpKeyValueRow({ key: 'Accept', value: '*/*', enabled: true })],
      },
      ancestorFolders: [],
      requestHeaders: request.headers,
    });

    expect(inherited).toHaveLength(1);
    expect(inherited[0]?.key).toBe('Accept');
    expect(inherited[0]?.enabled).toBe(false);
  });

  it('omits inherited keys replaced by request rows', () => {
    const request = createDefaultCollectionRequestSettings();
    request.headers.rows = [
      createHttpKeyValueRow({ key: 'Accept', value: 'application/json', enabled: true }),
    ];

    const inherited = listInheritedRequestHeaderRows({
      globalHeaders: {
        applyDefaultHeaders: true,
        rows: [createHttpKeyValueRow({ key: 'Accept', value: '*/*', enabled: true })],
      },
      ancestorFolders: [],
      requestHeaders: request.headers,
    });

    expect(inherited.some((r) => r.key === 'Accept')).toBe(false);

    const resolved = resolveCollectionRequestHeaders({
      globalHeaders: {
        applyDefaultHeaders: true,
        rows: [createHttpKeyValueRow({ key: 'Accept', value: '*/*', enabled: true })],
      },
      ancestorFolders: [],
      requestHeaders: request.headers,
    });
    const accept = resolved.find((r) => r.key === 'Accept');
    expect(accept?.source).toBe('request');
    expect(accept?.value).toBe('application/json');
  });
});
