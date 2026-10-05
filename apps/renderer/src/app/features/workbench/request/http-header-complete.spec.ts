import { describe, expect, it } from 'vitest';

import { headerGhost, suggestHeaderNames, suggestHeaderValues } from './http-header-complete';

describe('suggestHeaderNames', () => {
  it('filters by prefix and skips names already used on other rows', () => {
    const items = suggestHeaderNames('cont', ['Accept', 'Content-Length']);
    expect(items.map((item) => item.insert)).toContain('Content-Type');
    expect(items.map((item) => item.insert)).not.toContain('Content-Length');
    expect(items.map((item) => item.insert)).not.toContain('Accept');
  });

  it('lists common names when the query is empty', () => {
    const items = suggestHeaderNames('');
    expect(items.map((item) => item.insert)).toContain('Authorization');
    expect(items.map((item) => item.insert)).toContain('Content-Type');
  });

  it('adds a custom API key header name', () => {
    const items = suggestHeaderNames('api', [], ['Api-Token']);
    expect(items.map((item) => item.insert)).toContain('Api-Token');
  });
});

describe('suggestHeaderValues', () => {
  it('suggests JSON for Content-Type', () => {
    const items = suggestHeaderValues('Content-Type', 'app');
    expect(items.map((item) => item.insert)).toContain('application/json');
    expect(items.map((item) => item.insert)).not.toContain('text/plain');
  });

  it('returns nothing for an unknown header', () => {
    expect(suggestHeaderValues('X-Custom', 'a')).toEqual([]);
  });
});

describe('headerGhost', () => {
  it('fills the remainder of a prefix match', () => {
    expect(headerGhost('Cont', { insert: 'Content-Type', label: 'Content-Type', detail: 'Body media type' })).toEqual({
      pad: 'Cont',
      rest: 'ent-Type',
    });
  });
});
