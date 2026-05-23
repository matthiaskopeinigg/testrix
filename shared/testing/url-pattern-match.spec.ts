import { describe, expect, it } from 'vitest';

import { urlPatternMatches } from './url-pattern-match';

describe('urlPatternMatches', () => {
  it('matches wildcard patterns', () => {
    expect(urlPatternMatches('https://api.example.com/v1', '*')).toBe(true);
    expect(urlPatternMatches('https://api.example.com/v1', '**')).toBe(true);
  });

  it('matches prefix patterns', () => {
    expect(urlPatternMatches('https://api.example.com/v1/users', 'api.example.com/*')).toBe(true);
    expect(urlPatternMatches('https://other.com', 'api.example.com/*')).toBe(false);
  });

  it('matches substring patterns', () => {
    expect(urlPatternMatches('https://x.com/login/submit', 'submit')).toBe(true);
  });
});
