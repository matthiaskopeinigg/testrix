import { describe, expect, it } from 'vitest';

import { loadTestsFileSchema } from '@shared/testing';

import {
  fromLoadTestTreeNodesWithExisting,
  toLoadTestTreeNodes,
} from './load-test-tree.adapter';

describe('load-test-tree.adapter', () => {
  it('round-trips artifacts preserving profile fields', () => {
    const file = loadTestsFileSchema.parse({
      schemaVersion: 1,
      items: [
        {
          id: 'a1',
          name: 'Checkout',
          description: 'Peak traffic',
          docs: 'Runbook',
          targetRequestId: 'req-1',
          profile: { durationSec: 120, virtualUsers: 50, rampUpSec: 10 },
          thresholds: { maxErrorRatePercent: 1 },
          scenarios: [{ id: 's1', name: 'Baseline', weight: 100, notes: '' }],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const tree = toLoadTestTreeNodes(file.items);
    const merged = fromLoadTestTreeNodesWithExisting(tree, file.items);

    expect(merged).toEqual(file.items);
  });

  it('maps folders with artifact children', () => {
    const file = loadTestsFileSchema.parse({
      schemaVersion: 1,
      items: [
        {
          id: 'fld-1',
          name: 'Smoke',
          children: [
            {
              id: 'a1',
              name: 'Health',
              description: '',
              docs: '',
              profile: { durationSec: 60, virtualUsers: 5, rampUpSec: 0 },
              thresholds: {},
              scenarios: [],
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const tree = toLoadTestTreeNodes(file.items);
    expect(tree[0].children?.[0].kind).toBe('artifact');
    expect(fromLoadTestTreeNodesWithExisting(tree, file.items)).toEqual(file.items);
  });
});
