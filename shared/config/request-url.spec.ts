import { describe, expect, it } from 'vitest';

import { createHttpKeyValueRow } from './http-settings.schema';
import {
  buildRequestDisplayUrl,
  highlightRequestUrlDisplay,
  normalizeOutgoingRequestUrl,
  parseRequestUrlInput,
} from './request-url';

describe('buildRequestDisplayUrl', () => {
  it('appends enabled query params', () => {
    const url = buildRequestDisplayUrl('/users/:id', [
      createHttpKeyValueRow({ key: 'page', value: '1', enabled: true }),
      createHttpKeyValueRow({ key: 'skip', value: '0', enabled: false }),
    ]);
    expect(url).toBe('/users/:id?page=1');
  });
});

describe('parseRequestUrlInput', () => {
  it('splits path and query', () => {
    const parsed = parseRequestUrlInput('/a?x=1&y=2', []);
    expect(parsed.path).toBe('/a');
    expect(parsed.queryParams).toHaveLength(2);
    expect(parsed.queryParams[0]?.key).toBe('x');
  });
});

describe('normalizeOutgoingRequestUrl', () => {
  it('adds default scheme and www for bare domains', () => {
    expect(
      normalizeOutgoingRequestUrl('google.at', {
        defaultScheme: 'https',
        enabled: true,
        prependWww: true,
      }),
    ).toBe('https://www.google.at');
  });

  it('uses http when configured', () => {
    expect(
      normalizeOutgoingRequestUrl('example.com/path', {
        defaultScheme: 'http',
        enabled: true,
        prependWww: true,
      }),
    ).toBe('http://www.example.com/path');
  });

  it('leaves relative paths unchanged', () => {
    expect(
      normalizeOutgoingRequestUrl('/api/v1', {
        defaultScheme: 'https',
        enabled: true,
        prependWww: true,
      }),
    ).toBe('/api/v1');
  });

  it('does not add www for subdomains', () => {
    expect(
      normalizeOutgoingRequestUrl('api.example.com', {
        defaultScheme: 'https',
        enabled: true,
        prependWww: true,
      }),
    ).toBe('https://api.example.com');
  });

  it('skips normalization when disabled', () => {
    expect(
      normalizeOutgoingRequestUrl('google.at', {
        defaultScheme: 'https',
        enabled: false,
        prependWww: true,
      }),
    ).toBe('google.at');
  });
});

describe('highlightRequestUrlDisplay', () => {
  it('wraps path params with data attributes', () => {
    const html = highlightRequestUrlDisplay('/x/:id', [
      { id: '1', key: 'id', value: '42' },
    ]);
    expect(html).toContain('tx-url-path-param');
    expect(html).toContain('data-path-value="42"');
  });

  it('highlights environment placeholders', () => {
    const html = highlightRequestUrlDisplay('https://{{baseUrl}}/users', [], [
      { id: 'env:baseUrl', label: '{{baseUrl}}', insert: '{{baseUrl}}', detail: 'Dev' },
    ]);
    expect(html).toContain('tx-var-token--env');
    expect(html).toContain('data-var-id="env:baseUrl"');
  });
});
