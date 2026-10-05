import { describe, expect, it } from 'vitest';

import { normalizeFlowSection } from './flows-file';

describe('normalizeFlowSection', () => {
  it('keeps current section ids', () => {
    expect(normalizeFlowSection('design')).toBe('design');
    expect(normalizeFlowSection('data')).toBe('data');
    expect(normalizeFlowSection('history')).toBe('history');
    expect(normalizeFlowSection('settings')).toBe('settings');
    expect(normalizeFlowSection('docs')).toBe('docs');
  });

  it('maps legacy overview and steps onto design, runs onto history', () => {
    expect(normalizeFlowSection('overview')).toBe('design');
    expect(normalizeFlowSection('steps')).toBe('design');
    expect(normalizeFlowSection('runs')).toBe('history');
    expect(normalizeFlowSection(undefined)).toBe('design');
    expect(normalizeFlowSection('')).toBe('design');
  });
});
