import { describe, expect, it } from 'vitest';

import { loadTestsFileSchema } from '@shared/testing';

describe('load-tests.schema', () => {
  it('rejects nested folders at parse time', () => {
    expect(() =>
      loadTestsFileSchema.parse({
        schemaVersion: 1,
        items: [
          {
            id: 'outer',
            name: 'Outer',
            updatedAt: '2026-01-01T00:00:00.000Z',
            children: [
              {
                id: 'inner',
                name: 'Inner',
                updatedAt: '2026-01-01T00:00:00.000Z',
                children: [],
              },
            ],
          },
        ],
      }),
    ).toThrow(/only contain load test artifacts/i);
  });

  it('accepts root folder with artifact children', () => {
    const parsed = loadTestsFileSchema.parse({
      schemaVersion: 1,
      items: [
        {
          id: 'fld',
          name: 'Folder',
          updatedAt: '2026-01-01T00:00:00.000Z',
          children: [
            {
              id: 'a1',
              name: 'Test',
              description: '',
              docs: '',
              profile: { durationSec: 60, virtualUsers: 10, rampUpSec: 0 },
              thresholds: {},
              runs: [],
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        },
      ],
    });

    expect(parsed.items).toHaveLength(1);
  });

  it('accepts minSuccessRatePercent on thresholds', () => {
    const parsed = loadTestsFileSchema.parse({
      schemaVersion: 1,
      items: [
        {
          id: 'a1',
          name: 'Test',
          description: '',
          docs: '',
          profile: { durationSec: 60, virtualUsers: 10, rampUpSec: 0 },
          thresholds: { minSuccessRatePercent: 99.5 },
          runs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(parsed.items[0]).toMatchObject({
      thresholds: { minSuccessRatePercent: 99.5 },
    });
  });
});
