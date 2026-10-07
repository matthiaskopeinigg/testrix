import { describe, expect, it } from 'vitest';

import { DEFAULT_REQUEST_CONFIG, DEFAULT_WEBSOCKET_CONFIG, type CollectionTree } from '@testrix/contracts';

import { indexCollectionHealth, scanCollectionHealth } from './collection-health';

function tree(): CollectionTree {
  return [
    {
      kind: 'folder',
      id: 'folder-1',
      name: 'API',
      modifiedAt: '2026-01-01T00:00:00.000Z',
      children: [
          {
            kind: 'http',
            id: 'http-ok',
            name: 'Healthy',
            method: 'GET',
            status: null,
            modifiedAt: '2026-01-01T00:00:00.000Z',
            config: { ...DEFAULT_REQUEST_CONFIG, url: '{{baseUrl}}/users' },
          },
          {
            kind: 'http',
            id: 'http-missing',
            name: 'Missing var',
            method: 'GET',
            status: null,
            modifiedAt: '2026-01-01T00:00:00.000Z',
            config: { ...DEFAULT_REQUEST_CONFIG, url: '{{missingBase}}/x' },
          },
          {
            kind: 'http',
            id: 'http-empty',
            name: 'Empty',
            method: 'GET',
            status: null,
            modifiedAt: '2026-01-01T00:00:00.000Z',
            config: { ...DEFAULT_REQUEST_CONFIG, url: '' },
          },
          {
            kind: 'websocket',
            id: 'ws-bad',
            name: 'Bad WS',
            modifiedAt: '2026-01-01T00:00:00.000Z',
            config: { ...DEFAULT_WEBSOCKET_CONFIG, url: 'https://example.com/socket' },
          },
      ],
    },
  ];
}

describe('scanCollectionHealth', () => {
  it('reports empty URL, unresolved vars, and bad websocket schemes', () => {
    const issues = scanCollectionHealth({
      tree: tree(),
      envVars: { baseUrl: 'https://api.example.com' },
    });
    const byId = new Map(issues.map((issue) => [issue.nodeId, issue]));
    expect(byId.get('http-ok')).toBeUndefined();
    expect(byId.get('http-missing')?.code).toBe('unresolved-var');
    expect(byId.get('http-empty')?.code).toBe('empty-url');
    expect(byId.get('ws-bad')?.code).toBe('bad-ws-scheme');
  });

  it('scopes to a folder when folderId is set', () => {
    const issues = scanCollectionHealth({
      tree: tree(),
      envVars: {},
      folderId: 'folder-1',
    });
    expect(issues.some((issue) => issue.nodeId === 'http-empty')).toBe(true);
  });

  it('treats resolved absolute URLs as healthy', () => {
    const issues = scanCollectionHealth({
      tree: [
        {
          kind: 'http',
          id: 'http-1',
          name: 'Direct',
          method: 'GET',
          status: null,
          modifiedAt: '2026-01-01T00:00:00.000Z',
          config: { ...DEFAULT_REQUEST_CONFIG, url: 'https://example.com/ok' },
        },
      ],
      envVars: {},
    });
    expect(issues).toEqual([]);
  });
});

describe('indexCollectionHealth', () => {
  it('rolls issue counts up to folders and skips healthy requests', () => {
    const nodes = tree();
    const issues = scanCollectionHealth({
      tree: nodes,
      envVars: { baseUrl: 'https://api.example.com' },
    });
    const index = indexCollectionHealth(nodes, issues);
    expect(index.byNodeId.has('http-ok')).toBe(false);
    expect(index.byNodeId.get('http-empty')?.[0]?.message).toBe('URL is empty');
    expect(index.folders.get('folder-1')?.count).toBe(issues.length);
    expect(index.folders.get('folder-1')?.severity).toBe('error');
  });
});
