import { describe, expect, it } from 'vitest';

import {
  COLLAB_LOCK_STALE_MS,
  COLLAB_PRESENCE_ACTIVE_MS,
  COLLAB_PRESENCE_PRUNE_MS,
  arbitrateCollabLock,
  collabLockPath,
  collabPresencePath,
  isCollabLockStale,
  isCollabPresenceActive,
  shouldPruneCollabPresence,
  trimCollabRuns,
  type CollabLockFile,
  type CollabRunRecord,
} from './collab-shared-state';

const NOW = Date.parse('2026-09-27T12:00:00.000Z');

function lock(patch: Partial<CollabLockFile> = {}): CollabLockFile {
  return {
    packId: 'pack_smoke',
    packName: 'Smoke pack',
    owner: 'Sam',
    deviceId: 'device-sam',
    environment: 'Staging',
    startedAt: new Date(NOW - 60_000).toISOString(),
    renewedAt: new Date(NOW - 10_000).toISOString(),
    completed: 12,
    total: 30,
    ...patch,
  };
}

function run(patch: Partial<CollabRunRecord> = {}): CollabRunRecord {
  return {
    id: 'run-1',
    packId: 'pack_smoke',
    packName: 'Smoke pack',
    owner: 'Sam',
    deviceId: 'device-sam',
    environment: null,
    status: 'passed',
    startedAt: new Date(NOW - 120_000).toISOString(),
    finishedAt: new Date(NOW - 60_000).toISOString(),
    durationMs: 60_000,
    passed: 30,
    failed: 0,
    total: 30,
    failedNames: [],
    ...patch,
  };
}

describe('collab presence freshness', () => {
  it('counts a recent heartbeat as active and an old one as away', () => {
    expect(isCollabPresenceActive(new Date(NOW - 5_000).toISOString(), NOW)).toBe(true);
    expect(isCollabPresenceActive(new Date(NOW - COLLAB_PRESENCE_ACTIVE_MS - 1_000).toISOString(), NOW)).toBe(false);
    expect(isCollabPresenceActive('not a date', NOW)).toBe(false);
  });

  it('prunes heartbeats nobody refreshed for two weeks', () => {
    expect(shouldPruneCollabPresence(new Date(NOW - 60_000).toISOString(), NOW)).toBe(false);
    expect(shouldPruneCollabPresence(new Date(NOW - COLLAB_PRESENCE_PRUNE_MS - 1_000).toISOString(), NOW)).toBe(true);
  });

  it('keeps one file per device', () => {
    expect(collabPresencePath('Device-AB12')).toBe('.collab/shared/presence/device-ab12.json');
    expect(collabLockPath('pack_smoke')).toBe('.collab/shared/locks/regression-pack_smoke.json');
  });
});

describe('arbitrateCollabLock', () => {
  it('lets a device claim a free pack', () => {
    expect(arbitrateCollabLock(null, 'device-me', NOW)).toBe('free');
  });

  it('recognizes this device as the owner', () => {
    expect(arbitrateCollabLock(lock({ deviceId: 'device-me' }), 'device-me', NOW)).toBe('mine');
  });

  it('blocks a pack a teammate is running', () => {
    expect(arbitrateCollabLock(lock(), 'device-me', NOW)).toBe('held');
  });

  it('offers a takeover once the owner stops renewing', () => {
    const stale = lock({ renewedAt: new Date(NOW - COLLAB_LOCK_STALE_MS - 1_000).toISOString() });
    expect(isCollabLockStale(stale, NOW)).toBe(true);
    expect(arbitrateCollabLock(stale, 'device-me', NOW)).toBe('stale');
  });
});

describe('trimCollabRuns', () => {
  it('keeps the newest runs and drops duplicates', () => {
    const older = run({ id: 'run-0', finishedAt: new Date(NOW - 600_000).toISOString() });
    const newer = run({ id: 'run-2', finishedAt: new Date(NOW - 10_000).toISOString() });
    const trimmed = trimCollabRuns([older, run(), newer, run()], 2);
    expect(trimmed.map((entry) => entry.id)).toEqual(['run-2', 'run-1']);
  });
});
