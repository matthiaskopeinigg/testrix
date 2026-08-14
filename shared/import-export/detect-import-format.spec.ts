import { describe, expect, it } from 'vitest';

import { detectImportFormat } from './detect-import-format';
import { importPostmanCollection } from './converters/postman';

describe('detectImportFormat', () => {
  it('detects testrix bundle', () => {
    const raw = JSON.stringify({ schema: 'testrix/v1', exportedAt: 'x', appVersion: '1' });
    expect(detectImportFormat('export.json', raw)).toBe('testrix');
  });

  it('detects postman collection', () => {
    const raw = JSON.stringify({ info: { name: 'Demo' }, item: [] });
    expect(detectImportFormat('col.json', raw)).toBe('postman');
  });

  it('detects graylog ndjson export', () => {
    const raw = [
      JSON.stringify({
        timestamp: '2024-01-01T00:00:00.000Z',
        source: 'api',
        message: 'GET /users',
        http_method: 'GET',
        url: '/users',
      }),
    ].join('\n');
    expect(detectImportFormat('messages.ndjson', raw)).toBe('graylog');
  });

  it('detects gelf export by extension', () => {
    const raw = JSON.stringify({
      version: '1.1',
      host: 'api',
      short_message: 'GET /health',
      _http_method: 'GET',
      _url: '/health',
    });
    expect(detectImportFormat('messages.gelf', raw)).toBe('graylog');
  });

  it('detects single-object graylog json', () => {
    const raw = JSON.stringify({
      timestamp: '2024-01-01T00:00:00.000Z',
      source: 'api',
      message: 'GET /users',
    });
    expect(detectImportFormat('message.json', raw)).toBe('graylog');
  });

  it('does not classify postman as graylog', () => {
    const raw = JSON.stringify({ info: { name: 'Demo' }, item: [] });
    expect(detectImportFormat('col.json', raw)).toBe('postman');
  });

  it('does not classify har as graylog', () => {
    const raw = JSON.stringify({ log: { entries: [] } });
    expect(detectImportFormat('capture.har', raw)).toBe('har');
  });

  it('does not classify openapi as graylog', () => {
    const raw = JSON.stringify({ openapi: '3.0.3', info: { title: 'API' }, paths: {} });
    expect(detectImportFormat('api.json', raw)).toBe('openapi');
  });
});

describe('importPostmanCollection', () => {
  it('maps a simple request', () => {
    const raw = JSON.stringify({
      info: { name: 'API' },
      item: [
        {
          name: 'Get users',
          request: { method: 'GET', url: 'https://example.com/users' },
        },
      ],
    });
    const file = importPostmanCollection(raw);
    expect(file.nodes).toHaveLength(1);
    expect(file.nodes[0]?.kind).toBe('request');
  });
});
