import { describe, expect, it } from 'vitest';

import {
  defaultFlowInterceptConfig,
  flowProxyHitMatches,
  parseFlowHttpStage,
  parseFlowInterceptAction,
  parseHeaderMap,
  parseHeaderNameList,
} from './flow-intercept';

describe('flow-intercept', () => {
  it('parses stage and action', () => {
    expect(parseFlowHttpStage('response')).toBe('response');
    expect(parseFlowHttpStage('other')).toBe('request');
    expect(parseFlowInterceptAction('mock')).toBe('mock');
    expect(parseFlowInterceptAction('block')).toBe('block');
    expect(parseFlowInterceptAction('x')).toBe('passthrough');
  });

  it('parses header maps and name lists', () => {
    expect(parseHeaderMap('{"X-A":"1"}')).toEqual({ 'X-A': '1' });
    expect(parseHeaderMap('[{"key":"X-B","value":"2","enabled":true}]')).toEqual({ 'X-B': '2' });
    expect(parseHeaderMap('not-json')).toEqual({});
    expect(parseHeaderNameList('A, B; C')).toEqual(['A', 'B', 'C']);
    expect(parseHeaderNameList('[{"key":"X-C","enabled":true}]')).toEqual(['X-C']);
  });

  it('matches optional header and body filters by stage', () => {
    const hit = {
      method: 'POST',
      url: 'https://example.com/api',
      headers: { 'content-type': 'application/json' },
      requestHeaders: { authorization: 'Bearer x' },
      body: '{"ok":true}',
      requestBody: '{"id":1}',
    };
    expect(
      flowProxyHitMatches(hit, {
        stage: 'request',
        method: 'POST',
        match: 'contains',
        url: '/api',
        headerName: 'authorization',
        headerValue: 'Bearer',
        bodyContains: '"id"',
      }),
    ).toBe(true);
    expect(
      flowProxyHitMatches(hit, {
        stage: 'response',
        method: 'POST',
        match: 'contains',
        url: '/api',
        headerName: 'content-type',
        bodyContains: '"ok"',
      }),
    ).toBe(true);
    expect(
      flowProxyHitMatches(hit, {
        stage: 'request',
        method: 'POST',
        match: 'contains',
        url: '/api',
        headerName: 'missing',
      }),
    ).toBe(false);
  });

  it('provides intercept defaults', () => {
    const cfg = defaultFlowInterceptConfig();
    expect(cfg.action).toBe('passthrough');
    expect(cfg.mockStatus).toBe(200);
  });
});
