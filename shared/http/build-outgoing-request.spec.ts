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

  it('inherits folder environment and resolves folder variables on send', () => {
    const envNodes: CollectionNode[] = [
      {
        id: 'f-env',
        label: 'API',
        kind: 'folder',
        settings: {
          ...createDefaultCollectionFolderSettings(),
          environmentId: 'env-prod',
          variables: [{ id: 'v1', key: 'apiHost', value: 'https://folder.example' }],
          auth: { type: 'bearer', token: '{{apiHost}}' },
        },
        children: [
          {
            id: 'req-env',
            label: 'Ping',
            kind: 'request',
            method: 'GET',
            url: '{{apiHost}}/ping',
            settings: {
              ...createDefaultCollectionRequestSettings(),
              environmentId: null,
              auth: { type: 'inherit' },
            },
          },
        ],
      },
    ];

    const environments = createDefaultEnvironments();
    environments.environments = [
      {
        id: 'env-prod',
        name: 'Production',
        nodes: [],
      },
    ];

    const http = createDefaultHttpSettings();
    http.request.prependWwwOnSend = false;

    const result = buildOutgoingRequest({
      requestId: 'req-env',
      nodes: envNodes,
      http,
      environments,
      appVersion: '1.0.0',
    });

    expect(result).not.toBeNull();
    expect(result!.outgoing.environmentId).toBe('env-prod');
    expect(result!.outgoing.url).toBe('https://folder.example/ping');
    expect(result!.outgoing.headers['Authorization']).toBe('Bearer https://folder.example');
    expect(result!.outgoing.variableContext['apiHost']).toBe('https://folder.example');
  });

  it('inherits parent folder API key auth through nested folder with legacy none auth', () => {
    const nodes: CollectionNode[] = [
      {
        id: 'oneweb',
        label: 'OneWeb',
        kind: 'folder',
        settings: {
          ...createDefaultCollectionFolderSettings(),
          auth: {
            type: 'apiKey',
            name: 'Authorization',
            value: 'oneweb-key',
            in: 'header',
          },
        },
        children: [
          {
            id: 'b2c',
            label: 'b2c',
            kind: 'folder',
            settings: {
              ...createDefaultCollectionFolderSettings(),
              auth: { type: 'none' },
            },
            children: [
              {
                id: 'req-login',
                label: 'Login',
                kind: 'request',
                method: 'POST',
                url: 'https://api.example.com/login',
                settings: {
                  ...createDefaultCollectionRequestSettings(),
                  auth: { type: 'inherit' },
                },
              },
            ],
          },
        ],
      },
    ];

    const result = buildOutgoingRequest({
      requestId: 'req-login',
      nodes,
      http: createDefaultHttpSettings(),
      environments: createDefaultEnvironments(),
      appVersion: '1.0.0',
    });

    expect(result).not.toBeNull();
    expect(result!.outgoing.headers['Authorization']).toBe('oneweb-key');
  });

  it('merges env, headers, auth, variables, and transport from a three-level folder chain', () => {
    const envNodes: CollectionNode[] = [
      {
        id: 'f1',
        label: 'Folder 1',
        kind: 'folder',
        settings: {
          ...createDefaultCollectionFolderSettings(),
          headers: [{ id: 'h1', key: 'X-F1', value: 'one' }],
          auth: { type: 'bearer', token: 'root-token' },
          variables: [{ id: 'v1', key: 'tier', value: 'f1' }],
          transport: { timeoutMs: 11_000 },
        },
        children: [
          {
            id: 'f2',
            label: 'Folder 2',
            kind: 'folder',
            settings: {
              ...createDefaultCollectionFolderSettings(),
              headers: [{ id: 'h2', key: 'X-F2', value: 'two' }],
              auth: { type: 'inherit' },
              variables: [{ id: 'v2', key: 'tier', value: 'f2' }],
              transport: { timeoutMs: 22_000 },
            },
            children: [
              {
                id: 'f3',
                label: 'Folder 3',
                kind: 'folder',
                settings: {
                  ...createDefaultCollectionFolderSettings(),
                  environmentId: 'env-chain',
                  headers: [{ id: 'h3', key: 'X-F3', value: 'three' }],
                  auth: { type: 'inherit' },
                  transport: { timeoutMs: 33_000 },
                },
                children: [
                  {
                    id: 'req-nested',
                    label: 'Request 1',
                    kind: 'request',
                    method: 'GET',
                    url: 'https://api.example.com/{{tier}}',
                    settings: createDefaultCollectionRequestSettings(),
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const environments = createDefaultEnvironments();
    environments.environments = [
      { id: 'env-chain', name: 'Chain', nodes: [] },
    ];

    const result = buildOutgoingRequest({
      requestId: 'req-nested',
      nodes: envNodes,
      http: createDefaultHttpSettings(),
      environments,
      appVersion: '1.0.0',
    });

    expect(result).not.toBeNull();
    expect(result!.ancestorFolderIds).toEqual(['f1', 'f2', 'f3']);
    expect(result!.outgoing.environmentId).toBe('env-chain');
    expect(result!.outgoing.headers['X-F1']).toBe('one');
    expect(result!.outgoing.headers['X-F2']).toBe('two');
    expect(result!.outgoing.headers['X-F3']).toBe('three');
    expect(result!.outgoing.headers['Authorization']).toBe('Bearer root-token');
    expect(result!.outgoing.url).toBe('https://api.example.com/f2');
    expect(result!.outgoing.transport.timeoutMs).toBe(33_000);
    expect(result!.outgoing.variableContext['tier']).toBe('f2');
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

  it('adds Content-Type for POST JSON when auto-detect is enabled', () => {
    const postNodes: CollectionNode[] = [
      {
        id: 'req-post',
        label: 'Create',
        kind: 'request',
        method: 'POST',
        url: 'https://api.example.com/items',
        settings: {
          ...createDefaultCollectionRequestSettings(),
          body: { mode: 'json', raw: '{"ok":true}' },
        },
      },
    ];
    const result = buildOutgoingRequest({
      requestId: 'req-post',
      nodes: postNodes,
      http: createDefaultHttpSettings(),
      environments: createDefaultEnvironments(),
      appVersion: '1.0.0',
    });
    expect(result!.outgoing.headers['Content-Type']).toBe('application/json');
  });

  it('infers Content-Type for text bodies with JSON payload when auto-detect is enabled', () => {
    const postNodes: CollectionNode[] = [
      {
        id: 'req-text-json',
        label: 'Create',
        kind: 'request',
        method: 'POST',
        url: 'https://api.example.com/items',
        settings: {
          ...createDefaultCollectionRequestSettings(),
          body: { mode: 'text', raw: '{"id":1}' },
        },
      },
    ];
    const result = buildOutgoingRequest({
      requestId: 'req-text-json',
      nodes: postNodes,
      http: createDefaultHttpSettings(),
      environments: createDefaultEnvironments(),
      appVersion: '1.0.0',
    });
    expect(result!.outgoing.headers['Content-Type']).toBe('application/json');
  });

  it('omits auto Content-Type when auto-detect is disabled', () => {
    const http = createDefaultHttpSettings();
    http.request.autoDetectContentTypeOnSend = false;
    const postNodes: CollectionNode[] = [
      {
        id: 'req-post',
        label: 'Create',
        kind: 'request',
        method: 'POST',
        url: 'https://api.example.com/items',
        settings: {
          ...createDefaultCollectionRequestSettings(),
          body: { mode: 'json', raw: '{}' },
        },
      },
    ];
    const result = buildOutgoingRequest({
      requestId: 'req-post',
      nodes: postNodes,
      http,
      environments: createDefaultEnvironments(),
      appVersion: '1.0.0',
    });
    expect(result!.outgoing.headers['Content-Type']).toBeUndefined();
  });

  it('returns null when the request URL is empty', () => {
    const emptyUrlNodes: CollectionNode[] = [
      {
        id: 'req-empty',
        label: 'Untitled',
        kind: 'request',
        method: 'GET',
        url: '',
        settings: createDefaultCollectionRequestSettings(),
      },
    ];

    const result = buildOutgoingRequest({
      requestId: 'req-empty',
      nodes: emptyUrlNodes,
      http: createDefaultHttpSettings(),
      environments: createDefaultEnvironments(),
      appVersion: '1.0.0',
    });

    expect(result).toBeNull();
  });
});
