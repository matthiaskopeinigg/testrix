import { describe, expect, it } from 'vitest';

import { extractJsonPath, formatJsonPathResult } from './json-path';

describe('extractJsonPath', () => {
  const sample = { user: { id: 7, tags: ['a', 'b'], name: 'Ada' } };

  it('reads nested keys and indexes', () => {
    expect(extractJsonPath(sample, '$.user.id')).toBe(7);
    expect(extractJsonPath(sample, '$.user.tags[1]')).toBe('b');
    expect(extractJsonPath(sample, `$['user']['name']`)).toBe('Ada');
  });

  it('returns undefined for missing paths', () => {
    expect(extractJsonPath(sample, '$.user.missing')).toBeUndefined();
  });

  it('formats results', () => {
    expect(formatJsonPathResult('Ada')).toBe('Ada');
    expect(formatJsonPathResult(7)).toBe('7');
  });
});
