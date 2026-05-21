import { describe, expect, it } from 'vitest';

import { createDefaultCollectionFolderSettings } from '../config/collection-folder-settings.schema';
import { createDefaultCollectionRequestSettings } from '../config/collection-request-settings.schema';
import type { CollectionNode } from '../config/collections.schema';
import {
  createDefaultHttpSettings,
  normalizeHttpDnsSettings,
} from '../config/http-settings.schema';
import { createDefaultEnvironments } from '../config/defaults';

import { buildOutgoingRequest } from './build-outgoing-request';
import { sendHttpRequestPayloadSchema } from './outgoing-request.schema';

describe('buildOutgoingRequest', () => {
  const nodes: CollectionNode[] = [
    {
      id: 'f1',
      label: 'API',
      kind: 'folder',
      settings: {
        ...createDefaultCollectionFolderSettings(),
        headers: [
          {
            id: 'h1',
            key: 'X-Folder',
            value: 'folder-val',
          },
        ],
      },
      children: [
        {
          id: 'req-1',
          label: 'Get user',
          kind: 'request',
          method: 'GET',
          url: 'https://api.example.com/users/:id',
          settings: {
            ...createDefaultCollectionRequestSettings(),
            pathParams: [{ id: 'p1', key: 'id', value: '42' }],
          },
        },
      ],
    },
  ];

  it('merges folder headers and applies path params', () => {
    const result = buildOutgoingRequest({
      requestId: 'req-1',
      nodes,
      http: createDefaultHttpSettings(),
      environments: createDefaultEnvironments(),
      appVersion: '1.0.0',
    });
    expect(result).not.toBeNull();
    expect(result!.outgoing.url).toContain('/users/42');
    expect(result!.outgoing.headers['X-Folder']).toBe('folder-val');
    expect(result!.ancestorFolderIds).toEqual(['f1']);
  });

  it('normalizes bare domain URLs on send', () => {
    const bareNodes: CollectionNode[] = [
      {
        id: 'req-bare',
        label: 'Home',
        kind: 'request',
        method: 'GET',
        url: 'google.at',
        settings: createDefaultCollectionRequestSettings(),
      },
    ];
    const result = buildOutgoingRequest({
      requestId: 'req-bare',
      nodes: bareNodes,
      http: createDefaultHttpSettings(),
      environments: createDefaultEnvironments(),
      appVersion: '1.0.0',
    });
    expect(result!.outgoing.url).toBe('https://www.google.at');
  });

  it('omits body for GET even when request body editor has JSON', () => {
    const getNodes: CollectionNode[] = [
      {
        id: 'req-get',
        label: 'List',
        kind: 'request',
        method: 'GET',
        url: 'https://api.example.com/items',
        settings: {
          ...createDefaultCollectionRequestSettings(),
          body: { mode: 'json', raw: '{}' },
        },
      },
    ];
    const result = buildOutgoingRequest({
      requestId: 'req-get',
      nodes: getNodes,
      http: createDefaultHttpSettings(),
      environments: createDefaultEnvironments(),
      appVersion: '1.0.0',
    });
    expect(result!.outgoing.body).toEqual({ kind: 'none' });
    expect(result!.outgoing.headers['Content-Type']).toBeUndefined();
  });

  it('produces a payload valid for IPC sendHttpRequestPayloadSchema', () => {
    const bareNodes: CollectionNode[] = [
      {
        id: 'req-bare',
        label: 'Home',
        kind: 'request',
        method: 'GET',
        url: 'google.at',
        settings: createDefaultCollectionRequestSettings(),
      },
    ];
    const result = buildOutgoingRequest({
      requestId: 'req-bare',
      nodes: bareNodes,
      http: createDefaultHttpSettings(),
      environments: createDefaultEnvironments(),
      appVersion: '1.0.0',
    });
    const ipcPayload = JSON.parse(
      JSON.stringify({
        ...result!.outgoing,
        runScope: { runId: `run-${Date.now()}` },
      }),
    );
    const parsed = sendHttpRequestPayloadSchema.safeParse(ipcPayload);
    expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.flatten(), null, 2)).toBe(
      true,
    );
  });

  it('sends when global DNS hosts omit enabled (legacy settings)', () => {
    const http = createDefaultHttpSettings();
    http.dns = normalizeHttpDnsSettings({
      ...http.dns,
      hosts: [{ id: 'legacy', key: 'host.test', value: '1.2.3.4' }],
    });
    const bareNodes: CollectionNode[] = [
      {
        id: 'req-bare',
        label: 'Home',
        kind: 'request',
        method: 'GET',
        url: 'google.at',
        settings: createDefaultCollectionRequestSettings(),
      },
    ];
    const result = buildOutgoingRequest({
      requestId: 'req-bare',
      nodes: bareNodes,
      http,
      environments: createDefaultEnvironments(),
      appVersion: '1.0.0',
    });
    expect(result).not.toBeNull();
    expect(result!.outgoing.transport.dns.hosts[0]?.enabled).toBe(true);
  });
});
