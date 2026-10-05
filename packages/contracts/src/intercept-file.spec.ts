import { describe, expect, it } from 'vitest';

import { normalizeInterceptSection } from './intercept-file';

describe('normalizeInterceptSection', () => {
  it('keeps known sections', () => {
    expect(normalizeInterceptSection('match')).toBe('match');
    expect(normalizeInterceptSection('action')).toBe('action');
    expect(normalizeInterceptSection('activity')).toBe('activity');
  });

  it('maps legacy overview and hits to activity', () => {
    expect(normalizeInterceptSection('overview')).toBe('activity');
    expect(normalizeInterceptSection('hits')).toBe('activity');
  });

  it('falls back to match', () => {
    expect(normalizeInterceptSection('')).toBe('match');
    expect(normalizeInterceptSection(null)).toBe('match');
  });
});
