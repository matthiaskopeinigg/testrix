import { describe, expect, it } from 'vitest';

import { normalizeCaptureStartUrl } from './normalize-capture-start-url';

describe('normalizeCaptureStartUrl', () => {
  it('adds https and www for bare domains', () => {
    expect(
      normalizeCaptureStartUrl('google.at', {
        defaultUrlScheme: 'https',
        prependWwwOnSend: true,
      }),
    ).toBe('https://www.google.at');
  });

  it('preserves about:blank', () => {
    expect(normalizeCaptureStartUrl('about:blank')).toBe('about:blank');
  });

  it('returns about:blank for empty input', () => {
    expect(normalizeCaptureStartUrl('   ')).toBe('about:blank');
  });

  it('leaves explicit https URLs unchanged when www is not needed', () => {
    expect(
      normalizeCaptureStartUrl('https://api.example.com/v1', {
        defaultUrlScheme: 'https',
        prependWwwOnSend: true,
      }),
    ).toBe('https://api.example.com/v1');
  });
});
