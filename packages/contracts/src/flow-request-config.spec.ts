import { describe, expect, it } from 'vitest';

import {
  flowRequestBodyFromConfig,
  flowRequestBodyHasContent,
  flowRequestHeaderPairs,
  interpolateFlowRequestBody,
  mergeFlowRequestContentType,
  normalizeFlowRequestBodyMode,
  normalizeFlowRequestSection,
  parseFlowRequestFormRows,
  parseFlowRequestKvRows,
  planFlowRequestEncodedBody,
  planFlowRequestUrl,
  serializeFlowRequestFormRows,
  serializeFlowRequestKvRows,
  syncFlowRequestPathParams,
} from './flow-request-config';

describe('flow-request-config', () => {
  it('parses and serializes kv rows', () => {
    const rows = parseFlowRequestKvRows(
      JSON.stringify([
        { id: 'h1', enabled: true, key: 'Accept', value: 'application/json', description: '' },
        { id: 'h2', enabled: false, key: 'X-Skip', value: '1', description: '' },
      ]),
    );
    expect(rows).toHaveLength(2);
    expect(serializeFlowRequestKvRows(rows)).toContain('"Accept"');
    expect(parseFlowRequestKvRows('not-json')).toEqual([]);
    expect(parseFlowRequestKvRows('')).toEqual([]);
  });

  it('plans a URL with path, query, and auto scheme', () => {
    expect(
      planFlowRequestUrl({
        url: 'api.example.com/users/:id',
        pathParams: [{ id: 'p1', enabled: true, key: 'id', value: '42', description: '' }],
        queryParams: [{ id: 'q1', enabled: true, key: 'limit', value: '10', description: '' }],
      }),
    ).toBe('https://api.example.com/users/42?limit=10');

    expect(planFlowRequestUrl({ url: '127.0.0.1:8080/health' })).toBe('http://127.0.0.1:8080/health');
    expect(planFlowRequestUrl({ url: 'google.com' })).toBe('https://google.com');
    expect(planFlowRequestUrl({ url: '{{base}}/x' })).toBe('{{base}}/x');
  });

  it('syncs path params from the URL and filters headers', () => {
    const synced = syncFlowRequestPathParams('https://api.local/orders/:orderId', [
      { id: 'p1', enabled: true, key: 'orderId', value: 'keep', description: '' },
    ]);
    expect(synced).toEqual([
      { id: 'p1', enabled: true, key: 'orderId', value: 'keep', description: '' },
    ]);

    expect(
      flowRequestHeaderPairs([
        { id: 'a', enabled: true, key: ' Accept ', value: '*/*', description: '' },
        { id: 'b', enabled: false, key: 'X-Off', value: '1', description: '' },
        { id: 'c', enabled: true, key: '', value: 'x', description: '' },
      ]),
    ).toEqual([{ key: 'Accept', value: '*/*' }]);
  });

  it('normalizes request section ids', () => {
    expect(normalizeFlowRequestSection('headers')).toBe('headers');
    expect(normalizeFlowRequestSection('mystery')).toBe('params');
  });

  it('builds and encodes typed bodies like the request tab', () => {
    expect(normalizeFlowRequestBodyMode(undefined, '')).toBe('none');
    expect(normalizeFlowRequestBodyMode(undefined, '{"a":1}')).toBe('json');
    expect(normalizeFlowRequestBodyMode('graphql')).toBe('graphql');

    const jsonBody = flowRequestBodyFromConfig({
      bodyMode: 'json',
      body: '{"id":{{userId}}}',
    });
    expect(jsonBody.mode).toBe('json');
    expect(flowRequestBodyHasContent(jsonBody)).toBe(true);

    const encoded = planFlowRequestEncodedBody(
      interpolateFlowRequestBody(jsonBody, (value) => value.replaceAll('{{userId}}', '9')),
    );
    expect(encoded.text).toBe('{"id":9}');
    expect(encoded.contentType).toBe('application/json');

    const formRows = parseFlowRequestFormRows(
      JSON.stringify([{ id: 'f1', enabled: true, key: 'q', value: 'hi', kind: 'text' }]),
    );
    expect(serializeFlowRequestFormRows(formRows)).toContain('"q"');
    const formEncoded = planFlowRequestEncodedBody(
      flowRequestBodyFromConfig({ bodyMode: 'urlencoded', formRows: serializeFlowRequestFormRows(formRows) }),
    );
    expect(formEncoded.text).toBe('q=hi');
    expect(formEncoded.contentType).toBe('application/x-www-form-urlencoded');

    expect(
      mergeFlowRequestContentType([{ key: 'Accept', value: '*/*' }], 'application/json'),
    ).toEqual([
      { key: 'Accept', value: '*/*' },
      { key: 'Content-Type', value: 'application/json' },
    ]);
    expect(
      mergeFlowRequestContentType([{ key: 'Content-Type', value: 'text/plain' }], 'application/json'),
    ).toEqual([{ key: 'Content-Type', value: 'text/plain' }]);
  });
});
