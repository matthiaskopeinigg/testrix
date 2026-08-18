import { describe, expect, it } from 'vitest';

import { createFlowStep, type TestSuiteFlow } from '@shared/testing';

import {
  buildFlowOverviewConfigCards,
  formatFlowDatasetSummary,
  formatFlowE2eSummary,
  formatFlowStepMix,
} from './flow-tab-overview-summary';

function flow(overrides: Partial<TestSuiteFlow> = {}): TestSuiteFlow {
  return {
    id: 'flow-1',
    name: 'Demo',
    description: '',
    tags: [],
    lastRunStatus: 'never',
    lastRunAt: null,
    nodes: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('flow-tab-overview-summary', () => {
  it('summarizes enabled step types', () => {
    expect(formatFlowStepMix([])).toBe('No enabled steps');
    expect(
      formatFlowStepMix([
        createFlowStep('REQUEST', 'Get'),
        createFlowStep('REQUEST', 'Post'),
        createFlowStep('VALIDATION', 'Check'),
      ]),
    ).toBe('3 steps · 2 HTTP · 1 validation');
  });

  it('labels datasets', () => {
    expect(formatFlowDatasetSummary(undefined)).toBe('Off');
    expect(formatFlowDatasetSummary({ enabled: true, rows: [] })).toBe('Enabled · no rows');
    expect(formatFlowDatasetSummary({ enabled: true, rows: [{ email: 'a' }] })).toBe('1 row');
    expect(
      formatFlowDatasetSummary({
        enabled: true,
        rows: [{ email: 'a' }, { email: 'b' }],
      }),
    ).toBe('2 rows');
  });

  it('labels E2E window options', () => {
    expect(formatFlowE2eSummary({}, false)).toBe('No E2E steps');
    expect(formatFlowE2eSummary({ e2eShowWindow: false }, true)).toBe('Hidden browser');
    expect(formatFlowE2eSummary({ e2eKeepWindowOpen: true }, true)).toBe('Show window · keep open');
    expect(formatFlowE2eSummary({}, true)).toBe('Show window · close after run');
  });

  it('builds jump cards for settings and steps', () => {
    const cards = buildFlowOverviewConfigCards(
      flow({
        isCritical: true,
        tags: ['shop'],
        dataset: { enabled: true, rows: [{ sku: 'a' }] },
        nodes: [createFlowStep('E2E', 'Open')],
      }),
      true,
    );
    expect(cards.map((card) => card.label)).toEqual(['Steps', 'Options', 'Dataset', 'E2E', 'Tags']);
    expect(cards[0]?.section).toBe('steps');
    expect(cards[1]?.value).toContain('Critical');
    expect(cards[2]?.value).toBe('1 row');
    expect(cards[4]?.value).toBe('shop');
  });
});
