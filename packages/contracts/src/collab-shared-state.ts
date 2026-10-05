import { z } from 'zod';

import { collabRunStatusSchema } from './collab';

/** Merge bases and unresolved reviews. Never committed. */
export const COLLAB_LOCAL_DIR = '.collab/local';

/** Presence, run locks, and published results. Committed and synced. */
export const COLLAB_SHARED_DIR = '.collab/shared';

/** A heartbeat newer than this counts as active now. */
export const COLLAB_PRESENCE_ACTIVE_MS = 90_000;

/** Heartbeats older than this are deleted on the next sync. */
export const COLLAB_PRESENCE_PRUNE_MS = 14 * 24 * 60 * 60 * 1000;

/** The run owner renews its lock on this cadence. */
export const COLLAB_LOCK_RENEW_MS = 30_000;

/** A lock that stopped renewing this long ago can be taken over. */
export const COLLAB_LOCK_STALE_MS = 180_000;

/** Published run summaries kept per device. */
export const COLLAB_RUNS_PER_DEVICE = 20;

export const collabPresenceFileSchema = z.object({
  deviceId: z.string().min(1),
  name: z.string().min(1),
  at: z.string().min(1),
  appVersion: z.string().default(''),
  workspaceName: z.string().optional(),
});

export type CollabPresenceFile = z.infer<typeof collabPresenceFileSchema>;

export const collabLockFileSchema = z.object({
  packId: z.string().min(1),
  packName: z.string().min(1),
  owner: z.string().min(1),
  deviceId: z.string().min(1),
  environment: z.string().nullable().default(null),
  startedAt: z.string().min(1),
  renewedAt: z.string().min(1),
  completed: z.number().int().min(0).default(0),
  total: z.number().int().min(0).default(0),
});

export type CollabLockFile = z.infer<typeof collabLockFileSchema>;

export const collabRunRecordSchema = z.object({
  id: z.string().min(1),
  packId: z.string().min(1),
  packName: z.string().min(1),
  owner: z.string().min(1),
  deviceId: z.string().min(1),
  environment: z.string().nullable().default(null),
  status: collabRunStatusSchema,
  startedAt: z.string().min(1),
  finishedAt: z.string().nullable().default(null),
  durationMs: z.number().int().min(0).default(0),
  passed: z.number().int().min(0).default(0),
  failed: z.number().int().min(0).default(0),
  total: z.number().int().min(0).default(0),
  failedNames: z.array(z.string()).default([]),
});

export type CollabRunRecord = z.infer<typeof collabRunRecordSchema>;

export const collabRunsFileSchema = z.object({
  deviceId: z.string().min(1),
  runs: z.array(collabRunRecordSchema).default([]),
});

export type CollabRunsFile = z.infer<typeof collabRunsFileSchema>;

/** Failing entry names carried in a published summary. */
export const COLLAB_RUN_FAILED_NAMES_MAX = 10;

export function collabPresencePath(deviceId: string): string {
  return `${COLLAB_SHARED_DIR}/presence/${safeSegment(deviceId)}.json`;
}

export function collabLockPath(packId: string): string {
  return `${COLLAB_SHARED_DIR}/locks/regression-${safeSegment(packId)}.json`;
}

export function collabRunsPath(deviceId: string): string {
  return `${COLLAB_SHARED_DIR}/runs/${safeSegment(deviceId)}.json`;
}

export function parseCollabPresenceFile(raw: unknown): CollabPresenceFile | null {
  const parsed = collabPresenceFileSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseCollabLockFile(raw: unknown): CollabLockFile | null {
  const parsed = collabLockFileSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function parseCollabRunsFile(raw: unknown, deviceId: string): CollabRunsFile {
  const parsed = collabRunsFileSchema.safeParse(raw);
  return parsed.success ? parsed.data : { deviceId, runs: [] };
}

export function isCollabPresenceActive(at: string, now = Date.now()): boolean {
  return ageMs(at, now) <= COLLAB_PRESENCE_ACTIVE_MS;
}

export function shouldPruneCollabPresence(at: string, now = Date.now()): boolean {
  return ageMs(at, now) > COLLAB_PRESENCE_PRUNE_MS;
}

export function isCollabLockStale(lock: CollabLockFile, now = Date.now()): boolean {
  return ageMs(lock.renewedAt, now) > COLLAB_LOCK_STALE_MS;
}

export type CollabLockVerdict = 'free' | 'mine' | 'stale' | 'held';

/**
 * Decides what a device may do with the lock it just fetched.
 * `stale` means the owner stopped renewing, so a takeover is offered.
 */
export function arbitrateCollabLock(
  remote: CollabLockFile | null,
  deviceId: string,
  now = Date.now(),
): CollabLockVerdict {
  if (!remote)
    return 'free';
  if (remote.deviceId === deviceId)
    return 'mine';
  return isCollabLockStale(remote, now) ? 'stale' : 'held';
}

/**
 * Newest run first, one device's history capped so the repository stays small.
 */
export function trimCollabRuns(
  runs: readonly CollabRunRecord[],
  max = COLLAB_RUNS_PER_DEVICE,
): CollabRunRecord[] {
  const byId = new Map<string, CollabRunRecord>();
  for (const run of runs)
    byId.set(run.id, run);
  return [...byId.values()]
    .sort((left, right) => sortKey(right) - sortKey(left))
    .slice(0, max);
}

function sortKey(run: CollabRunRecord): number {
  const stamp = Date.parse(run.finishedAt ?? run.startedAt);
  return Number.isFinite(stamp) ? stamp : 0;
}

function ageMs(at: string, now: number): number {
  const stamp = Date.parse(at);
  if (!Number.isFinite(stamp))
    return Number.POSITIVE_INFINITY;
  return Math.max(0, now - stamp);
}

function safeSegment(value: string): string {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'unknown';
}
