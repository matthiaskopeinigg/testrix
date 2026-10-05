import { describe, expect, it } from 'vitest';

import { normalizeMockSection } from './mocks-file';

describe('normalizeMockSection', () => {
  it('keeps known sections', () => {
    expect(normalizeMockSection('matchers')).toBe('matchers');
    expect(normalizeMockSection('response')).toBe('response');
    expect(normalizeMockSection('advanced')).toBe('advanced');
    expect(normalizeMockSection('activity')).toBe('activity');
  });

  it('falls back to matchers', () => {
    expect(normalizeMockSection('results')).toBe('matchers');
    expect(normalizeMockSection(null)).toBe('matchers');
  });
});
