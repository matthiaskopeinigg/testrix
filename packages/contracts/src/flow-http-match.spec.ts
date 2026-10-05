import { describe, expect, it } from 'vitest';

import { flowHttpHitMatches, flowHttpUrlPath } from './flow-http-match';

describe('flowHttpUrlPath', () => {
  it('extracts pathname from absolute URLs', () => {
    expect(flowHttpUrlPath('https://a.example/v1/login?x=1')).toBe('/v1/login');
  });

  it('normalizes relative paths', () => {
    expect(flowHttpUrlPath('/api/items?q=1')).toBe('/api/items');
    expect(flowHttpUrlPath('api/items')).toBe('/api/items');
  });
});

describe('flowHttpHitMatches', () => {
  const hit = {
    method: 'POST',
    url: 'https://onewebbff.svc.magenta.at/v1/login/usernamepassword',
  };

  it('accepts any method and URL when filters are empty', () => {
    expect(flowHttpHitMatches(hit, {})).toBe(true);
    expect(flowHttpHitMatches(hit, { method: '*', url: '' })).toBe(true);
  });

  it('filters by method case-insensitively', () => {
    expect(flowHttpHitMatches(hit, { method: 'post' })).toBe(true);
    expect(flowHttpHitMatches(hit, { method: 'OPTIONS' })).toBe(false);
  });

  it('matches contains on the full URL', () => {
    expect(flowHttpHitMatches(hit, { match: 'contains', url: 'usernamepassword' })).toBe(true);
    expect(flowHttpHitMatches(hit, { match: 'contains', url: '/other' })).toBe(false);
  });

  it('matches equals on the full URL', () => {
    expect(flowHttpHitMatches(hit, { match: 'equals', url: hit.url })).toBe(true);
    expect(flowHttpHitMatches(hit, { match: 'equals', url: hit.url + '/' })).toBe(false);
  });

  it('matches path against pathname only', () => {
    expect(flowHttpHitMatches(hit, { match: 'path', url: '/v1/login' })).toBe(true);
    expect(flowHttpHitMatches(hit, { match: 'path', url: 'onewebbff' })).toBe(false);
  });

  it('matches regex on the full URL', () => {
    expect(flowHttpHitMatches(hit, { match: 'regex', url: '/v1/login/\\w+$' })).toBe(true);
    expect(flowHttpHitMatches(hit, { match: 'regex', url: '^http://' })).toBe(false);
  });

  it('rejects invalid regex patterns', () => {
    expect(flowHttpHitMatches(hit, { match: 'regex', url: '(unclosed' })).toBe(false);
  });
});
