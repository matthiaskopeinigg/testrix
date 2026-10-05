import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { app } from 'electron';
import {
  COLLAB_LOCAL_DIR,
  COLLAB_MANIFEST_FILE,
  COLLAB_TEAM_FILES,
  COLLAB_WORKSPACES_DIR,
  IpcChannels,
  applyCollabReviewChoice,
  collabActivitySummary,
  collabChangeSummary,
  collabCommitBody,
  collabCommitMessage,
  collabFolderSlug,
  collabWorkspacePath,
  defaultCollabIdentity,
  localCollabStatus,
  mergeCollabDocument,
  mergeCollabManifest,
  parseCollabManifest,
  parseGitRemote,
  restoreCollabArtifacts,
  stripCollabArtifacts,
  upgradeLegacyCollabFiles,
  type CollabActivity,
  type CollabAddWorkspacesRequest,
  type CollabAttention,
  type CollabChange,
  type CollabConnectRequest,
  type CollabConnectResult,
  type CollabLock,
  type CollabLockRequest,
  type CollabLockResult,
  type CollabManifest,
  type CollabMutationResult,
  type CollabPresence,
  type CollabPublishWorkspaceRequest,
  type CollabRemoveFromRepoRequest,
  type CollabRepo,
  type CollabRepoSummary,
  type CollabRunPublishRequest,
  type CollabRunSummary,
  type CollabReview,
  type CollabStatus,
  type CollabSyncState,
  type Workspace,
  type WorkspaceSnapshot,
} from '@testrix/contracts';

import { appLogger } from '@testrix/electron-core';

import { detach } from '../../lifecycle';
import type { ConfigStore } from '../config.service';
import { readJsonFile, writeJsonFile } from '../json-file';
import type { CollabCredentialVault, CollabPreferences } from './collab-credential-vault';
import { CollabUserError } from './collab-errors';
import { CollabSharedState } from './collab-shared-state';
import { CollabSyncLoop } from './collab-sync-loop';
import { isSafeGitProxyUrl, type GitNetworkPrefs } from './git-cli';
import {
  isCollabAuthError,
  isCollabOfflineError,
  isCollabRejectedPush,
  isCollabStatePath,
  type WorkspaceGitHost,
  type GitAuth,
} from './workspace-git-host.service';
import {
  canonical,
  credentialHint,
  dedupeReviews,
  listFolders,
  manifestNote,
  parseJson,
  peopleFrom,
  readBaseFile,
  readManifest,
  readText,
  runActivityLine,
  writeManifest,
} from './collab-host-helpers';

/** Commit subject used when only presence, locks, or run results moved. */
const STATUS_COMMIT = 'Updated team status';

/** Subject of the commit that reorganizes a single-workspace repository. */
const ORGANIZE_COMMIT = 'Organized repository for multiple workspaces';

/** Repositories the active workspace does not live in sync at most this often. */
const BACKGROUND_REPO_INTERVAL_MS = 30_000;

/** Files that carry run output which never leaves this PC. */
const ARTIFACT_FILES = ['listeners.json', 'load.json', 'regressions.json'] as const;

interface FolderChanges {
  mine: CollabChange[];
  theirs: CollabChange[];
}

interface RemoteFiles {
  readonly oid: string;
  readonly files: Record<string, string>;
  readonly isLegacy: boolean;
}

/** What this PC knows about one connected repository between syncs. */
interface RepoRuntime {
  phase: CollabSyncState;
  lastError: string | null;
  authAttention: boolean;
  toolingAttention: boolean;
  reviews: CollabReview[];
  /** Keyed by workspace folder inside the repository. */
  changes: Map<string, FolderChanges>;
  activity: CollabActivity[];
  presence: readonly CollabPresence[];
  manifest: CollabManifest | null;
  /** Commit subject earned by a workspace being published, removed, or renamed. */
  note: string | null;
  noteIds: string[];
  busy: boolean;
  queued: boolean;
  lastRunAt: number;
}

/**
 * Keeps every connected repository in sync with its remote. One repository holds many
 * workspaces; this PC links the ones it picked. Team signals ride along: presence for
 * the whole repository, run locks and results per workspace.
 */
export class CollabHost {
  private readonly loop: CollabSyncLoop;
  private readonly shared = new CollabSharedState();
  private readonly runtimes = new Map<string, RepoRuntime>();
  private locks: readonly CollabLock[] = [];
  private runs: readonly CollabRunSummary[] = [];
  private suppress = 0;
  private watching = false;
  private latest: CollabStatus = localCollabStatus();

  constructor(
    private readonly store: ConfigStore,
    private readonly vault: CollabCredentialVault,
    private readonly git: WorkspaceGitHost,
    private readonly broadcast: (channel: string, payload?: unknown) => void,
  ) {
    this.loop = new CollabSyncLoop(() => {
      detach('collab:sync', this.syncDue());
    });
  }

  start(): void {
    this.loop.start();
    detach('collab:start', this.refreshTeamState().then(() => this.publish()));
  }

  async stop(): Promise<void> {
    this.loop.stop();
    const prefs = await this.preferences();
    for (const repo of this.store.collabRepos()) {
      try {
        const released = await this.shared.releaseOwnLocksEverywhere(this.store.repoDir(repo.id), prefs.deviceId);
        if (released.length > 0)
          await this.commitAndPush(repo.id, STATUS_COMMIT);
      } catch (error) {
        // A stale lock expires on its own, so quitting continues.
        appLogger.warn('collab:stop', `Could not release locks for ${repo.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  schedule(): void {
    if (this.suppress > 0)
      return;
    const repo = this.activeRepo();
    if (!repo || repo.sync === 'paused')
      return;
    this.loop.schedule();
  }

  async status(): Promise<CollabStatus> {
    return this.publish();
  }

  /** The dock being open tightens the sync interval. */
  setWatching(watching: boolean): CollabStatus {
    this.watching = watching;
    this.applyCadence();
    return this.latest;
  }

  /**
   * Connects a repository and reads which workspaces it holds. Nothing is added to the
   * switcher yet: the caller picks workspaces next, or publishes one.
   */
  async connectRepo(request: CollabConnectRequest): Promise<CollabConnectResult> {
    const remote = parseGitRemote(request.url);
    if (!remote)
      throw new CollabUserError('Enter a repository address, for example https://github.com/team/testing.git.');
    if (remote.transport === 'ssh' && !(await this.git.cliAvailable()))
      throw new CollabUserError('Install Git to use an SSH address, or paste the https address instead.', 'tooling');
    if (remote.transport === 'https' && request.username?.trim()) {
      await this.vault.setGit(remote.url, {
        username: request.username.trim(),
        password: request.password ?? '',
      });
    }
    const existing = this.store.collabRepoByUrl(remote.url);
    if (existing) {
      await this.syncRepo(existing.id, true);
      return { status: this.latest, repo: await this.summary(this.requireRepo(existing.id)) };
    }
    const branch = request.branch?.trim() || 'main';
    const id = this.store.newCollabRepoId();
    const dir = this.store.repoDir(id);
    try {
      await this.git.ensureRepo(dir, branch);
      await this.git.setRemote(dir, remote.url);
      try {
        await this.git.fetchFiles(dir, branch, remote.transport, this.networkPrefs(), await this.authFor(remote.url));
      } catch (error) {
        if (error instanceof CollabUserError)
          throw error;
        if (isCollabAuthError(error))
          throw new CollabUserError(credentialHint(remote.transport), 'auth');
        if (isCollabOfflineError(error))
          throw new CollabUserError('Could not reach that repository. Check the address and your connection.', 'offline');
        throw error;
      }
      await this.store.addCollabRepo({
        id,
        remoteUrl: remote.url,
        transport: remote.transport,
        branch,
        sync: 'auto',
        lastSyncAt: null,
        lastSyncOid: null,
      });
      await this.syncRepo(id, true);
      if (this.runtime(id).authAttention)
        throw new CollabUserError(credentialHint(remote.transport), 'auth');
      return { status: await this.publish(), repo: await this.summary(this.requireRepo(id)) };
    } catch (error) {
      this.runtimes.delete(id);
      if (this.store.collabRepo(id))
        await this.store.removeCollabRepo(id);
      else
        await rm(dir, { recursive: true, force: true });
      await this.publish();
      throw error;
    }
  }

  /** Adds picked repository workspaces to this PC and opens the first one. */
  async addWorkspaces(request: CollabAddWorkspacesRequest): Promise<CollabMutationResult<WorkspaceSnapshot>> {
    const repo = this.requireRepo(request.repoId);
    const manifest = await this.manifestFor(repo.id);
    const entries = manifest.workspaces.filter((entry) => request.remoteIds.includes(entry.id));
    if (entries.length === 0)
      throw new CollabUserError('Those workspaces are no longer in this repository. Sync, then try again.');
    let first: Workspace | null = null;
    await this.muted(async () => {
      for (const entry of entries) {
        const item = await this.store.linkWorkspace(repo.id, entry);
        first ??= item;
      }
      if (first)
        await this.store.switchWorkspace(first.id);
    });
    await this.refreshTeamState();
    return { status: await this.publish(), snapshot: this.store.workspaceSnapshot() };
  }

  /** Moves a local workspace into a repository so teammates can add it. */
  async publishWorkspace(request: CollabPublishWorkspaceRequest): Promise<CollabMutationResult<WorkspaceSnapshot>> {
    const repo = this.requireRepo(request.repoId);
    const item = this.store.workspaces.items.find((entry) => entry.id === request.workspaceId);
    if (!item)
      throw new CollabUserError('That workspace no longer exists.');
    if (item.kind === 'shared' && item.collab)
      throw new CollabUserError('This workspace is already in a repository.');
    const dir = this.store.repoDir(repo.id);
    const manifest = await readManifest(dir);
    const taken = [...manifest.workspaces.map((entry) => entry.folder), ...(await listFolders(dir))];
    const folder = collabFolderSlug(item.name, taken);
    const remoteId = `ws-${randomUUID().slice(0, 12)}`;
    await this.muted(async () => {
      await this.store.moveWorkspaceIntoRepo(item.id, repo.id, folder, remoteId);
    });
    const next: CollabManifest = {
      ...manifest,
      workspaces: [...manifest.workspaces, { id: remoteId, name: item.name, folder }],
    };
    await writeManifest(dir, next);
    this.runtime(repo.id).manifest = next;
    await this.syncRepo(repo.id, true);
    return { status: this.latest, snapshot: this.store.workspaceSnapshot() };
  }

  /** Takes a workspace off this PC. The repository and teammates keep it. */
  async removeFromPc(workspaceId: string): Promise<CollabMutationResult<WorkspaceSnapshot>> {
    const item = this.store.workspaces.items.find((entry) => entry.id === workspaceId);
    const repoId = item?.kind === 'shared' ? item.collab?.repoId : undefined;
    if (!item || !repoId)
      throw new CollabUserError('That workspace is not in a repository.');
    const prefs = await this.preferences();
    const released = await this.shared.releaseOwnLocks(this.store.workspaceDir(item), prefs.deviceId);
    let snapshot: WorkspaceSnapshot | null = null;
    await this.muted(async () => {
      snapshot = await this.store.unlinkWorkspace(workspaceId);
    });
    if (released.length > 0) {
      try {
        await this.commitAndPush(repoId, STATUS_COMMIT);
      } catch {
        // the lock expires on its own if this push cannot land
      }
    }
    await this.refreshTeamState();
    return { status: await this.publish(), snapshot };
  }

  /**
   * Removes a workspace from the repository for everyone. This PC keeps a local copy;
   * teammates who had added it keep theirs as local workspaces too.
   */
  async removeFromRepo(request: CollabRemoveFromRepoRequest): Promise<CollabMutationResult<WorkspaceSnapshot>> {
    const repo = this.requireRepo(request.repoId);
    const dir = this.store.repoDir(repo.id);
    const manifest = await readManifest(dir);
    const entry = manifest.workspaces.find((item) => item.id === request.remoteId);
    if (!entry)
      throw new CollabUserError('That workspace is no longer in this repository.');
    const linked = this.store.linkedWorkspaces(repo.id).find((item) => item.collab?.remoteId === entry.id);
    await this.muted(async () => {
      if (linked)
        await this.store.detachWorkspace(linked.id);
    });
    const next: CollabManifest = {
      ...manifest,
      workspaces: manifest.workspaces.filter((item) => item.id !== entry.id),
    };
    await writeManifest(dir, next);
    this.runtime(repo.id).manifest = next;
    await rm(path.join(dir, COLLAB_WORKSPACES_DIR, entry.folder), { recursive: true, force: true });
    await this.syncRepo(repo.id, true);
    return { status: this.latest, snapshot: this.store.workspaceSnapshot() };
  }

  /** Stops syncing a repository. Its workspaces stay on this PC as local copies. */
  async disconnectRepo(repoId: string): Promise<CollabMutationResult<WorkspaceSnapshot>> {
    const repo = this.store.collabRepo(repoId);
    if (!repo)
      return { status: await this.publish(), snapshot: this.store.workspaceSnapshot() };
    const prefs = await this.preferences();
    const released = await this.shared.releaseOwnLocksEverywhere(this.store.repoDir(repoId), prefs.deviceId);
    if (released.length > 0) {
      try {
        await this.commitAndPush(repoId, STATUS_COMMIT);
      } catch {
        // the lock expires on its own if this push cannot land
      }
    }
    await this.muted(async () => {
      for (const item of this.store.linkedWorkspaces(repoId))
        await this.store.detachWorkspace(item.id);
    });
    await this.store.removeCollabRepo(repoId);
    this.runtimes.delete(repoId);
    await this.refreshTeamState();
    return { status: await this.publish(), snapshot: this.store.workspaceSnapshot() };
  }

  async pause(repoId?: string): Promise<CollabStatus> {
    const repo = this.repoFor(repoId);
    if (repo) {
      await this.store.patchCollabRepo(repo.id, { sync: 'paused' });
      this.runtime(repo.id).phase = 'paused';
    }
    return this.publish();
  }

  async resume(repoId?: string): Promise<CollabStatus> {
    const repo = this.repoFor(repoId);
    if (!repo)
      return this.publish();
    await this.store.patchCollabRepo(repo.id, { sync: 'auto' });
    this.runtime(repo.id).phase = 'idle';
    return this.syncRepo(repo.id, true);
  }

  async setBranch(branch: string, repoId?: string): Promise<CollabStatus> {
    const repo = this.repoFor(repoId);
    const next = branch.trim();
    if (!repo || !next || next === repo.branch)
      return this.publish();
    await this.store.patchCollabRepo(repo.id, { branch: next, lastSyncOid: null, lastSyncAt: null });
    return this.syncRepo(repo.id, true);
  }

  async setIdentity(name: string, email?: string): Promise<CollabStatus> {
    const identity = defaultCollabIdentity(name);
    await this.vault.setIdentity({
      name: identity.name,
      email: email?.trim() || identity.email,
    });
    return this.publish();
  }

  async forgetCredential(repoId?: string): Promise<CollabStatus> {
    const repo = this.repoFor(repoId);
    if (repo) {
      await this.vault.setGit(repo.remoteUrl, null);
      this.runtime(repo.id).authAttention = false;
    }
    return this.publish();
  }

  /** Writes a new username and token for an existing repository, then syncs. */
  async updateCredential(request: {
    readonly repoId?: string;
    readonly username: string;
    readonly password: string;
  }): Promise<CollabStatus> {
    const repo = this.repoFor(request.repoId);
    if (!repo)
      return this.publish();
    if (repo.transport !== 'https')
      throw new CollabUserError('This repository uses SSH keys, not an access token.');
    await this.vault.setGit(repo.remoteUrl, {
      username: request.username.trim(),
      password: request.password,
    });
    this.runtime(repo.id).authAttention = false;
    return this.syncRepo(repo.id, true);
  }

  async setPresenceMode(mode: 'active' | 'offline'): Promise<CollabStatus> {
    await this.vault.setPresenceMode(mode);
    const prefs = await this.preferences();
    const workspaceName = this.store.activeWorkspace()?.name ?? '';
    for (const repo of this.store.collabRepos())
      await this.shared.heartbeat(this.store.repoDir(repo.id), prefs, app.getVersion(), Date.now(), workspaceName);
    if (this.store.collabRepos().length > 0)
      this.loop.poke();
    return this.publish();
  }

  async setShareRuns(enabled: boolean): Promise<CollabStatus> {
    await this.vault.setShareRuns(enabled);
    return this.publish();
  }

  /** Syncs one repository now, the active workspace's by default. */
  async syncNow(manual = true, repoId?: string): Promise<CollabStatus> {
    const repo = this.repoFor(repoId);
    if (!repo)
      return this.publish();
    return this.syncRepo(repo.id, manual);
  }

  async resolve(id: string, choice: 'ours' | 'theirs'): Promise<CollabMutationResult<WorkspaceSnapshot>> {
    for (const [repoId, runtime] of this.runtimes) {
      const review = runtime.reviews.find((item) => item.id === id);
      if (!review)
        continue;
      const filePath = path.join(this.store.repoDir(repoId), ...review.file.split('/'));
      const current = (await readJsonFile(filePath)) ?? {};
      const chosen = choice === 'ours' ? review.ours : review.theirs;
      await writeJsonFile(filePath, applyCollabReviewChoice(current, review.itemId, chosen));
      runtime.reviews = runtime.reviews.filter((item) => item.id !== id);
      await this.persistReviews(repoId);
      if (this.activeRepo()?.id === repoId) {
        await this.muted(async () => {
          await this.store.reloadActiveWorkspace();
        });
      }
      if (runtime.reviews.length === 0)
        await this.syncRepo(repoId, true);
      break;
    }
    return { status: await this.publish(), snapshot: this.store.workspaceSnapshot() };
  }

  /**
   * Claims the pack so two people cannot run it at once. A free or already-mine
   * lock succeeds; a live lock elsewhere fails with the owner's name.
   */
  async acquireLock(request: CollabLockRequest, takeOver = false): Promise<CollabLockResult> {
    const context = this.activeContext();
    if (!context)
      return { ok: true, lock: null, message: null };
    const { repo, workspaceDir } = context;
    const prefs = await this.preferences();
    try {
      await this.fetchShared(repo, prefs);
    } catch {
      // offline: fall through and claim locally
    }
    const remote = await this.shared.readLock(workspaceDir, request.packId);
    const verdict = this.shared.verdict(remote, prefs.deviceId);
    if (verdict === 'held' && !takeOver) {
      await this.refreshTeamState();
      await this.publish();
      return {
        ok: false,
        lock: this.locks.find((lock) => lock.packId === request.packId) ?? null,
        message: `${remote?.owner ?? 'Someone'} is running this pack.`,
      };
    }
    const now = new Date().toISOString();
    await this.shared.writeLock(workspaceDir, {
      packId: request.packId,
      packName: request.packName,
      owner: prefs.identity.name,
      deviceId: prefs.deviceId,
      environment: request.environment ?? null,
      startedAt: now,
      renewedAt: now,
      completed: 0,
      total: 0,
    });
    try {
      await this.commitAndPush(repo.id, STATUS_COMMIT);
    } catch (error) {
      if (isCollabRejectedPush(error)) {
        // Someone pushed a lock for this pack first: their claim wins.
        await this.fetchShared(repo, prefs);
        const winner = await this.shared.readLock(workspaceDir, request.packId);
        if (winner && winner.deviceId !== prefs.deviceId && !takeOver) {
          await this.refreshTeamState();
          await this.publish();
          return {
            ok: false,
            lock: this.locks.find((lock) => lock.packId === request.packId) ?? null,
            message: `${winner.owner} is running this pack.`,
          };
        }
      }
      // Offline or a rejected push we already re-checked: keep the local claim.
    }
    await this.refreshTeamState();
    await this.publish();
    return {
      ok: true,
      lock: this.locks.find((lock) => lock.packId === request.packId) ?? null,
      message: null,
    };
  }

  async takeOverLock(request: CollabLockRequest): Promise<CollabLockResult> {
    return this.acquireLock(request, true);
  }

  /** Keeps a live run's lock fresh and publishes its progress counts. */
  async renewLock(packId: string, completed: number, total: number): Promise<void> {
    const context = this.activeContext();
    if (!context)
      return;
    const prefs = await this.preferences();
    const lock = await this.shared.readLock(context.workspaceDir, packId);
    if (!lock || lock.deviceId !== prefs.deviceId)
      return;
    await this.shared.writeLock(context.workspaceDir, {
      ...lock,
      renewedAt: new Date().toISOString(),
      completed,
      total,
    });
    this.loop.schedule();
  }

  async releaseLock(packId: string): Promise<CollabStatus> {
    const context = this.activeContext();
    if (!context)
      return this.publish();
    const prefs = await this.preferences();
    const lock = await this.shared.readLock(context.workspaceDir, packId);
    if (lock && lock.deviceId !== prefs.deviceId)
      return this.publish();
    await this.shared.deleteLock(context.workspaceDir, packId);
    await this.refreshTeamState();
    this.loop.poke();
    return this.publish();
  }

  async publishRun(request: CollabRunPublishRequest): Promise<CollabStatus> {
    const context = this.activeContext();
    if (!context)
      return this.publish();
    const prefs = await this.preferences();
    if (!prefs.shareRuns)
      return this.publish();
    await this.shared.publishRun(context.workspaceDir, prefs, request);
    await this.refreshTeamState();
    this.loop.poke();
    return this.publish();
  }

  /** Loop tick: the active repository every time, the others on a slower beat. */
  private async syncDue(): Promise<void> {
    const activeId = this.activeRepo()?.id ?? null;
    const now = Date.now();
    for (const repo of this.store.collabRepos()) {
      const runtime = this.runtime(repo.id);
      if (repo.id === activeId || now - runtime.lastRunAt >= BACKGROUND_REPO_INTERVAL_MS)
        await this.syncRepo(repo.id, false);
    }
  }

  private async syncRepo(repoId: string, manual: boolean): Promise<CollabStatus> {
    const repo = this.store.collabRepo(repoId);
    if (!repo)
      return this.publish();
    const runtime = this.runtime(repoId);
    if (runtime.busy) {
      runtime.queued = true;
      return this.latest;
    }
    if (repo.sync === 'paused' && !manual) {
      runtime.phase = 'paused';
      return this.publish();
    }
    runtime.busy = true;
    runtime.lastError = null;
    runtime.lastRunAt = Date.now();
    // Background checks stay quiet until the merge finds team work to move.
    if (manual)
      await this.showSyncing(runtime);
    try {
      if (this.activeRepo()?.id === repoId) {
        await this.muted(async () => {
          await this.store.flushWorkspace();
        });
      }
      await this.runSync(repoId);
      if (runtime.reviews.length > 0 || runtime.authAttention || runtime.toolingAttention)
        runtime.phase = 'attention';
      else
        runtime.phase = this.store.collabRepo(repoId)?.sync === 'paused' ? 'paused' : 'idle';
    } catch (error) {
      noteFailure(runtime, error);
    } finally {
      runtime.busy = false;
      if (this.store.collabRepo(repoId)) {
        await this.persistReviews(repoId);
        await this.refreshTeamState();
      }
      await this.publish();
      if (runtime.queued) {
        runtime.queued = false;
        this.loop.schedule();
      }
    }
    return this.latest;
  }

  private async runSync(repoId: string): Promise<void> {
    const repo = this.requireRepo(repoId);
    const runtime = this.runtime(repoId);
    const dir = this.store.repoDir(repoId);
    const prefs = await this.preferences();
    await this.git.ensureRepo(dir, repo.branch);
    await this.git.setRemote(dir, repo.remoteUrl);
    await this.shared.heartbeat(
      dir,
      prefs,
      app.getVersion(),
      Date.now(),
      this.store.activeWorkspace()?.name ?? '',
    );
    await this.shared.prunePresence(dir);
    const remote = await this.fetchShared(repo, prefs);
    if (
      remote?.oid &&
      remote.oid === repo.lastSyncOid &&
      !(await this.git.hasTeamChanges(dir))
    ) {
      runtime.presence = (await this.shared.view(dir, prefs)).presence;
      await this.loadActivity(repoId, prefs);
      return;
    }
    runtime.authAttention = false;
    runtime.toolingAttention = false;
    const hasTeamWork = await this.mergeRepo(repoId, remote);
    if (runtime.reviews.length === 0) {
      const organized = this.store.consumeRepoMigration(repoId) || Boolean(remote?.isLegacy);
      if (hasTeamWork || organized)
        await this.showSyncing(runtime);
      const oid = await this.commitAndPush(repoId, this.commitMessage(runtime, organized), {
        // Unchanged team files match HEAD already, so only shared state can differ.
        isStateOnly: !hasTeamWork && !organized,
      });
      const synced = this.requireRepo(repoId);
      if (oid) {
        await this.writeBase(repoId);
        await this.touchSync(repoId, oid);
        for (const changes of runtime.changes.values())
          changes.mine = [];
        runtime.note = null;
        runtime.noteIds = [];
      } else if (remote?.oid && remote.oid !== synced.lastSyncOid) {
        // Nothing of ours to send: record that we are level with the remote.
        await this.writeBase(repoId);
        await this.touchSync(repoId, remote.oid);
      }
    }
    runtime.presence = (await this.shared.view(dir, prefs)).presence;
    await this.loadActivity(repoId, prefs);
  }

  private async fetchShared(repo: CollabRepo, prefs: CollabPreferences): Promise<RemoteFiles | null> {
    const dir = this.store.repoDir(repo.id);
    const remote = await this.git.fetchFiles(
      dir,
      repo.branch,
      repo.transport,
      this.networkPrefs(),
      await this.authFor(repo.remoteUrl),
    );
    if (!remote)
      return null;
    const upgraded = upgradeLegacyCollabFiles(remote.files, parseGitRemote(repo.remoteUrl)?.repo ?? 'Workspace');
    await this.shared.mergeRemote(dir, upgraded.files, prefs.deviceId);
    return { oid: remote.oid, files: upgraded.files, isLegacy: upgraded.isLegacy };
  }

  private async showSyncing(runtime: RepoRuntime): Promise<void> {
    if (runtime.phase === 'syncing')
      return;
    runtime.phase = 'syncing';
    await this.publish();
  }

  /**
   * Merges the workspace list, then three-way merges every team file of every workspace
   * in it. Workspaces this PC has not added are never edited here, so they simply take
   * the remote version. Conflicted files stay out of the next push until reviewed.
   * Returns true when a team file or the workspace list changed on either side.
   */
  private async mergeRepo(repoId: string, remote: RemoteFiles | null): Promise<boolean> {
    const repo = this.requireRepo(repoId);
    const runtime = this.runtime(repoId);
    const dir = this.store.repoDir(repoId);
    const remoteFiles = remote?.files ?? {};
    const remoteOid = remote?.oid ?? '';
    const baseOid = repo.lastSyncOid ?? '';
    const remoteMoved = Boolean(remoteOid) && remoteOid !== baseOid;

    const baseManifestText = await readBaseFile(dir, COLLAB_MANIFEST_FILE);
    const baseManifest = baseManifestText ? parseCollabManifest(parseJson(baseManifestText)) : null;
    const ours = this.withLocalNames(repoId, await readManifest(dir));
    const theirsText = remoteFiles[COLLAB_MANIFEST_FILE];
    const theirs = remoteMoved && theirsText !== undefined ? parseCollabManifest(parseJson(theirsText)) : null;
    const merged = theirs ? mergeCollabManifest(baseManifest, ours, theirs) : ours;
    const note = manifestNote(baseManifest, ours, theirs);
    runtime.note = note?.subject ?? null;
    runtime.noteIds = note?.ids ?? [];
    await writeManifest(dir, merged);
    runtime.manifest = merged;
    await this.applyManifest(repoId, merged);

    const held = new Set(runtime.reviews.map((review) => review.file));
    const nextReviews: CollabReview[] = [...runtime.reviews];
    const author = remoteOid ? (await this.git.readCommitMeta(dir, remoteOid))?.author ?? null : null;
    const activeFolder = this.activeFolder(repoId);
    let wroteActive = false;
    let hasTeamWork = note !== null;
    for (const entry of merged.workspaces) {
      const workspaceDir = path.join(dir, COLLAB_WORKSPACES_DIR, entry.folder);
      const mine: CollabChange[] = [];
      const theirsChanges: CollabChange[] = [];
      for (const name of COLLAB_TEAM_FILES) {
        const repoPath = collabWorkspacePath(entry.folder, name);
        if (held.has(repoPath))
          continue;
        const fullText = await readText(path.join(workspaceDir, name));
        const oursText = fullText === null ? undefined : JSON.stringify(stripCollabArtifacts(name, parseJson(fullText)));
        const baseText = (await readBaseFile(dir, repoPath)) ?? undefined;
        const theirsFile = remoteFiles[repoPath];
        const theirsText = theirsFile === undefined ? undefined : canonical(theirsFile);
        if (oursText === undefined && theirsText === undefined)
          continue;
        // A file missing here was never written on this PC; it cannot delete the team's copy.
        const effectiveOurs = oursText ?? baseText;
        const dirty = oursText !== undefined && oursText !== baseText;
        const moved = remoteMoved && theirsText !== undefined && theirsText !== baseText;
        if (!dirty && !moved)
          continue;
        hasTeamWork = true;
        const base = parseJson(baseText);
        const oursValue = parseJson(effectiveOurs);
        const theirsValue = parseJson(theirsText ?? effectiveOurs);
        if (dirty)
          mine.push(...collabChangeSummary(name, base, oursValue));
        if (moved)
          theirsChanges.push(...collabChangeSummary(name, base, theirsValue, author ?? undefined));
        const result = mergeCollabDocument(name, base, oursValue, theirsValue, {
          author,
          at: new Date().toISOString(),
        });
        await writeJsonFile(
          path.join(workspaceDir, name),
          restoreCollabArtifacts(name, result.value, parseJson(fullText)),
        );
        if (entry.folder === activeFolder)
          wroteActive = true;
        if (result.conflicts.length > 0) {
          nextReviews.push(
            ...result.conflicts.map((review) => ({
              ...review,
              id: `${repoPath}:${review.itemId}`,
              file: repoPath,
            })),
          );
          held.add(repoPath);
        }
      }
      const previous = runtime.changes.get(entry.folder);
      runtime.changes.set(entry.folder, {
        mine,
        theirs: theirsChanges.length > 0 || remoteMoved ? theirsChanges : previous?.theirs ?? [],
      });
    }
    runtime.reviews = dedupeReviews(nextReviews);
    if (wroteActive) {
      await this.muted(async () => {
        await this.store.reloadActiveWorkspace();
      });
    }
    return hasTeamWork;
  }

  /**
   * Brings this PC in line with the merged workspace list: linked workspaces the team
   * removed become local copies, folders that left the repository are deleted, and
   * renames carry into the switcher.
   */
  private async applyManifest(repoId: string, manifest: CollabManifest): Promise<void> {
    const dir = this.store.repoDir(repoId);
    const ids = new Set(manifest.workspaces.map((entry) => entry.id));
    await this.muted(async () => {
      for (const item of this.store.linkedWorkspaces(repoId)) {
        if (item.collab && !ids.has(item.collab.remoteId))
          await this.store.detachWorkspace(item.id);
      }
      for (const entry of manifest.workspaces)
        await this.store.renameLinkedWorkspace(repoId, entry.id, entry.name);
    });
    const folders = new Set(manifest.workspaces.map((entry) => entry.folder));
    for (const folder of await listFolders(dir)) {
      if (!folders.has(folder))
        await rm(path.join(dir, COLLAB_WORKSPACES_DIR, folder), { recursive: true, force: true });
    }
  }

  /** A workspace renamed in this PC's switcher renames it in the repository too. */
  private withLocalNames(repoId: string, manifest: CollabManifest): CollabManifest {
    const names = new Map(
      this.store.linkedWorkspaces(repoId).map((item) => [item.collab?.remoteId ?? '', item.name]),
    );
    return {
      ...manifest,
      workspaces: manifest.workspaces.map((entry) => {
        const name = names.get(entry.id)?.trim();
        return name && name !== entry.name ? { ...entry, name } : entry;
      }),
    };
  }

  private commitMessage(runtime: RepoRuntime, organized: boolean): string {
    const manifest = runtime.manifest ?? { schemaVersion: 1, workspaces: [] };
    const touched = manifest.workspaces.filter((entry) => (runtime.changes.get(entry.folder)?.mine.length ?? 0) > 0);
    const files = [
      ...new Set(touched.flatMap((entry) => runtime.changes.get(entry.folder)?.mine.map((change) => change.file) ?? [])),
    ];
    const subject = organized
      ? ORGANIZE_COMMIT
      : runtime.note ?? (files.length > 0 ? collabCommitMessage(files) : STATUS_COMMIT);
    const ids = [...new Set([...touched.map((entry) => entry.id), ...runtime.noteIds])];
    return ids.length > 0 ? `${subject}\n\n${collabCommitBody(ids)}` : subject;
  }

  /**
   * Commits the tree with run logs stripped and pushes it. Returns the new oid,
   * or null when there was nothing to send.
   */
  private async commitAndPush(
    repoId: string,
    message: string,
    { isStateOnly = false }: { readonly isStateOnly?: boolean } = {},
  ): Promise<string | null> {
    const repo = this.requireRepo(repoId);
    const dir = this.store.repoDir(repoId);
    await this.alignToFetchedTip(dir, repo.branch);
    const oid = isStateOnly ? await this.commitState(repoId, message) : await this.commitStripped(repoId, message);
    if (!oid)
      return null;
    const auth = await this.authFor(repo.remoteUrl);
    try {
      await this.git.push(dir, repo.branch, repo.transport, this.networkPrefs(), auth);
    } catch (error) {
      if (!isCollabRejectedPush(error))
        throw error;
      // Someone else pushed first: take their work, then send ours on top.
      const prefs = await this.preferences();
      const remote = await this.fetchShared(repo, prefs);
      await this.mergeRepo(repoId, remote);
      if (this.runtime(repoId).reviews.length > 0)
        return null;
      await this.alignToFetchedTip(dir, repo.branch);
      const retryOid = await this.commitStripped(repoId, message);
      if (!retryOid)
        return null;
      await this.git.push(dir, repo.branch, repo.transport, this.networkPrefs(), auth);
      return retryOid;
    }
    return oid;
  }

  /**
   * Replays this PC's work on top of the last fetched commit. Local commits have
   * never left this machine, so rewriting them keeps history linear for everyone.
   */
  private async alignToFetchedTip(dir: string, branch: string): Promise<void> {
    const remoteOid = await this.git.remoteRef(dir, branch);
    if (remoteOid)
      await this.git.alignBranch(dir, branch, remoteOid);
  }

  private async commitState(repoId: string, message: string): Promise<string | null> {
    const prefs = await this.preferences();
    return this.git.commitTeam(this.store.repoDir(repoId), message, prefs.identity, isCollabStatePath);
  }

  private async commitStripped(repoId: string, message: string): Promise<string | null> {
    const dir = this.store.repoDir(repoId);
    const prefs = await this.preferences();
    const manifest = await this.manifestFor(repoId);
    const backups = new Map<string, string>();
    for (const entry of manifest.workspaces) {
      for (const name of ARTIFACT_FILES) {
        const filePath = path.join(dir, COLLAB_WORKSPACES_DIR, entry.folder, name);
        if (!existsSync(filePath))
          continue;
        const full = await readFile(filePath, 'utf8');
        backups.set(filePath, full);
        await writeFile(
          filePath,
          `${JSON.stringify(stripCollabArtifacts(name, parseJson(full)), null, 2)}\n`,
          'utf8',
        );
      }
    }
    try {
      return await this.git.commitTeam(dir, message, prefs.identity);
    } finally {
      for (const [filePath, full] of backups)
        await writeFile(filePath, full, 'utf8');
    }
  }

  /** Records what was just synced, so the next merge knows what each side changed. */
  private async writeBase(repoId: string): Promise<void> {
    const dir = this.store.repoDir(repoId);
    const baseDir = path.join(dir, ...COLLAB_LOCAL_DIR.split('/'), 'base');
    await rm(baseDir, { recursive: true, force: true });
    await mkdir(baseDir, { recursive: true });
    const manifest = await readManifest(dir);
    await writeFile(path.join(baseDir, COLLAB_MANIFEST_FILE), JSON.stringify(manifest), 'utf8');
    for (const entry of manifest.workspaces) {
      for (const name of COLLAB_TEAM_FILES) {
        const text = await readText(path.join(dir, COLLAB_WORKSPACES_DIR, entry.folder, name));
        if (text === null)
          continue;
        const target = path.join(baseDir, COLLAB_WORKSPACES_DIR, entry.folder, name);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, JSON.stringify(stripCollabArtifacts(name, parseJson(text))), 'utf8');
      }
    }
  }

  private async loadActivity(repoId: string, prefs: CollabPreferences): Promise<void> {
    const runtime = this.runtime(repoId);
    const dir = this.store.repoDir(repoId);
    const manifest = await this.manifestFor(repoId);
    const nameOf = (id: string): string | undefined => manifest.workspaces.find((entry) => entry.id === id)?.name;
    const log = await this.git.log(dir);
    const changes: CollabActivity[] = log
      .filter((entry) => entry.message !== STATUS_COMMIT)
      .map((entry) => {
        const workspaceId = entry.workspaceIds.length === 1 ? entry.workspaceIds[0] : undefined;
        return {
          id: entry.oid,
          kind: 'change' as const,
          author: entry.author,
          summary: collabActivitySummary(entry.author, entry.message, prefs.identity.name),
          at: entry.at,
          ...(workspaceId ? { workspaceId, workspaceName: nameOf(workspaceId) } : {}),
        };
      });
    const runs: CollabActivity[] = [];
    for (const entry of manifest.workspaces) {
      const view = await this.shared.view(path.join(dir, COLLAB_WORKSPACES_DIR, entry.folder), prefs);
      for (const run of view.runs) {
        runs.push({
          id: `run-${entry.id}-${run.id}`,
          kind: 'run',
          author: run.owner,
          summary: runActivityLine(run, prefs.identity.name),
          at: run.finishedAt ?? run.startedAt,
          target: { kind: 'regression', id: run.packId },
          workspaceId: entry.id,
          workspaceName: entry.name,
        });
      }
    }
    runtime.activity = [...changes, ...runs]
      .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
      .slice(0, 80);
  }

  /** Locks and runs for the active workspace, presence for its repository. */
  private async refreshTeamState(): Promise<void> {
    const context = this.activeContext();
    if (!context) {
      this.locks = [];
      this.runs = [];
      this.applyCadence();
      return;
    }
    const prefs = await this.preferences();
    const view = await this.shared.view(context.workspaceDir, prefs);
    this.locks = view.locks;
    this.runs = view.runs;
    this.runtime(context.repo.id).presence = (await this.shared.view(this.store.repoDir(context.repo.id), prefs)).presence;
    this.applyCadence();
  }

  private applyCadence(): void {
    const liveRun = this.locks.some((lock) => !lock.isStale);
    this.loop.setLive(this.watching || liveRun);
  }

  private async touchSync(repoId: string, oid: string | null): Promise<void> {
    await this.store.patchCollabRepo(repoId, { lastSyncAt: new Date().toISOString(), lastSyncOid: oid });
  }

  private runtime(repoId: string): RepoRuntime {
    let runtime = this.runtimes.get(repoId);
    if (!runtime) {
      runtime = {
        phase: 'idle',
        lastError: null,
        authAttention: false,
        toolingAttention: false,
        reviews: [],
        changes: new Map(),
        activity: [],
        presence: [],
        manifest: null,
        note: null,
        noteIds: [],
        busy: false,
        queued: false,
        lastRunAt: 0,
      };
      this.runtimes.set(repoId, runtime);
    }
    return runtime;
  }

  private async manifestFor(repoId: string): Promise<CollabManifest> {
    const runtime = this.runtime(repoId);
    runtime.manifest ??= await readManifest(this.store.repoDir(repoId));
    return runtime.manifest;
  }

  /** Repository the active workspace lives in. */
  private activeRepo(): CollabRepo | null {
    const active = this.store.activeWorkspace();
    if (active?.kind !== 'shared' || !active.collab)
      return null;
    return this.store.collabRepo(active.collab.repoId);
  }

  private activeContext(): { readonly active: Workspace; readonly repo: CollabRepo; readonly workspaceDir: string } | null {
    const active = this.store.activeWorkspace();
    const repo = this.activeRepo();
    if (!active || !repo)
      return null;
    return { active, repo, workspaceDir: this.store.workspaceDir(active) };
  }

  /** Folder of the active workspace inside the given repository, if it lives there. */
  private activeFolder(repoId: string): string | null {
    const active = this.store.activeWorkspace();
    if (active?.collab?.repoId !== repoId)
      return null;
    const parts = active.folder.split('/');
    return parts[parts.length - 1] ?? null;
  }

  private repoFor(repoId?: string): CollabRepo | null {
    return repoId ? this.store.collabRepo(repoId) : this.activeRepo();
  }

  private requireRepo(repoId: string): CollabRepo {
    const repo = this.store.collabRepo(repoId);
    if (!repo)
      throw new CollabUserError('That repository is no longer connected.');
    return repo;
  }

  private async preferences(): Promise<CollabPreferences> {
    return this.vault.preferences(os.userInfo().username || 'Testrix');
  }

  private networkPrefs(): GitNetworkPrefs {
    const proxy = this.store.settings.proxy;
    const certificates = this.store.settings.certificates;
    const host = proxy.host.trim();
    const port = proxy.port.trim();
    const credential = proxy.username.trim()
      ? `${encodeURIComponent(proxy.username.trim())}:${encodeURIComponent(proxy.password)}@`
      : '';
    const proxyUrl =
      (proxy.mode === 'http' || proxy.mode === 'socks5') && host
        ? `${proxy.mode === 'socks5' ? 'socks5' : 'http'}://${credential}${host}${port ? `:${port}` : ''}`
        : null;
    const isProxyUsable = proxyUrl !== null && isSafeGitProxyUrl(proxyUrl);
    if (proxyUrl && !isProxyUsable)
      appLogger.warn('collab', 'Ignoring the proxy for Git: the host or port in Settings is not a valid address.');
    return {
      proxyUrl: isProxyUsable ? proxyUrl : null,
      caPath: certificates.extraCaPath.trim() || null,
      verifyTls: certificates.verifyTls,
    };
  }

  private async authFor(url: string): Promise<GitAuth | null> {
    return this.vault.getGit(url);
  }

  private async persistReviews(repoId: string): Promise<void> {
    const reviews = this.runtime(repoId).reviews;
    const filePath = path.join(this.store.repoDir(repoId), ...COLLAB_LOCAL_DIR.split('/'), 'reviews.json');
    if (reviews.length === 0) {
      if (existsSync(filePath))
        await rm(filePath, { force: true });
      return;
    }
    await writeJsonFile(filePath, reviews);
  }

  private async muted(task: () => Promise<void>): Promise<void> {
    this.suppress += 1;
    try {
      await task();
    } finally {
      this.suppress -= 1;
    }
  }

  private async summary(repo: CollabRepo): Promise<CollabRepoSummary> {
    const runtime = this.runtime(repo.id);
    const manifest = await this.manifestFor(repo.id);
    const remote = parseGitRemote(repo.remoteUrl);
    const attention = attentionOf(runtime);
    const linked = this.store.linkedWorkspaces(repo.id);
    return {
      id: repo.id,
      remoteUrl: repo.remoteUrl,
      label: remote?.host ?? repo.remoteUrl,
      repoName: remote?.repo || repo.remoteUrl,
      provider: remote?.provider ?? null,
      transport: repo.transport,
      branch: repo.branch,
      sync: repo.sync,
      state: stateOf(repo, runtime, attention),
      attention,
      lastSyncAt: repo.lastSyncAt,
      lastError: runtime.lastError,
      hasCredential: Boolean(await this.vault.getGit(repo.remoteUrl)),
      workspaces: manifest.workspaces.map((entry) => ({
        remoteId: entry.id,
        name: entry.name,
        folder: entry.folder,
        localId: linked.find((item) => item.collab?.remoteId === entry.id)?.id ?? null,
      })),
    };
  }

  private async publish(): Promise<CollabStatus> {
    const active = this.store.activeWorkspace();
    const repo = this.activeRepo();
    const prefs = await this.preferences();
    const repos = await Promise.all(this.store.collabRepos().map((item) => this.summary(item)));
    const current = repo ? repos.find((item) => item.id === repo.id) ?? null : null;
    const runtime = repo ? this.runtime(repo.id) : null;
    const folder = repo ? this.activeFolder(repo.id) : null;
    const changes = folder ? runtime?.changes.get(folder) : undefined;
    const presence = runtime?.presence ?? [];
    const status: CollabStatus = {
      repos,
      activeRepoId: repo?.id ?? null,
      activeRemoteId: repo ? active?.collab?.remoteId ?? null : null,
      kind: repo ? 'shared' : 'local',
      state: current?.state ?? 'idle',
      attention: current?.attention ?? 'none',
      lastSyncAt: repo?.lastSyncAt ?? null,
      lastError: runtime?.lastError ?? null,
      remoteLabel: current?.label ?? null,
      remoteUrl: repo?.remoteUrl ?? null,
      transport: repo?.transport ?? null,
      provider: current?.provider ?? null,
      branch: repo?.branch ?? 'main',
      identity: prefs.identity,
      presenceMode: prefs.presenceMode,
      hasCredential: current?.hasCredential ?? false,
      shareRuns: prefs.shareRuns,
      changes: { mine: changes?.mine ?? [], theirs: changes?.theirs ?? [] },
      presence,
      locks: repo ? this.locks : [],
      runs: repo ? this.runs : [],
      people: peopleFrom(presence, repo ? this.runs : [], prefs.identity.name),
      activity: runtime?.activity ?? [],
      reviews: runtime?.reviews ?? [],
    };
    this.latest = status;
    this.broadcast(IpcChannels.collabStatus, status);
    return status;
  }
}

function attentionOf(runtime: RepoRuntime): CollabAttention {
  if (runtime.toolingAttention)
    return 'tooling';
  if (runtime.authAttention)
    return 'auth';
  return runtime.reviews.length > 0 ? 'review' : 'none';
}

function stateOf(repo: CollabRepo, runtime: RepoRuntime, attention: CollabAttention): CollabSyncState {
  if (repo.sync === 'paused' && runtime.phase !== 'syncing')
    return 'paused';
  if (attention !== 'none')
    return 'attention';
  return runtime.phase === 'attention' ? 'idle' : runtime.phase;
}

function noteFailure(runtime: RepoRuntime, error: unknown): void {
  if (error instanceof CollabUserError && error.code === 'tooling') {
    runtime.toolingAttention = true;
    runtime.phase = 'attention';
    runtime.lastError = error.message;
    return;
  }
  if (isCollabAuthError(error)) {
    runtime.authAttention = true;
    runtime.phase = 'attention';
    runtime.lastError = 'Sharing needs your credentials again.';
    return;
  }
  if (isCollabOfflineError(error)) {
    runtime.phase = 'offline';
    runtime.lastError = null;
    return;
  }
  runtime.phase = 'offline';
  runtime.lastError = error instanceof Error ? error.message : 'Saved on this PC. Sync will retry.';
}

/** Commit subject for workspaces this PC published, removed, or renamed since the last sync. */
