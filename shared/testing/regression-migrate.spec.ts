import { describe, expect, it } from 'vitest';

import { migrateRegressionsFile } from './regression-migrate';

describe('migrateRegressionsFile', () => {
  it('passes through v2 files', () => {
    const file = {
      schemaVersion: 2 as const,
      items: [],
    };
    expect(migrateRegressionsFile(file)).toEqual(file);
  });

  it('defaults release to empty string on v2 artifact parse', () => {
    const v1 = {
      schemaVersion: 1 as const,
      items: [
        {
          id: 'rg-rel',
          name: 'Release test',
          description: '',
          flowIds: [],
          runs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    const migrated = migrateRegressionsFile(v1);
    expect(migrated.items[0]).toMatchObject({ release: '' });
  });

  it('migrates v1 flat items to v2 tree artifacts at root', () => {
    const v1 = {
      schemaVersion: 1 as const,
      items: [
        {
          id: 'rg-1',
          name: 'Smoke',
          description: 'Daily smoke',
          flowIds: ['flw-1'],
          runs: [],
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };

    const migrated = migrateRegressionsFile(v1);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.items).toHaveLength(1);
    const artifact = migrated.items[0];
    expect(artifact).toMatchObject({
      id: 'rg-1',
      name: 'Smoke',
      description: 'Daily smoke',
      flowIds: ['flw-1'],
    });
    expect('profile' in artifact && artifact.profile.executionMode).toBe('parallel');
    expect('thresholds' in artifact && artifact.thresholds.acceptancePercent).toBe(100);
  });

  it('returns empty v2 file for invalid input', () => {
    const migrated = migrateRegressionsFile({ invalid: true });
    expect(migrated).toEqual({ schemaVersion: 2, items: [] });
  });
});
