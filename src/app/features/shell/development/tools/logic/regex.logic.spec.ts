import { describe, expect, it } from 'vitest';

import { evaluateRegex } from './regex.logic';

describe('evaluateRegex', () => {
  it('finds global digit matches', () => {
    const result = evaluateRegex({
      pattern: '\\d+',
      flags: { g: true, i: false, m: false, s: false, u: false, y: false },
      sample: 'a1 b22',
      replacement: '',
    });
    expect(result.error).toBeNull();
    expect(result.matches.length).toBe(2);
    expect(result.matches[0]?.text).toBe('1');
    expect(result.matches[1]?.text).toBe('22');
  });
});
