import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  COLLAB_RUN_FAILED_NAMES_MAX,
  COLLAB_SHARED_DIR,
  arbitrateCollabLock,
  collabLockPath,
  collabPresencePath,
  collabRunsPath,
  isCollabLockStale,
  isCollabPresenceActive,
  parseCollabLockFile,
  parseCollabPresenceFile,
  parseCollabRunsFile,
  shouldPruneCollabPresence,
  trimCollabRuns,
  type CollabLock,
  type CollabLockFile,
  type CollabLockVerdict,
  type CollabPresence,
  type CollabRunPublishRequest,
  type CollabRunRecord,
  type CollabRunSummary,
} from '@testrix/contracts';

import { parseJsonText, readJsonFile, writeJsonFile } from '../json-file';
import type { CollabPreferences } from './collab-credential-vault';

export interface SharedStateView {
  readonly presence: readonly CollabPresence[];
  readonly locks: readonly CollabLock[];
  readonly runs: readonly CollabRunSummary[];
}

const EMPTY_VIEW: SharedStateView = { presence: [], locks: [], runs: [] };

/** Kept under the active window so this device still reads as active to teammates. */
const COLLAB_PRESENCE_REFRESH_MS = 60_000;

/**
 * Presence, run locks, and published run results, all stored as files under
 * `.collab/shared` so they travel with the repository instead of a server.
 */
export class CollabSharedState {
  /**
   * Writes this device's heartbeat, or clears it while Appear offline is on. A fresh
   * heartbeat is left alone, so quiet ticks do not turn into a commit each time.
   */
  async heartbeat(
    dir: string,
    prefs: CollabPreferences,
    appVersion: string,
    now = Date.now(),
    workspaceName = '',
  ): Promise<void> {
    const filePath = abs(dir, collabPresencePath(prefs.deviceId));
    if (prefs.presenceMode === 'offline') {
      if (existsSync(filePath))
        await rm(filePath, { force: true });
      return;
    }
    const trimmedWorkspace = workspaceName.trim();
    const current = parseCollabPresenceFile(await readJsonFile(filePath));
    const isFresh =
      current !== null &&
      current.name === prefs.identity.name &&
      current.appVersion === appVersion &&
      (current.workspaceName ?? '') === trimmedWorkspace &&
      now - Date.parse(current.at) < COLLAB_PRESENCE_REFRESH_MS;
    if (isFresh)
      return;
    await writeJsonFile(filePath, {
      deviceId: prefs.deviceId,
      name: prefs.identity.name,
      at: new Date(now).toISOString(),
      appVersion,
      ...(trimmedWorkspace ? { workspaceName: trimmedWorkspace } : {}),
    });
  }

  /** Drops heartbeats nobody has refreshed for two weeks. */
  async prunePresence(dir: string, now = Date.now()): Promise<void> {
    const folder = abs(dir, `${COLLAB_SHARED_DIR}/presence`);
    for (const filePath of await listJson(folder)) {
      const presence = parseCollabPresenceFile(await readJsonFile(filePath));
      if (!presence || shouldPruneCollabPresence(presence.at, now))
        await rm(filePath, { force: true });
    }
  }

  async readLock(dir: string, packId: string): Promise<CollabLockFile | null> {
    return parseCollabLockFile(await readJsonFile(abs(dir, collabLockPath(packId))));
  }

  async writeLock(dir: string, lock: CollabLockFile): Promise<void> {
    await writeJsonFile(abs(dir, collabLockPath(lock.packId)), lock);
  }

  async deleteLock(dir: string, packId: string): Promise<void> {
    const filePath = abs(dir, collabLockPath(packId));
    if (existsSync(filePath))
      await rm(filePath, { force: true });
  }

  /** Releases every lock this device owns, used on disconnect and quit. */
  async releaseOwnLocks(dir: string, deviceId: string): Promise<string[]> {
    const released: string[] = [];
    for (const filePath of await listJson(abs(dir, `${COLLAB_SHARED_DIR}/locks`))) {
      const lock = parseCollabLockFile(await readJsonFile(filePath));
      if (lock?.deviceId !== deviceId)
        continue;
      await rm(filePath, { force: true });
      released.push(lock.packId);
    }
    return released;
  }

  verdict(remote: CollabLockFile | null, deviceId: string): CollabLockVerdict {
    return arbitrateCollabLock(remote, deviceId);
  }

  /** Appends a finished run to this device's file, newest first. */
  async publishRun(
    dir: string,
    prefs: CollabPreferences,
    request: CollabRunPublishRequest,
  ): Promise<void> {
    const filePath = abs(dir, collabRunsPath(prefs.deviceId));
    const file = parseCollabRunsFile(await readJsonFile(filePath), prefs.deviceId);
    const record: CollabRunRecord = {
      id: `${prefs.deviceId}-${request.packId}-${request.startedAt}`,
      packId: request.packId,
      packName: request.packName,
      owner: prefs.identity.name,
      deviceId: prefs.deviceId,
      environment: request.environment ?? null,
      status: request.status,
      startedAt: request.startedAt,
      finishedAt: request.finishedAt ?? new Date().toISOString(),
      durationMs: request.durationMs,
      passed: request.passed,
      failed: request.failed,
      total: request.total,
      failedNames: request.failedNames.slice(0, COLLAB_RUN_FAILED_NAMES_MAX),
    };
    await writeJsonFile(filePath, {
      deviceId: prefs.deviceId,
      runs: trimCollabRuns([record, ...file.runs]),
    });
  }

  /**
   * Applies the remote copy of every `.collab/shared` folder in the repository: presence
   * at the root, locks and runs inside each workspace folder. Every file has one owning
   * device, so this resolves mechanically: newer lock wins, and each device owns its own
   * presence and run files. Returns true when something on disk changed.
   */
  async mergeRemote(
    dir: string,
    remoteFiles: Readonly<Record<string, string>>,
    deviceId: string,
  ): Promise<boolean> {
    let wrote = false;
    const seenLocks = new Set<string>();
    for (const [file, text] of Object.entries(remoteFiles)) {
      const split = splitShared(file);
      if (!split)
        continue;
      const scopeDir = abs(dir, split.prefix);
      const parsed = parseJsonText(text, null);
      if (split.rest.startsWith('presence/')) {
        const presence = parseCollabPresenceFile(parsed);
        if (!presence || presence.deviceId === deviceId)
          continue;
        await writeJsonFile(abs(dir, file), presence);
        wrote = true;
        continue;
      }
      if (split.rest.startsWith('runs/')) {
        const runs = parseCollabRunsFile(parsed, 'remote');
        if (!runs.deviceId || runs.deviceId === deviceId)
          continue;
        await writeJsonFile(abs(dir, file), runs);
        wrote = true;
        continue;
      }
      if (split.rest.startsWith('locks/')) {
        const remote = parseCollabLockFile(parsed);
        if (!remote)
          continue;
        seenLocks.add(`${split.prefix}|${remote.packId}`);
        const mine = await this.readLock(scopeDir, remote.packId);
        if (mine && mine.deviceId === deviceId && remote.deviceId === deviceId)
          continue;
        if (!mine || Date.parse(remote.renewedAt) >= Date.parse(mine.renewedAt)) {
          await this.writeLock(scopeDir, remote);
          wrote = true;
        }
      }
    }
    // A lock the remote no longer has was released by its owner elsewhere.
    for (const prefix of await sharedScopes(dir)) {
      for (const filePath of await listJson(abs(abs(dir, prefix), `${COLLAB_SHARED_DIR}/locks`))) {
        const lock = parseCollabLockFile(await readJsonFile(filePath));
        if (!lock || lock.deviceId === deviceId || seenLocks.has(`${prefix}|${lock.packId}`))
          continue;
        await rm(filePath, { force: true });
        wrote = true;
      }
    }
    return wrote;
  }

  /** Releases this device's locks in every workspace folder of a repository clone. */
  async releaseOwnLocksEverywhere(dir: string, deviceId: string): Promise<string[]> {
    const released: string[] = [];
    for (const prefix of await sharedScopes(dir))
      released.push(...(await this.releaseOwnLocks(abs(dir, prefix), deviceId)));
    return released;
  }

  /** Everything the Collab panel shows about teammates. */
  async view(dir: string, prefs: CollabPreferences): Promise<SharedStateView> {
    if (!existsSync(abs(dir, COLLAB_SHARED_DIR)))
      return EMPTY_VIEW;
    const now = Date.now();
    const presence: CollabPresence[] = [];
    for (const filePath of await listJson(abs(dir, `${COLLAB_SHARED_DIR}/presence`))) {
      const entry = parseCollabPresenceFile(await readJsonFile(filePath));
      if (!entry)
        continue;
      presence.push({
        deviceId: entry.deviceId,
        name: entry.name,
        at: entry.at,
        isYou: entry.deviceId === prefs.deviceId,
        isActive: isCollabPresenceActive(entry.at, now),
        ...(entry.workspaceName ? { workspaceName: entry.workspaceName } : {}),
      });
    }
    const locks: CollabLock[] = [];
    for (const filePath of await listJson(abs(dir, `${COLLAB_SHARED_DIR}/locks`))) {
      const lock = parseCollabLockFile(await readJsonFile(filePath));
      if (!lock)
        continue;
      locks.push({
        packId: lock.packId,
        packName: lock.packName,
        owner: lock.owner,
        deviceId: lock.deviceId,
        environment: lock.environment,
        startedAt: lock.startedAt,
        renewedAt: lock.renewedAt,
        isMine: lock.deviceId === prefs.deviceId,
        isStale: isCollabLockStale(lock, now),
        completed: lock.completed,
        total: lock.total,
      });
    }
    const runs: CollabRunSummary[] = [];
    for (const filePath of await listJson(abs(dir, `${COLLAB_SHARED_DIR}/runs`))) {
      const file = parseCollabRunsFile(await readJsonFile(filePath), 'unknown');
      for (const run of file.runs) {
        runs.push({
          ...run,
          environment: run.environment,
          isMine: run.deviceId === prefs.deviceId,
        });
      }
    }
    return {
      presence: presence.sort(presenceOrder),
      locks,
      runs: runs.sort((left, right) => stamp(right) - stamp(left)).slice(0, 30),
    };
  }
}

function presenceOrder(left: CollabPresence, right: CollabPresence): number {
  if (left.isActive !== right.isActive)
    return left.isActive ? -1 : 1;
  return Date.parse(right.at) - Date.parse(left.at);
}

function stamp(run: CollabRunSummary): number {
  const value = Date.parse(run.finishedAt ?? run.startedAt);
  return Number.isFinite(value) ? value : 0;
}

async function listJson(folder: string): Promise<string[]> {
  try {
    const entries = await readdir(folder, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(folder, entry.name));
  } catch {
    return [];
  }
}

function abs(dir: string, relative: string): string {
  return relative ? path.join(dir, ...relative.split('/')) : dir;
}

/** `workspaces/a/.collab/shared/locks/x.json` → prefix `workspaces/a`, rest `locks/x.json`. */
function splitShared(file: string): { readonly prefix: string; readonly rest: string } | null {
  const marker = `${COLLAB_SHARED_DIR}/`;
  const index = file.indexOf(marker);
  if (index < 0 || (index > 0 && file[index - 1] !== '/'))
    return null;
  return { prefix: file.slice(0, Math.max(0, index - 1)), rest: file.slice(index + marker.length) };
}

/** The repository root plus every `workspaces/<folder>` that exists in the clone. */
async function sharedScopes(dir: string): Promise<string[]> {
  const scopes = [''];
  try {
    const entries = await readdir(path.join(dir, 'workspaces'), { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory())
        scopes.push(`workspaces/${entry.name}`);
    }
  } catch {
    // no workspace folders yet
  }
  return scopes;
}

