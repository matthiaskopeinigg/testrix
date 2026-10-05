import { describe, expect, it } from 'vitest';

import { parseCollectionFolderConfig } from '@testrix/contracts';

import { planHttpSend } from './http-send';

describe('planHttpSend', () => {
  it('merges ancestor headers and inherits folder auth', () => {
    const plan = planHttpSend({
      tree: [
        {
          kind: 'folder',
          id: 'folder-1',
          name: 'API',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          config: parseCollectionFolderConfig({
            headers: [{ id: 'h1', enabled: true, key: 'X-Folder', value: '{{env}}' }],
            variables: [{ id: 'v1', enabled: true, key: 'env', value: 'prod' }],
            auth: { type: 'bearer', token: 'folder-token' },
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
      nodeId: 'http-1',
      method: 'GET',
      url: 'https://api.local/ping',
      params: [],
      headers: [{ id: 'h2', enabled: true, key: 'Accept', value: 'application/json', description: '' }],
      body: '',
      authMode: 'inherit',
      requestAuth: parseCollectionFolderConfig({}).auth,
      envVars: {},
    });
    expect(plan.payload.auth.type).toBe('bearer');
    expect(plan.payload.auth.token).toBe('folder-token');
    expect(plan.payload.headers).toEqual(
      expect.arrayContaining([
        { key: 'X-Folder', value: 'prod' },
        { key: 'Accept', value: 'application/json' },
      ]),
    );
  });

  it('applies workspace default headers under folders and expands placeholders after variables', () => {
    const uuid = () => '11111111-2222-4333-8444-555555555555';
    const plan = planHttpSend({
      tree: [
        {
          kind: 'folder',
          id: 'folder-1',
          name: 'API',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          config: parseCollectionFolderConfig({
            variables: [{ id: 'v1', enabled: true, key: 'id', value: '$uuid' }],
            headers: [{ id: 'h1', enabled: true, key: 'X-Id', value: '{{id}}' }],
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
      nodeId: 'http-1',
      method: 'GET',
      url: 'https://api.local/items/$uuid',
      params: [],
      headers: [{ id: 'h2', enabled: true, key: 'Accept', value: 'application/json', description: '' }],
      body: '',
      authMode: 'inherit',
      requestAuth: parseCollectionFolderConfig({}).auth,
      envVars: {},
      defaultHeaders: [{ id: 'd1', enabled: true, key: 'User-Agent', value: 'Testrix/2.0', description: '' }],
      uuid,
    });
    expect(plan.payload.headers).toEqual(
      expect.arrayContaining([
        { key: 'User-Agent', value: 'Testrix/2.0' },
        { key: 'X-Id', value: '11111111-2222-4333-8444-555555555555' },
        { key: 'Accept', value: 'application/json' },
      ]),
    );
    expect(plan.payload.url).toBe('https://api.local/items/11111111-2222-4333-8444-555555555555');
    expect(plan.payload.variables['id']).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('adds https when the expanded URL has no scheme', () => {
    const plan = planHttpSend({
      tree: [
        {
          kind: 'http',
          id: 'http-1',
          name: 'Ping',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          method: 'GET',
          status: null,
        },
      ],
      nodeId: 'http-1',
      method: 'GET',
      url: 'example.com/ping',
      params: [],
      headers: [],
      body: '',
      authMode: 'inherit',
      requestAuth: parseCollectionFolderConfig({}).auth,
      envVars: {},
    });
    expect(plan.payload.url).toBe('https://example.com/ping');
  });

  it('adds http for localhost without a scheme', () => {
    const plan = planHttpSend({
      tree: [
        {
          kind: 'http',
          id: 'http-1',
          name: 'Ping',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          method: 'GET',
          status: null,
        },
      ],
      nodeId: 'http-1',
      method: 'GET',
      url: 'localhost:3000/health',
      params: [],
      headers: [],
      body: '',
      authMode: 'inherit',
      requestAuth: parseCollectionFolderConfig({}).auth,
      envVars: {},
    });
    expect(plan.payload.url).toBe('http://localhost:3000/health');
  });

  it('sends workspace jar cookies ahead of folder cookies', () => {
    const plan = planHttpSend({
      tree: [
        {
          kind: 'folder',
          id: 'folder-1',
          name: 'API',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          config: parseCollectionFolderConfig({
            settings: {
              cookies: [
                { id: 'folder', enabled: true, name: 'sid', value: 'folder', domain: 'api.local', path: '/', expires: '', secure: false, httpOnly: false },
              ],
            },
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
      nodeId: 'http-1',
      method: 'GET',
      url: 'https://api.local/ping',
      params: [],
      headers: [],
      body: '',
      authMode: 'inherit',
      requestAuth: parseCollectionFolderConfig({}).auth,
      envVars: {},
      jarCookies: [
        { id: 'jar', enabled: true, name: 'sid', value: 'jar', domain: 'api.local', path: '/', expires: '', secure: false, httpOnly: false },
      ],
    });
    expect(plan.payload.cookies).toEqual([
      expect.objectContaining({ name: 'sid', value: 'jar' }),
    ]);
  });

  it('expands variables and placeholders in auth fields', () => {
    const plan = planHttpSend({
      tree: [
        {
          kind: 'http',
          id: 'http-1',
          name: 'Ping',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          method: 'GET',
          status: null,
        },
      ],
      nodeId: 'http-1',
      method: 'GET',
      url: 'https://api.local/ping',
      params: [],
      headers: [],
      body: '',
      authMode: 'apikey',
      requestAuth: parseCollectionFolderConfig({
        auth: {
          type: 'apikey',
          apiKey: '{{token}}',
          apiKeyHeader: '{{header}}',
          apiKeyIn: 'header',
        },
      }).auth,
      envVars: { token: 'secret', header: 'X-Token' },
    });
    expect(plan.payload.auth.apiKey).toBe('secret');
    expect(plan.payload.auth.apiKeyHeader).toBe('X-Token');
  });
});
