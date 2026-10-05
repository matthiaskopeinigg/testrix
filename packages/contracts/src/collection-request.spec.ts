import { describe, expect, it } from 'vitest';

import {
  applyPathParams,
  applyQueryToUrl,
  encodeRequestBody,
  looksLikeCurl,
  parseCollectionRequestConfig,
  parseCurl,
  parseQueryParams,
  pathParamNames,
  prettyBody,
  requestResponseTabSlideDir,
  requestSectionSlideDir,
  syncPathParams,
} from './collection-request';
import { parseCollectionsFile } from './config-files';

describe('parseCollectionRequestConfig', () => {
  it('fills defaults for an empty object', () => {
    const parsed = parseCollectionRequestConfig({});
    expect(parsed.authMode).toBe('inherit');
    expect(parsed.body.mode).toBe('none');
    expect(parsed.url).toBe('');
    expect(parsed.examples).toEqual([]);
  });

  it('keeps a legacy HTTP node without config', () => {
    const file = parseCollectionsFile({
      collections: [
        {
          kind: 'http',
          id: 'http-1',
          name: 'Login',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          method: 'GET',
          status: null,
        },
      ],
    });
    expect(file.collections[0]).toMatchObject({ id: 'http-1', kind: 'http', method: 'GET' });
  });
});

describe('encodeRequestBody', () => {
  it('encodes urlencoded rows', () => {
    const encoded = encodeRequestBody({
      mode: 'urlencoded',
      text: '',
      graphql: { query: '', variables: '', operationName: '' },
      formRows: [
        { id: 'a', enabled: true, key: 'q', value: 'hello world', description: '', kind: 'text', fileName: '', contentType: '' },
      ],
      binary: { fileName: '', contentType: '', base64: '' },
    });
    expect(encoded.contentType).toBe('application/x-www-form-urlencoded');
    expect(encoded.text).toBe('q=hello%20world');
  });

  it('encodes graphql as json', () => {
    const encoded = encodeRequestBody({
      mode: 'graphql',
      text: '',
      graphql: { query: '{ ping }', variables: '{"id":1}', operationName: 'Ping' },
      formRows: [],
      binary: { fileName: '', contentType: '', base64: '' },
    });
    expect(encoded.contentType).toBe('application/json');
    expect(JSON.parse(encoded.text)).toEqual({ query: '{ ping }', operationName: 'Ping', variables: { id: 1 } });
  });
});

describe('url path and query sync', () => {
  it('extracts path tokens and keeps existing values', () => {
    expect(pathParamNames('https://api.local/users/:id/posts/:postId?x=1')).toEqual(['id', 'postId']);
    const synced = syncPathParams('/users/:id', [{ id: 'p', enabled: true, key: 'id', value: '9', description: '' }]);
    expect(synced).toEqual([{ id: 'p', enabled: true, key: 'id', value: '9', description: '' }]);
  });

  it('applies path values and rewrites the query string from the table', () => {
    const withPath = applyPathParams('https://api.local/users/:id?keep=1', [
      { id: 'p', enabled: true, key: 'id', value: '42', description: '' },
    ]);
    expect(withPath).toContain('/users/42');
    expect(applyQueryToUrl('https://api.local/users/42?old=1', [
      { id: 'q', enabled: true, key: 'q', value: 'a b', description: '' },
    ])).toBe('https://api.local/users/42?q=a%20b');
  });

  it('parses query params from the URL', () => {
    expect(parseQueryParams('https://api.local/x?a=1&b=two')).toMatchObject([
      { key: 'a', value: '1' },
      { key: 'b', value: 'two' },
    ]);
  });
});

describe('requestSectionSlideDir', () => {
  it('slides right when moving later in the tab list', () => {
    expect(requestSectionSlideDir('overview', 'body')).toBe('right');
    expect(requestSectionSlideDir('docs', 'params')).toBe('left');
  });
});

describe('requestResponseTabSlideDir', () => {
  it('slides right when moving later in the response tab list', () => {
    expect(requestResponseTabSlideDir('pretty', 'headers')).toBe('right');
    expect(requestResponseTabSlideDir('runs', 'raw')).toBe('left');
  });
});

describe('parseCurl', () => {
  it('imports method, url, headers, and body', () => {
    expect(looksLikeCurl('curl -X POST https://api.local/login -H "Content-Type: application/json" --data-raw \'{"a":1}\'')).toBe(true);
    const parsed = parseCurl(`curl -X POST 'https://api.local/login' -H 'Content-Type: application/json' --data-raw '{"a":1}'`);
    expect(parsed).toMatchObject({
      method: 'POST',
      url: 'https://api.local/login',
      body: '{"a":1}',
    });
    expect(parsed?.headers[0]).toMatchObject({ key: 'Content-Type', value: 'application/json' });
  });
});

describe('prettyBody', () => {
  it('formats json', () => {
    expect(prettyBody('{"a":1}', 'application/json')).toContain('\n');
  });
});
