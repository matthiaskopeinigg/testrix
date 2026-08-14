import { describe, expect, it } from 'vitest';

import { tokenizeRedisQuery } from './tokenize-redis-query';

describe('tokenizeRedisQuery', () => {
  it('splits simple commands', () => {
    expect(tokenizeRedisQuery('GET mykey')).toEqual(['GET', 'mykey']);
  });

  it('preserves double-quoted values with spaces', () => {
    expect(tokenizeRedisQuery('SET testrix:demo:greeting "Hello from Testrix"')).toEqual([
      'SET',
      'testrix:demo:greeting',
      'Hello from Testrix',
    ]);
  });

  it('preserves single-quoted values', () => {
    expect(tokenizeRedisQuery("SET key 'a b c'")).toEqual(['SET', 'key', 'a b c']);
  });
});
