import { describe, expect, it } from 'vitest';

import {
  ancestorFolderConfigs,
  cookiesMatchingUrl,
  inheritedKvRows,
  interpolateTemplate,
  resolveVariableTemplates,
  mergeFolderConfigs,
  parentFolderConfigs,
  parseCollectionFolderConfig,
  type CollectionFolderConfig,
} from './collection-folder';
import { parseCollectionsFile } from './config-files';
import type { CollectionTree } from './collection-tree';

function config(patch: Partial<CollectionFolderConfig>): CollectionFolderConfig {
  return { ...parseCollectionFolderConfig({}), ...patch };
}

describe('parseCollectionFolderConfig', () => {
  it('fills defaults for an empty object', () => {
    const parsed = parseCollectionFolderConfig({});
    expect(parsed.auth.type).toBe('none');
    expect(parsed.auth.pkce).toBe(true);
    expect(parsed.auth.grantType).toBe('authorization_code');
    expect(parsed.auth.codeChallengeMethod).toBe('S256');
    expect(parsed.settings.timeoutMs).toBe(30000);
    expect(parsed.settings.followRedirects).toBe(true);
    expect(parsed.settings.verifyTls).toBe(true);
    expect(parsed.settings.cookies).toEqual([]);
    expect(parsed.params).toEqual([]);
    expect(parsed.docs).toBe('');
  });

  it('fills an empty description on a key/value row', () => {
    const parsed = parseCollectionFolderConfig({
      variables: [{ id: 'v1', key: 'host', value: 'api.local' }],
    });
    expect(parsed.variables[0]).toMatchObject({
      id: 'v1',
      key: 'host',
      value: 'api.local',
      description: '',
    });
  });

  it('keeps a legacy folder without config', () => {
    const file = parseCollectionsFile({
      collections: [
        {
          kind: 'folder',
          id: 'folder-1',
          name: 'Auth',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          children: [],
        },
      ],
    });
    expect(file.collections[0]).toMatchObject({ id: 'folder-1', kind: 'folder' });
    expect((file.collections[0] as { config?: unknown }).config).toBeUndefined();
  });
});

describe('mergeFolderConfigs', () => {
  it('lets later folders override headers and nearest non-none auth', () => {
    const root = config({
      headers: [{ id: 'h1', enabled: true, key: 'X-Root', value: 'a' }],
      auth: { ...parseCollectionFolderConfig({}).auth, type: 'bearer', token: 'root' },
    });
    const child = config({
      headers: [{ id: 'h2', enabled: true, key: 'X-Root', value: 'b' }],
      auth: { ...parseCollectionFolderConfig({}).auth, type: 'none' },
    });
    const merged = mergeFolderConfigs([root, child]);
    expect(merged.headers).toEqual([{ id: 'h2', enabled: true, key: 'X-Root', value: 'b' }]);
    expect(merged.auth.type).toBe('bearer');
    expect(merged.auth.token).toBe('root');
  });

  it('unions cookies by name, domain, and path', () => {
    const root = config({
      settings: {
        ...parseCollectionFolderConfig({}).settings,
        cookies: [
          {
            id: 'c1',
            enabled: true,
            name: 'sid',
            value: 'root',
            domain: 'api.local',
            path: '/',
            expires: '',
            secure: false,
            httpOnly: false,
          },
        ],
      },
    });
    const child = config({
      settings: {
        ...parseCollectionFolderConfig({}).settings,
        cookies: [
          {
            id: 'c2',
            enabled: true,
            name: 'sid',
            value: 'child',
            domain: 'api.local',
            path: '/',
            expires: '',
            secure: false,
            httpOnly: false,
          },
        ],
      },
    });
    const merged = mergeFolderConfigs([root, child]);
    expect(merged.settings.cookies).toHaveLength(1);
    expect(merged.settings.cookies[0].value).toBe('child');
  });

  it('walks ancestors from the workspace root', () => {
    const tree: CollectionTree = [
      {
        kind: 'folder',
        id: 'root',
        name: 'Root',
        modifiedAt: '2026-01-01T00:00:00.000Z',
        config: config({
          headers: [{ id: 'h1', enabled: true, key: 'X-Env', value: 'root' }],
        }),
        children: [
          {
            kind: 'folder',
            id: 'child',
            name: 'Child',
            modifiedAt: '2026-01-01T00:00:00.000Z',
            config: config({
              headers: [{ id: 'h2', enabled: true, key: 'X-Env', value: 'child' }],
            }),
            children: [
              {
                kind: 'http',
                id: 'http-1',
                name: 'Ping',
                modifiedAt: '2026-01-01T00:00:00.000Z',
                method: 'GET',
                status: null,
              },
            ],
          },
        ],
      },
    ];
    const ancestors = ancestorFolderConfigs(tree, 'http-1');
    expect(ancestors).toHaveLength(2);
    expect(mergeFolderConfigs(ancestors).headers[0].value).toBe('child');
    expect(parentFolderConfigs(tree, 'child')).toHaveLength(1);
    expect(parentFolderConfigs(tree, 'child')[0]?.headers[0]?.value).toBe('root');
    expect(inheritedKvRows(
      [
        { source: 'Settings', sourceId: 'settings', rows: [{ id: 'd1', enabled: true, key: 'Accept', value: '*/*', description: '' }] },
        { source: 'Root', sourceId: 'root', rows: [{ id: 'h1', enabled: true, key: 'X-Env', value: 'root', description: '' }] },
      ],
      [{ id: 'own', enabled: true, key: 'Accept', value: 'application/json', description: '' }],
    )).toEqual([
      expect.objectContaining({ key: 'X-Env', source: 'Root', sourceId: 'root' }),
    ]);
  });
});

describe('cookiesMatchingUrl', () => {
  const cookie = {
    id: 'c1',
    enabled: true,
    name: 'sid',
    value: '1',
    domain: 'api.local',
    path: '/v1',
    expires: '',
    secure: true,
    httpOnly: true,
  };

  it('matches host, path, and https', () => {
    expect(cookiesMatchingUrl([cookie], 'https://api.local/v1/users')).toHaveLength(1);
  });

  it('rejects a secure cookie on http', () => {
    expect(cookiesMatchingUrl([cookie], 'http://api.local/v1/users')).toHaveLength(0);
  });

  it('rejects an expired cookie', () => {
    expect(
      cookiesMatchingUrl(
        [{ ...cookie, secure: false, expires: '2020-01-01T00:00:00.000Z' }],
        'https://api.local/v1/users',
      ),
    ).toHaveLength(0);
  });
});

describe('interpolateTemplate', () => {
  it('replaces folder and environment names', () => {
    expect(interpolateTemplate('https://{{host}}/{{path}}', { host: 'api.local', path: 'v1' })).toBe(
      'https://api.local/v1',
    );
  });

  it('leaves unknown tokens in place', () => {
    expect(interpolateTemplate('{{missing}}', {})).toBe('{{missing}}');
  });
});

describe('resolveVariableTemplates', () => {
  it('expands a value that references another variable', () => {
    expect(
      resolveVariableTemplates({
        baseUrl: 'https://api.test',
        path: '{{baseUrl}}/test',
      }),
    ).toEqual({
      baseUrl: 'https://api.test',
      path: 'https://api.test/test',
    });
  });

  it('leaves a cycle as written', () => {
    expect(resolveVariableTemplates({ a: '{{b}}', b: '{{a}}' })).toEqual({ a: '{{a}}', b: '{{a}}' });
  });
});
