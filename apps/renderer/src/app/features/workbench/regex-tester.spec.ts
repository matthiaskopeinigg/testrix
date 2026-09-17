import { describe, expect, it } from 'vitest';

import { testRegex } from './regex-tester';

describe('testRegex', () => {
  it('lists matches and capture groups', () => {
    const result = testRegex('users/(\\d+)', ['g'], 'GET /v1/users/42 then users/7');
    expect(result.error).toBeNull();
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0]?.groups).toEqual(['42']);
    expect(result.segments.some((segment) => segment.isMatch)).toBe(true);
  });

  it('surfaces the engine message for invalid patterns', () => {
    const result = testRegex('(', [], 'abc');
    expect(result.matches).toEqual([]);
    expect(result.error).toMatch(/Unterminated|Invalid|missing/i);
  });
});
