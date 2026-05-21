import { describe, expect, it } from 'vitest';

import { formatRedirectTarget } from './format-redirect-target';

describe('formatRedirectTarget', () => {
  it('returns host and pathname', () => {
    expect(formatRedirectTarget('https://www.google.com/search?q=1')).toBe('www.google.com/search');
  });
});
