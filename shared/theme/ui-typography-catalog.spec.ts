import { describe, expect, it } from 'vitest';

import { resolveUiTypographyTokens } from './ui-typography-catalog';

describe('ui-typography-catalog', () => {
  it('resolves size, weight, and line height tokens', () => {
    const tokens = resolveUiTypographyTokens('large', 'bold', 'relaxed');
    expect(tokens.rootFontSize).toBe('17.5px');
    expect(tokens.bodyWeight).toBe('700');
    expect(tokens.headingWeight).toBe('800');
    expect(tokens.lineHeight).toBe('1.65');
  });
});
