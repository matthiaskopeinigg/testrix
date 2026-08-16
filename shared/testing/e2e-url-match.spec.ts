import { describe, expect, it } from 'vitest';

import {
  e2eUrlMatchesExpectation,
  normalizePageUrlForE2e,
  resolveE2eUrlExpectation,
} from './e2e-url-match';

describe('resolveE2eUrlExpectation', () => {
  it('prefers the editor value over selector', () => {
    expect(resolveE2eUrlExpectation('#main', 'https://example.com/app')).toBe('https://example.com/app');
  });

  it('falls back to selector when value is empty', () => {
    expect(resolveE2eUrlExpectation('/checkout', '  ')).toBe('/checkout');
  });
});

describe('e2eUrlMatchesExpectation', () => {
  it('does not match an empty expectation', () => {
    expect(e2eUrlMatchesExpectation('https://example.com/app', '')).toBe(false);
  });

  it('matches a path substring on the live URL', () => {
    expect(e2eUrlMatchesExpectation('https://shop.example.com/checkout?x=1', '/checkout')).toBe(true);
  });

  it('matches www and trailing-slash variants after normalize', () => {
    expect(
      e2eUrlMatchesExpectation('https://www.example.com/app/', 'http://example.com/app'),
    ).toBe(true);
  });
});

describe('normalizePageUrlForE2e', () => {
  it('strips scheme, www, query, and trailing slash', () => {
    expect(normalizePageUrlForE2e('https://www.Example.com/app/?q=1')).toBe('example.com/app');
  });
});
