import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  collabChangeKindFromFile,
  formatClockDuration,
  localCollabStatus,
  parseGitRemote,
  type CollabChangeKind,
  type CollabDockTab,
  type CollabLock,
  type CollabLockRequest,
  type CollabRepoSummary,
  type CollabReview,
  type CollabRunSummary,
  type CollabStatus,
  type ServiceId,
  type WorkspaceSnapshot,
} from '@testrix/contracts';
import { TxToastService } from '@testrix/ui';

import { DesktopApiService } from '../../core/desktop-api.service';
import { SessionPersistenceService } from '../../core/session-persistence.service';
import { ShellStateService } from '../../core/shell-state.service';
import { CollectionsStore } from '../collections/collections.store';
import { DatabaseStore } from '../database/database.store';
import { EnvironmentsStore } from '../environments/environments.store';
import { FlowTemplatesStore } from '../services/flows/flow-templates.store';
import { ServicesStore } from '../services/services.store';
import { PlantumlStore } from '../tools/plantuml/plantuml.store';
import { WorkbenchStore } from '../workbench/workbench.store';
import { WorkspacesStore } from '../workspaces/workspaces.store';

export type CollabActivityFilter = 'all' | 'change' | 'run' | 'people';

export type CollabActivityScope = 'workspace' | 'repo';

export type CollabConnectStep = 'address' | 'pick' | 'token';

export interface CollabActivityDay {
  readonly label: string;
  readonly rows: CollabStatus['activity'];
}

/**
 * Collab state for the right dock, the switcher glyph, and the regression strip.
 * Status arrives as a push from the main process; nothing here polls.
 */
@Injectable({ providedIn: 'root' })
export class CollabStore {
  private readonly desktop = inject(DesktopApiService);
  private readonly workspaces = inject(WorkspacesStore);
  private readonly session = inject(SessionPersistenceService);
  private readonly shell = inject(ShellStateService);
  private readonly workbench = inject(WorkbenchStore);
  private readonly collections = inject(CollectionsStore);
  private readonly environments = inject(EnvironmentsStore);
  private readonly database = inject(DatabaseStore);
  private readonly services = inject(ServicesStore);
  private readonly templates = inject(FlowTemplatesStore);
  private readonly plantuml = inject(PlantumlStore);
  private readonly toasts = inject(TxToastService);

  readonly status = signal<CollabStatus>(localCollabStatus());
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly activityFilter = signal<CollabActivityFilter>('all');
  readonly activityScope = signal<CollabActivityScope>('workspace');

  readonly connectOpen = signal(false);
  readonly connectStep = signal<CollabConnectStep>('address');
  readonly remoteDraft = signal('');
  readonly userDraft = signal('');
  readonly tokenDraft = signal('');
  readonly branchDraft = signal('main');
  readonly connectAdvanced = signal(false);
  /** Repository just connected in the dialog, waiting for workspace picks. */
  readonly connectedRepoId = signal<string | null>(null);
  readonly pickedRemoteIds = signal<ReadonlySet<string>>(new Set());
  /** Local workspace to publish into the connected repository, if any. */
  readonly publishDraftId = signal<string | null>(null);
  /** Set when the dialog was opened to publish one workspace into a new repository. */
  private publishOnConnectId: string | null = null;

  /** Repository shown in the dock header. Null follows the active workspace. */
  private readonly pinnedRepoId = signal<string | null>(null);

  private sawReviews = false;
  private sawAuth = false;
  private watchedPackIds = new Set<string>();

  readonly isShared = computed(() => this.status().kind === 'shared');
  readonly repos = computed(() => this.status().repos);
  readonly hasRepos = computed(() => this.repos().length > 0);
  readonly tab = computed(() => this.shell.collabDockTab());

  /** Repository the dock is looking at: a picked one, else the active workspace's, else the first. */
  readonly dockRepo = computed<CollabRepoSummary | null>(() => {
    const repos = this.repos();
    const pinned = this.pinnedRepoId();
    const activeId = this.status().activeRepoId;
    return (
      repos.find((repo) => repo.id === pinned) ??
      repos.find((repo) => repo.id === activeId) ??
      repos[0] ??
      null
    );
  });

  /** True when the dock shows the repository the active workspace lives in. */
  readonly dockIsActiveRepo = computed(() => {
    const repo = this.dockRepo();
    return Boolean(repo && repo.id === this.status().activeRepoId);
  });

  /** True when more than one repository is connected, so the header can switch. */
  readonly showRepoSwitcher = computed(() => this.repos().length > 1);

  /**
   * Active workspace is only on this PC and the user has not picked another
   * repository. Opening Collab should prompt to publish rather than show a
   * teammate repo's empty tabs.
   */
  readonly needsPublishPrompt = computed(() => {
    if (!this.hasRepos() || this.pinnedRepoId())
      return false;
    return this.status().activeRepoId === null;
  });

  readonly liveRuns = computed(() => this.status().locks.filter((lock) => !lock.isStale));
  readonly staleLocks = computed(() => this.status().locks.filter((lock) => lock.isStale));

  readonly connectedRepo = computed(() => {
    const id = this.connectedRepoId();
    return this.repos().find((repo) => repo.id === id) ?? null;
  });

  /** Local workspaces that could be published into a repository. */
  readonly publishableWorkspaces = computed(() =>
    this.workspaces.items().filter((item) => item.kind !== 'shared' || !item.collab),
  );

  readonly canFinishConnect = computed(
    () => this.pickedRemoteIds().size > 0 || this.publishDraftId() !== null,
  );

  readonly statusLine = computed(() => {
    const status = this.status();
    if (status.kind !== 'shared')
      return 'Only on this PC';
    if (status.state === 'syncing')
      return 'Syncing…';
    if (status.state === 'offline')
      return 'Offline';
    if (status.state === 'paused')
      return 'Paused';
    if (status.attention === 'auth')
      return 'Needs your credentials';
    if (status.attention === 'tooling')
      return 'Needs Git';
    if (status.attention === 'review')
      return 'Needs you';
    return 'Up to date';
  });

  /** Dot on the titlebar Collab button. Null keeps the icon quiet. */
  readonly railState = computed(() => {
    const status = this.status();
    const needsYou = status.repos.some((repo) => repo.state === 'attention');
    if (status.kind !== 'shared')
      return needsYou ? 'attention' : null;
    if (status.state === 'idle')
      return needsYou ? 'attention' : null;
    return status.state;
  });

  readonly remoteChip = computed(() => {
    const repo = this.dockRepo();
    if (!repo)
      return '';
    return `${repo.label} · ${repo.branch}`;
  });

  readonly dockStatusLine = computed(() => repoStatusLine(this.dockRepo()));
  readonly dockStatusDetail = computed(() => repoStatusDetail(this.dockRepo()));

  readonly reviewSummary = computed(() => {
    const reviews = this.status().reviews;
    if (reviews.length === 0)
      return '';
    if (reviews.length === 1)
      return reviews[0]?.label ?? 'A change';
    return `${reviews.length} changes need you`;
  });

  readonly activePresence = computed(() => this.status().presence.filter((entry) => entry.isActive));
  readonly awayPresence = computed(() => this.status().presence.filter((entry) => !entry.isActive));

  readonly visibleActivity = computed(() => {
    const filter = this.activityFilter();
    const status = this.status();
    const remoteId = status.activeRemoteId;
    const scoped =
      this.activityScope() === 'workspace' && remoteId
        ? status.activity.filter((row) => !row.workspaceId || row.workspaceId === remoteId)
        : status.activity;
    return filter === 'all' ? scoped : scoped.filter((row) => row.kind === filter);
  });

  readonly activityDays = computed(() => groupActivityByDay(this.visibleActivity()));

  readonly canConnect = computed(() => parseGitRemote(this.remoteDraft()) !== null);
  readonly remotePreview = computed(() => {
    const parsed = parseGitRemote(this.remoteDraft());
    if (!parsed)
      return '';
    const provider = parsed.provider ? `${parsed.provider} · ` : '';
    return `${provider}${parsed.transport === 'ssh' ? 'SSH' : 'HTTPS'} · ${parsed.host}`;
  });
  readonly needsToken = computed(() => parseGitRemote(this.remoteDraft())?.transport === 'https');

  constructor() {
    const off = this.desktop.api.collab.onStatus((status) => this.applyStatus(status));
    inject(DestroyRef).onDestroy(() => off());
    effect(() => {
      const open = this.shell.collabDockOpen();
      void this.desktop.api.collab.setWatching(open);
    });
    effect(() => {
      this.workspaces.activeId();
      this.pinnedRepoId.set(null);
    });
    void this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      this.applyStatus(await this.desktop.api.collab.getStatus());
    } catch {
      // the bridge may still be starting
    }
  }

  /** Points the dock at the active workspace's repository, then opens it. */
  openDock(): void {
    this.followActiveWorkspace();
    this.shell.openCollabDock();
  }

  toggleDock(): void {
    if (!this.shell.collabDockOpen())
      this.followActiveWorkspace();
    this.shell.toggleCollabDock();
  }

  /** Clears a pinned repository so the header follows the open workspace. */
  followActiveWorkspace(): void {
    this.pinnedRepoId.set(null);
  }

  /** Opens the Workspaces tab of a repository so the user can add or publish. */
  chooseWorkspaces(repoId?: string): void {
    const id = repoId ?? this.dockRepo()?.id ?? this.repos()[0]?.id;
    if (id)
      this.pinnedRepoId.set(id);
    this.shell.openCollabDockTab('workspaces');
  }

  /** Publishes the open local workspace into the only repo, or opens the picker. */
  async publishActiveWorkspace(): Promise<void> {
    const active = this.workspaces.active();
    if (!active || (active.kind === 'shared' && active.collab))
      return;
    if (this.repos().length === 1) {
      const repo = this.repos()[0];
      if (repo)
        await this.publishWorkspace(repo.id, active.id);
      return;
    }
    this.chooseWorkspaces();
  }

  setTab(tab: CollabDockTab): void {
    this.shell.collabDockTab.set(tab);
  }

  openTab(tab: CollabDockTab): void {
    this.shell.openCollabDockTab(tab);
  }

  /** Points the dock header at another connected repository. */
  showRepo(repoId: string): void {
    this.pinnedRepoId.set(repoId === this.status().activeRepoId ? null : repoId);
  }

  /** Opens the connect sheet. Pass a workspace id to publish it once connected. */
  openConnect(publishWorkspaceId: string | null = null): void {
    this.error.set(null);
    this.connectStep.set('address');
    this.remoteDraft.set('');
    this.branchDraft.set('main');
    this.userDraft.set('');
    this.tokenDraft.set('');
    this.connectAdvanced.set(false);
    this.connectedRepoId.set(null);
    this.pickedRemoteIds.set(new Set());
    this.publishDraftId.set(null);
    this.publishOnConnectId = publishWorkspaceId;
    this.connectOpen.set(true);
  }

  /** Opens the picker straight on a repository that is already connected. */
  openAddFromRepo(repoId: string): void {
    this.openConnect();
    this.connectedRepoId.set(repoId);
    this.connectStep.set('pick');
  }

  closeConnect(): void {
    this.connectOpen.set(false);
    this.error.set(null);
  }

  /** First step: reach the repository and read which workspaces it holds. */
  async connect(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      const result = await this.desktop.api.collab.connectRepo({
        url: this.remoteDraft().trim(),
        username: this.userDraft().trim() || undefined,
        password: this.tokenDraft() || undefined,
        branch: this.branchDraft().trim() || undefined,
      });
      this.applyStatus(result.status);
      this.pinnedRepoId.set(null);
      const publishId = this.publishOnConnectId;
      if (publishId) {
        this.publishOnConnectId = null;
        await this.runPublish(result.repo.id, publishId);
        this.connectOpen.set(false);
        return;
      }
      this.connectedRepoId.set(result.repo.id);
      const active = this.workspaces.active();
      const activeIsLocal = Boolean(active && (active.kind !== 'shared' || !active.collab));
      const publishable = this.publishableWorkspaces();
      this.publishDraftId.set(
        result.repo.workspaces.length === 0
          ? (activeIsLocal ? active?.id ?? null : publishable[0]?.id ?? null)
          : null,
      );
      this.pickedRemoteIds.set(new Set());
      this.connectStep.set('pick');
    } catch (error) {
      this.error.set(message(error, 'Could not reach that repository.'));
    } finally {
      this.busy.set(false);
    }
  }

  togglePick(remoteId: string, picked: boolean): void {
    this.pickedRemoteIds.update((current) => {
      const next = new Set(current);
      if (picked)
        next.add(remoteId);
      else
        next.delete(remoteId);
      return next;
    });
  }

  /** Second step: add the picked workspaces, then publish one if asked. */
  async finishConnect(): Promise<void> {
    const repo = this.connectedRepo();
    if (!repo)
      return;
    this.error.set(null);
    this.busy.set(true);
    try {
      const picked = [...this.pickedRemoteIds()];
      if (picked.length > 0) {
        this.takeResult(await this.desktop.api.collab.addWorkspaces({ repoId: repo.id, remoteIds: picked }));
        this.toasts.show({
          message: picked.length === 1 ? 'Workspace added to this PC.' : `${picked.length} workspaces added to this PC.`,
        });
      }
      const publishId = this.publishDraftId();
      if (publishId)
        await this.runPublish(repo.id, publishId);
      this.connectOpen.set(false);
      this.shell.openCollabDock();
    } catch (error) {
      this.error.set(message(error, 'Could not finish connecting.'));
    } finally {
      this.busy.set(false);
    }
  }

  /** Leaves the picker without adding anything; the repository stays connected. */
  skipPicking(): void {
    this.connectOpen.set(false);
    this.chooseWorkspaces(this.connectedRepoId() ?? undefined);
  }

  /** Opens the token sheet for a connected repository. */
  openUpdateToken(repoId?: string): void {
    this.error.set(null);
    this.userDraft.set('');
    this.tokenDraft.set('');
    this.connectedRepoId.set(repoId ?? this.dockRepo()?.id ?? this.status().activeRepoId);
    this.connectStep.set('token');
    this.connectOpen.set(true);
  }

  async updateCredential(repoId?: string): Promise<void> {
    const id = repoId ?? this.connectedRepoId() ?? this.dockRepo()?.id;
    const username = this.userDraft().trim();
    const password = this.tokenDraft();
    if (!id || !username || !password)
      return;
    this.error.set(null);
    this.busy.set(true);
    try {
      this.applyStatus(await this.desktop.api.collab.updateCredential({ repoId: id, username, password }));
      this.connectOpen.set(false);
      this.tokenDraft.set('');
      this.toasts.show({ message: 'Access token updated.' });
    } catch (error) {
      this.error.set(message(error, 'Could not update the access token.'));
    } finally {
      this.busy.set(false);
    }
  }

  async addWorkspaces(repoId: string, remoteIds: readonly string[]): Promise<void> {
    if (remoteIds.length === 0)
      return;
    await this.guarded('Could not add that workspace.', async () => {
      this.takeResult(await this.desktop.api.collab.addWorkspaces({ repoId, remoteIds: [...remoteIds] }));
    });
  }

  async publishWorkspace(repoId: string, workspaceId: string): Promise<void> {
    await this.guarded('Could not publish that workspace.', () => this.runPublish(repoId, workspaceId));
  }

  async removeFromPc(workspaceId: string): Promise<void> {
    await this.guarded('Could not remove that workspace.', async () => {
      this.takeResult(await this.desktop.api.collab.removeFromPc(workspaceId));
      this.toasts.show({ message: 'Removed from this PC. The repository still has it.' });
    });
  }

  async removeFromRepo(repoId: string, remoteId: string): Promise<void> {
    await this.guarded('Could not remove that workspace.', async () => {
      this.takeResult(await this.desktop.api.collab.removeFromRepo({ repoId, remoteId }));
      this.toasts.show({ message: 'Removed from the repository. A copy stays on this PC.' });
    });
  }

  async disconnectRepo(repoId: string): Promise<void> {
    await this.guarded('Could not disconnect.', async () => {
      this.takeResult(await this.desktop.api.collab.disconnectRepo(repoId));
      if (this.pinnedRepoId() === repoId)
        this.pinnedRepoId.set(null);
      this.toasts.show({ message: 'Disconnected. Its workspaces stay on this PC.' });
    });
  }

  async syncNow(repoId?: string): Promise<void> {
    this.applyStatus(await this.desktop.api.collab.syncNow(repoId ?? this.dockRepo()?.id));
  }

  async pauseOrResume(repoId?: string): Promise<void> {
    const repo = this.repoById(repoId ?? this.dockRepo()?.id);
    if (!repo)
      return;
    const next =
      repo.sync === 'paused'
        ? await this.desktop.api.collab.resume(repo.id)
        : await this.desktop.api.collab.pause(repo.id);
    this.applyStatus(next);
  }

  async copyRemote(repoId?: string): Promise<void> {
    const url = this.repoById(repoId ?? this.dockRepo()?.id)?.remoteUrl;
    if (!url)
      return;
    await navigator.clipboard.writeText(url);
    this.toasts.show({ message: 'Repository address copied.' });
  }

  async setIdentity(name: string, email?: string): Promise<void> {
    this.applyStatus(await this.desktop.api.collab.setIdentity({ name, email }));
  }

  async forgetCredential(repoId?: string): Promise<void> {
    this.applyStatus(await this.desktop.api.collab.forgetCredential(repoId ?? this.dockRepo()?.id));
  }

  async openWorkspace(workspaceId: string): Promise<void> {
    const snapshot = await this.workspaces.switchTo(workspaceId);
    if (!snapshot)
      return;
    this.shell.playScene();
    this.session.applyActiveWorkspace();
    this.pinnedRepoId.set(null);
  }

  repoById(repoId: string | null | undefined): CollabRepoSummary | null {
    return this.repos().find((repo) => repo.id === repoId) ?? null;
  }

  /** Repository a catalog workspace lives in, if any. */
  repoForWorkspace(workspaceId: string): CollabRepoSummary | null {
    const item = this.workspaces.items().find((entry) => entry.id === workspaceId);
    return item?.kind === 'shared' && item.collab ? this.repoById(item.collab.repoId) : null;
  }

  private async runPublish(repoId: string, workspaceId: string): Promise<void> {
    const name = this.workspaces.items().find((item) => item.id === workspaceId)?.name ?? 'Workspace';
    this.takeResult(await this.desktop.api.collab.publishWorkspace({ repoId, workspaceId }));
    const repo = this.repoById(repoId);
    this.toasts.show({ message: `${name} is now in ${repo?.repoName ?? 'the repository'}.` });
  }

  private async guarded(fallback: string, task: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await task();
    } catch (error) {
      this.toasts.show({ message: message(error, fallback) });
    } finally {
      this.busy.set(false);
    }
  }

  async setPresenceMode(mode: 'active' | 'offline'): Promise<void> {
    this.applyStatus(await this.desktop.api.collab.setPresenceMode(mode));
  }

  async setShareRuns(enabled: boolean): Promise<void> {
    this.applyStatus(await this.desktop.api.collab.setShareRuns(enabled));
  }

  async setBranch(branch: string, repoId?: string): Promise<void> {
    this.applyStatus(await this.desktop.api.collab.setBranch(branch, repoId ?? this.dockRepo()?.id));
  }

  openReview(): void {
    this.workbench.openCollabReview();
  }

  async resolve(id: string, choice: 'ours' | 'theirs'): Promise<void> {
    const review = this.status().reviews.find((item) => item.id === id) ?? null;
    this.takeResult(await this.desktop.api.collab.resolve({ id, choice }));
    if (choice === 'theirs' && review)
      this.openReviewTarget(review);
  }

  /** Opens a request, flow, environment, pack, or other artifact from a change row. */
  openTarget(kind: CollabChangeKind, id: string, label?: string): void {
    switch (kind) {
      case 'request':
      case 'websocket':
      case 'folder': {
        const node = this.collections.nodeById(id);
        if (!node)
          return;
        this.shell.openRail('collections');
        this.workbench.openFromNode(node);
        return;
      }
      case 'environment': {
        const env = this.environments.environmentById(id);
        if (!env)
          return;
        this.shell.openRail('environments');
        this.workbench.openFromEnvironment(env);
        return;
      }
      case 'database': {
        const connection = this.database.connectionById(id);
        if (!connection)
          return;
        this.shell.openRail('database');
        this.workbench.openFromDatabaseConnection(connection);
        return;
      }
      case 'query': {
        const query = this.database.queryById(id);
        if (!query)
          return;
        this.shell.openRail('database');
        this.workbench.openFromDatabaseQuery(query);
        return;
      }
      case 'diagram': {
        this.shell.openRail('tools');
        this.plantuml.openDiagram(id, label);
        return;
      }
      case 'template': {
        this.shell.openRail('services');
        this.templates.openTemplate(id);
        return;
      }
      case 'flow':
      case 'regression':
      case 'load':
      case 'mock':
      case 'listener':
      case 'intercept': {
        const serviceId = SERVICE_KIND[kind];
        if (!serviceId)
          return;
        this.shell.openRail('services');
        this.services.openArtifact(serviceId, id, label ?? id);
        return;
      }
      default:
        return;
    }
  }

  openReviewTarget(review: CollabReview): void {
    this.openTarget(collabChangeKindFromFile(review.file), review.itemId, review.label);
  }

  lockFor(packId: string): CollabLock | null {
    return this.status().locks.find((lock) => lock.packId === packId) ?? null;
  }

  latestRunFor(packId: string): CollabRunSummary | null {
    return this.status().runs.find((run) => run.packId === packId) ?? null;
  }

  /** Claims the pack before a run starts. Returns false when a teammate holds it. */
  async acquireLock(request: CollabLockRequest): Promise<boolean> {
    if (!this.isShared())
      return true;
    const result = await this.desktop.api.collab.acquireLock(request);
    if (!result.ok && result.message)
      this.toasts.show({ message: result.message });
    return result.ok;
  }

  async takeOverLock(request: CollabLockRequest): Promise<boolean> {
    const result = await this.desktop.api.collab.takeOverLock(request);
    if (!result.ok && result.message)
      this.toasts.show({ message: result.message });
    return result.ok;
  }

  async renewLock(packId: string, completed: number, total: number): Promise<void> {
    if (this.isShared())
      await this.desktop.api.collab.renewLock(packId, completed, total);
  }

  async releaseLock(packId: string): Promise<void> {
    if (this.isShared())
      this.applyStatus(await this.desktop.api.collab.releaseLock(packId));
  }

  /** Marks a teammate's run as watched so its result raises one toast. */
  watchRun(packId: string): void {
    this.watchedPackIds.add(packId);
  }

  private takeResult(result: { readonly status: CollabStatus; readonly snapshot: WorkspaceSnapshot | null }): void {
    if (result.snapshot) {
      this.workspaces.acceptSnapshot(result.snapshot);
      this.session.applyActiveWorkspace();
    }
    this.applyStatus(result.status);
  }

  private applyStatus(status: CollabStatus): void {
    const hadReviews = this.sawReviews;
    const hadAuth = this.sawAuth;
    const previousLocks = this.status().locks;
    this.sawReviews = status.reviews.length > 0;
    this.sawAuth = status.attention === 'auth' || status.attention === 'tooling';
    this.status.set(status);
    if (status.reviews.length === 0)
      this.workbench.closeCollabReview();
    if (!hadReviews && status.reviews.length > 0) {
      const count = status.reviews.length;
      this.toasts.show({
        message: count === 1 ? 'Someone else changed this workspace.' : `${count} changes need you.`,
        action: { label: 'Review', onClick: () => this.openReview() },
      });
    }
    if (!hadAuth && this.sawAuth) {
      this.toasts.show({
        message: status.lastError ?? 'Sharing needs your access token again.',
        action: { label: 'Update token', onClick: () => this.openUpdateToken() },
      });
    }
    this.announceWatchedRuns(previousLocks, status);
    this.announceTakeovers(previousLocks, status);
  }

  /** One toast when a run you pressed Watch on leaves the live list. */
  private announceWatchedRuns(previous: readonly CollabLock[], status: CollabStatus): void {
    for (const packId of [...this.watchedPackIds]) {
      const wasLive = previous.some((lock) => lock.packId === packId);
      const stillLive = status.locks.some((lock) => lock.packId === packId);
      if (!wasLive || stillLive)
        continue;
      this.watchedPackIds.delete(packId);
      const run = status.runs.find((entry) => entry.packId === packId);
      if (!run)
        continue;
      this.toasts.show({
        message:
          run.failed > 0
            ? `${run.packName} finished with ${run.failed} failed.`
            : `${run.packName} passed.`,
      });
    }
  }

  private announceTakeovers(previous: readonly CollabLock[], status: CollabStatus): void {
    for (const lock of previous) {
      if (!lock.isMine)
        continue;
      const now = status.locks.find((entry) => entry.packId === lock.packId);
      if (now && !now.isMine)
        this.toasts.show({ message: `${now.owner} took over ${now.packName}.` });
    }
  }
}

/** One or two words for a repository's sync state. */
export function repoStatusLine(repo: CollabRepoSummary | null): string {
  if (!repo)
    return 'Not connected';
  if (repo.state === 'syncing')
    return 'Syncing…';
  if (repo.state === 'offline')
    return 'Offline';
  if (repo.state === 'paused')
    return 'Paused';
  if (repo.attention === 'auth')
    return 'Needs your credentials';
  if (repo.attention === 'tooling')
    return 'Needs Git';
  if (repo.attention === 'review')
    return 'Needs you';
  return 'Up to date';
}

function repoStatusDetail(repo: CollabRepoSummary | null): string {
  if (!repo)
    return 'Connect a repository to work with your team.';
  if (repo.state === 'offline')
    return 'Your changes are saved on this PC.';
  if (repo.state === 'syncing')
    return 'Sending and receiving.';
  if (repo.state === 'paused')
    return 'Nothing leaves this PC until you resume.';
  if (repo.lastError)
    return repo.lastError;
  if (repo.lastSyncAt)
    return relativeTime(repo.lastSyncAt);
  return 'Waiting for the first sync.';
}

function message(error: unknown, fallback: string): string {
  if (!(error instanceof Error))
    return fallback;
  return error.message.replace(/^Error invoking remote method '[^']+':\s*/, '').trim() || fallback;
}

function groupActivityByDay(rows: CollabStatus['activity']): readonly CollabActivityDay[] {
  const groups = new Map<string, CollabStatus['activity'][number][]>();
  const order: string[] = [];
  for (const row of rows) {
    const key = dayKey(row.at);
    const existing = groups.get(key);
    if (existing) {
      existing.push(row);
      continue;
    }
    groups.set(key, [row]);
    order.push(key);
  }
  return order.map((key) => ({
    label: dayLabel(key),
    rows: groups.get(key) ?? [],
  }));
}

function dayKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime()))
    return 'unknown';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayLabel(key: string): string {
  if (key === 'unknown')
    return 'Earlier';
  const today = dayKey(new Date().toISOString());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = dayKey(yesterdayDate.toISOString());
  if (key === today)
    return 'Today';
  if (key === yesterday)
    return 'Yesterday';
  const [year, month, day] = key.split('-');
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Short relative time, matching the History rows. */
export function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then))
    return 'Just now';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 15)
    return 'Just now';
  if (seconds < 60)
    return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60)
    return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24)
    return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

/** @deprecated Use `formatClockDuration` from `@testrix/contracts`. */
export function formatDuration(ms: number): string {
  return formatClockDuration(ms);
}

const SERVICE_KIND: Partial<Record<CollabChangeKind, ServiceId>> = {
  flow: 'flows',
  regression: 'regression',
  load: 'load',
  mock: 'mocks',
  listener: 'listeners',
  intercept: 'intercept',
};
