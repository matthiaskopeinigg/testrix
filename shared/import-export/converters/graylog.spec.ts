import { describe, expect, it } from 'vitest';

import {
  extractHttpRequestFromGraylogMessage,
  importGraylog,
  looksLikeGraylogMessage,
  normalizeGraylogMessage,
} from './graylog';

describe('normalizeGraylogMessage', () => {
  it('flattens GELF underscore-prefixed fields', () => {
    const normalized = normalizeGraylogMessage({
      version: '1.1',
      host: 'example.org',
      short_message: 'Request completed',
      _http_method: 'POST',
      _url: 'https://example.org/api/users',
    });
    expect(normalized['http_method']).toBe('POST');
    expect(normalized['url']).toBe('https://example.org/api/users');
  });

  it('merges nested fields object', () => {
    const normalized = normalizeGraylogMessage({
      timestamp: '2024-01-01T00:00:00.000Z',
      message: 'ok',
      fields: { http_method: 'GET', url: '/health' },
    });
    expect(normalized['http_method']).toBe('GET');
    expect(normalized['url']).toBe('/health');
  });
});

describe('looksLikeGraylogMessage', () => {
  it('detects GELF messages', () => {
    expect(
      looksLikeGraylogMessage({
        version: '1.1',
        host: 'app',
        short_message: 'hello',
      }),
    ).toBe(true);
  });

  it('detects Graylog NDJSON messages', () => {
    expect(
      looksLikeGraylogMessage({
        timestamp: '2024-01-01T00:00:00.000Z',
        source: 'app',
        message: 'GET /users',
      }),
    ).toBe(true);
  });
});

describe('extractHttpRequestFromGraylogMessage', () => {
  it('extracts structured HTTP fields', () => {
    const extracted = extractHttpRequestFromGraylogMessage({
      timestamp: '2024-01-01T00:00:00.000Z',
      source: 'api',
      http_method: 'POST',
      url: 'https://example.org/users',
      request_body: '{"name":"Ada"}',
    });
    expect(extracted).toEqual(
      expect.objectContaining({
        method: 'POST',
        url: 'https://example.org/users',
        body: '{"name":"Ada"}',
        label: 'POST https://example.org/users',
      }),
    );
  });

  it('parses access-log style message fallback', () => {
    const extracted = extractHttpRequestFromGraylogMessage({
      timestamp: '2024-01-01T00:00:00.000Z',
      source: 'nginx',
      message: 'GET /api/users HTTP/1.1 200',
    });
    expect(extracted).toEqual(
      expect.objectContaining({
        method: 'GET',
        url: '/api/users',
      }),
    );
  });

  it('returns null when no HTTP data is present', () => {
    expect(
      extractHttpRequestFromGraylogMessage({
        timestamp: '2024-01-01T00:00:00.000Z',
        source: 'app',
        message: 'Application started',
      }),
    ).toBeNull();
  });
});

describe('importGraylog', () => {
  it('imports GELF NDJSON lines', () => {
    const raw = [
      JSON.stringify({
        version: '1.1',
        host: 'api',
        short_message: 'Create user',
        _http_method: 'POST',
        _url: 'https://example.org/users',
        _request_body: '{"name":"Ada"}',
      }),
      JSON.stringify({
        version: '1.1',
        host: 'api',
        short_message: 'List users',
        _http_method: 'GET',
        _url: 'https://example.org/users',
      }),
    ].join('\n');

    const file = importGraylog(raw);
    expect(file.nodes).toHaveLength(2);
    expect(file.nodes[0]).toMatchObject({ kind: 'request', method: 'POST' });
    expect(file.nodes[1]).toMatchObject({ kind: 'request', method: 'GET' });
  });

  it('imports Graylog NDJSON export shape', () => {
    const raw = [
      JSON.stringify({
        timestamp: '2024-01-01T00:00:00.000Z',
        source: 'api',
        message: 'request',
        http_method: 'PUT',
        url: 'https://example.org/users/1',
      }),
    ].join('\n');

    const file = importGraylog(raw);
    expect(file.nodes).toHaveLength(1);
    expect(file.nodes[0]).toMatchObject({
      kind: 'request',
      method: 'PUT',
      url: 'https://example.org/users/1',
    });
  });

  it('imports a single GELF JSON object', () => {
    const raw = JSON.stringify({
      version: '1.1',
      host: 'api',
      short_message: 'Health check',
      _http_method: 'GET',
      _url: 'https://example.org/health',
    });

    const file = importGraylog(raw);
    expect(file.nodes).toHaveLength(1);
    expect(file.nodes[0]).toMatchObject({ kind: 'request', method: 'GET' });
  });

  it('skips lines without HTTP data', () => {
    const raw = [
      JSON.stringify({
        timestamp: '2024-01-01T00:00:00.000Z',
        source: 'app',
        message: 'startup complete',
      }),
      JSON.stringify({
        timestamp: '2024-01-01T00:00:01.000Z',
        source: 'app',
        message: 'GET /ready HTTP/1.1',
      }),
    ].join('\n');

    const file = importGraylog(raw);
    expect(file.nodes).toHaveLength(1);
    expect(file.nodes[0]).toMatchObject({ kind: 'request', url: '/ready' });
  });

  it('throws when no HTTP requests are found', () => {
    const raw = JSON.stringify({
      timestamp: '2024-01-01T00:00:00.000Z',
      source: 'app',
      message: 'no http here',
    });
    expect(() => importGraylog(raw)).toThrow('No HTTP requests found in Graylog export.');
  });
});
