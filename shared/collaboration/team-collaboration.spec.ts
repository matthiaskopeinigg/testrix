import { describe, expect, it } from 'vitest';

import { resolveShareScopeFileNames } from './share-scope-files';
import { DEFAULT_TEAM_SHARE_SCOPE } from './team-workspace.schema';
import { createDefaultTeamSyncStatus, deriveTeamSyncStatusId } from './team-sync-status.schema';

describe('share-scope-files', () => {
  it('maps enabled scopes to file names', () => {
    const files = resolveShareScopeFileNames(DEFAULT_TEAM_SHARE_SCOPE);
    expect(files).toContain('collections.json');
    expect(files).toContain('environments.json');
    expect(files).not.toContain('profiles.json');
  });
});

describe('team-sync-status', () => {
  it('creates not-configured default', () => {
    const status = createDefaultTeamSyncStatus();
    expect(status.status).toBe('not-configured');
    expect(status.authMethod).toBe('none');
    expect(status.authReady).toBe(false);
    expect(status.conflictedFiles).toEqual([]);
  });

  it('preserves synced after refresh derivation', () => {
    expect(
      deriveTeamSyncStatusId({
        current: { status: 'synced', lastSyncedAt: '2026-01-01T00:00:00.000Z' },
        enabled: true,
        remoteUrl: 'https://example.com/repo.git',
        primaryPending: 0,
        anyPending: false,
      }),
    ).toBe('synced');
  });

  it('does not downgrade failed status when idle derivation runs', () => {
    expect(
      deriveTeamSyncStatusId({
        current: { status: 'failed', lastSyncedAt: null },
        enabled: true,
        remoteUrl: 'https://example.com/repo.git',
        primaryPending: 0,
        anyPending: false,
      }),
    ).toBe('failed');
  });

  it('marks pending file changes as dirty', () => {
    expect(
      deriveTeamSyncStatusId({
        current: { status: 'synced', lastSyncedAt: '2026-01-01T00:00:00.000Z' },
        enabled: true,
        remoteUrl: 'https://example.com/repo.git',
        primaryPending: 1,
        anyPending: false,
      }),
    ).toBe('dirty');
  });
});
