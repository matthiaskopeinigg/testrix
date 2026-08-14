import { Injectable, computed, inject, signal } from '@angular/core';

import {
  createDefaultTeamGitSetupContext,
  createDefaultTeamSyncStatus,
  ensureProfileSyncEntries,
  teamSyncStatusLabel,
  type TeamBranchEntry,
  type TeamCommitDetail,
  type TeamGitSetupContext,
  type TeamHistoryPage,
  type TeamFetchRemoteCatalogOptions,
  type TeamFetchRemoteCatalogResult,
  type TeamImportProfilesResult,
  type TeamRemoteCatalog,
  type TeamSyncStatus,
  type TeamWorkspaceConfig,
} from '@shared/collaboration';
import { isTeamProfile } from '@shared/config';

import { ElectronService } from '../electron/electron.service';
import { ProfileService } from '../profile/profile.service';
import { TeamsPanelService } from './teams-panel.service';

@Injectable({ providedIn: 'root' })
export class TeamSyncService {
  private readonly electron = inject(ElectronService);
  private readonly profiles = inject(ProfileService);
  private readonly teamsPanel = inject(TeamsPanelService);

  private readonly statusState = signal<TeamSyncStatus>(createDefaultTeamSyncStatus());
  private readonly configState = signal<TeamWorkspaceConfig | null>(null);
  private readonly historyState = signal<TeamHistoryPage>({ entries: [], hasMore: false });
  private readonly branchesState = signal<readonly TeamBranchEntry[]>([]);
  private readonly commitDetailState = signal<TeamCommitDetail | null>(null);
  private readonly gitSetupState = signal<TeamGitSetupContext>(createDefaultTeamGitSetupContext());
  private readonly remoteCatalogState = signal<TeamRemoteCatalog | null>(null);
  private unsubscribers: (() => void)[] = [];
  private externalReloadTimer: ReturnType<typeof setTimeout> | null = null;

  private static readonly EXTERNAL_RELOAD_DEBOUNCE_MS = 400;

  readonly status = this.statusState.asReadonly();
  readonly config = this.configState.asReadonly();
  readonly history = this.historyState.asReadonly();
  readonly branches = this.branchesState.asReadonly();
  readonly commitDetail = this.commitDetailState.asReadonly();
  readonly gitSetup = this.gitSetupState.asReadonly();
  readonly remoteCatalog = this.remoteCatalogState.asReadonly();

  readonly isActiveTeamProfile = computed(() => {
    const activeId = this.profiles.activeProfileId();
    if (!activeId) {
      return false;
    }
    const active = this.profiles.profiles().find((profile) => profile.id === activeId);
    return active ? isTeamProfile(active) : false;
  });

  readonly isAutoSyncPaused = computed(() => {
    const config = this.configState();
    return Boolean(config?.enabled && !config.autoSync.enabled);
  });

  readonly statusLabel = computed(() =>
    teamSyncStatusLabel(this.statusState().status, {
      autoSyncPaused: this.isAutoSyncPaused(),
    }),
  );

  /** Status id for titlebar chrome (includes pause overlay). */
  readonly indicatorStatus = computed(() => {
    if (this.isAutoSyncPaused() && this.statusState().status !== 'syncing') {
      return 'paused' as const;
    }
    return this.statusState().status;
  });

  async hydrate(): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return;
    }

    this.disposeListeners();
    this.unsubscribers.push(
      bridge.team.onStatusChanged((s) => this.statusState.set(s)),
      bridge.team.onOpenPanel(() => {
        this.teamsPanel.show();
      }),
      bridge.team.onProfilesMerged((payload) => {
        void this.handleTeamProfilesChanged(payload.addedProfileIds);
      }),
      bridge.team.onExternalFileChanged((payload) => {
        const workspaceDir =
          payload && typeof payload === 'object' && 'workspaceDir' in payload
            ? String((payload as { workspaceDir: string }).workspaceDir)
            : null;
        const activeDir = this.profiles.activeProfileDir();
        if (workspaceDir && activeDir && workspaceDir !== activeDir) {
          return;
        }
        this.scheduleWorkspaceReloadFromDisk();
      }),
    );

    const [status, config] = await Promise.all([bridge.team.getStatus(), bridge.team.getConfig()]);
    this.statusState.set(status);
    this.configState.set(config);
    await this.profiles.hydrate();
    await this.ensureDefaultProfileSyncEntries(config);
    void this.loadGitSetup();
  }

  private async ensureDefaultProfileSyncEntries(config: TeamWorkspaceConfig | null): Promise<void> {
    if (!config) {
      return;
    }
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return;
    }
    const next = ensureProfileSyncEntries(this.profiles.profiles(), config.profileSync);
    if (JSON.stringify(next.entries) !== JSON.stringify(config.profileSync.entries)) {
      const saved = await bridge.team.setConfig({ profileSync: next });
      this.configState.set(saved);
    }
  }

  disposeListeners(): void {
    if (this.externalReloadTimer !== null) {
      clearTimeout(this.externalReloadTimer);
      this.externalReloadTimer = null;
    }
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }

  private scheduleWorkspaceReloadFromDisk(): void {
    if (this.externalReloadTimer !== null) {
      clearTimeout(this.externalReloadTimer);
    }
    this.externalReloadTimer = setTimeout(() => {
      this.externalReloadTimer = null;
      void this.profiles.reloadWorkspaceFromDisk();
    }, TeamSyncService.EXTERNAL_RELOAD_DEBOUNCE_MS);
  }

  private async handleTeamProfilesChanged(profileIds: readonly string[]): Promise<void> {
    await this.profiles.hydrate();
    if (profileIds.length > 0) {
      await this.loadConfig();
      await this.profiles.reloadWorkspaceFromDisk();
    }
  }

  async refreshStatus(): Promise<TeamSyncStatus> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return this.statusState();
    }
    const status = await bridge.team.getStatus();
    this.statusState.set(status);
    return status;
  }

  async syncNow(): Promise<TeamSyncStatus> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return this.statusState();
    }
    const status = await bridge.team.syncNow();
    this.statusState.set(status);
    if (status.status === 'synced' || status.status === 'idle') {
      await this.fetchRemoteCatalog({ importMissing: true });
      await this.profiles.reloadWorkspaceFromDisk();
    }
    return status;
  }

  async onAppFocus(): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return;
    }
    const status = await bridge.team.onFocus();
    this.statusState.set(status);
  }

  async loadConfig(): Promise<TeamWorkspaceConfig | null> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return null;
    }
    const config = await bridge.team.getConfig();
    this.configState.set(config);
    return config;
  }

  async saveConfig(patch: Partial<TeamWorkspaceConfig>): Promise<TeamWorkspaceConfig | null> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return null;
    }
    const config = await bridge.team.setConfig(patch);
    this.configState.set(config);
    return config;
  }

  async setRemote(url: string, token?: string | null): Promise<TeamSyncStatus> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return this.statusState();
    }
    const status = await bridge.team.setRemote(url, token ?? null);
    this.statusState.set(status);
    await Promise.all([this.loadConfig(), this.loadGitSetup(), this.profiles.hydrate()]);
    return status;
  }

  async listRepoDirectories(): Promise<readonly string[]> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return [];
    }
    return bridge.team.listRepoDirectories();
  }

  async fetchRemoteCatalog(options?: TeamFetchRemoteCatalogOptions): Promise<TeamFetchRemoteCatalogResult> {
    const bridge = this.electron.bridge();
    const empty: TeamFetchRemoteCatalogResult = {
      profiles: [],
      fetchedAt: new Date().toISOString(),
      importedProfileIds: [],
    };

    if (!bridge?.team) {
      this.remoteCatalogState.set(empty);
      return empty;
    }

    const result = await bridge.team.fetchRemoteCatalog(options);
    const { importedProfileIds, ...catalog } = result;
    this.remoteCatalogState.set(catalog);

    if (importedProfileIds.length > 0) {
      await this.profiles.hydrate();
      await this.loadConfig();
      await this.profiles.reloadWorkspaceFromDisk();
    }

    return result;
  }

  async importProfiles(profileIds: readonly string[]): Promise<TeamImportProfilesResult> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return { importedProfileIds: [] };
    }
    const result = await bridge.team.importProfiles(profileIds);
    await this.profiles.hydrate();
    await this.loadConfig();
    await this.fetchRemoteCatalog();
    if (result.importedProfileIds.length > 0) {
      await this.profiles.reloadWorkspaceFromDisk();
    }
    return result;
  }

  async publishLocalProfile(profileId: string): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return;
    }
    await bridge.team.publishLocalProfile(profileId);
    await this.profiles.hydrate();
    await this.loadConfig();
    await this.fetchRemoteCatalog();
  }

  async createTeamProfile(name: string): Promise<string> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      throw new Error('Team sync is unavailable');
    }
    const result = await bridge.team.createTeamProfile(name);
    await this.profiles.hydrate();
    await this.loadConfig();
    await this.fetchRemoteCatalog();
    await this.profiles.reloadWorkspaceFromDisk();
    return result.profileId;
  }

  async unpublishProfile(profileId: string): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return;
    }
    await bridge.team.unpublishProfile(profileId);
    await this.profiles.hydrate();
    await this.loadConfig();
    await this.fetchRemoteCatalog();
  }

  async loadGitSetup(): Promise<TeamGitSetupContext> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return this.gitSetupState();
    }
    const setup = await bridge.team.getGitSetup();
    this.gitSetupState.set(setup);
    return setup;
  }

  async loadHistory(skip = 0): Promise<TeamHistoryPage> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return { entries: [], hasMore: false };
    }
    const page = await bridge.team.getHistory({ limit: 25, skip });
    if (skip === 0) {
      this.historyState.set(page);
    } else {
      const current = this.historyState();
      this.historyState.set({
        entries: [...current.entries, ...page.entries],
        hasMore: page.hasMore,
      });
    }
    return this.historyState();
  }

  async loadMoreHistory(): Promise<TeamHistoryPage> {
    return this.loadHistory(this.historyState().entries.length);
  }

  async loadCommitDetail(hash: string): Promise<TeamCommitDetail | null> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return null;
    }
    try {
      const detail = await bridge.team.getCommitDetail(hash);
      this.commitDetailState.set(detail);
      return detail;
    } catch {
      this.commitDetailState.set(null);
      return null;
    }
  }

  clearCommitDetail(): void {
    this.commitDetailState.set(null);
  }

  async loadBranches(): Promise<readonly TeamBranchEntry[]> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return [];
    }
    const branches = await bridge.team.listBranches();
    this.branchesState.set(branches);
    return branches;
  }

  async createBranch(name: string): Promise<readonly TeamBranchEntry[]> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return [];
    }
    const branches = await bridge.team.createBranch(name);
    this.branchesState.set(branches);
    await this.loadConfig();
    await this.profiles.reloadWorkspaceFromDisk();
    await this.refreshStatus();
    return branches;
  }

  async switchBranch(name: string): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return;
    }
    const branches = await bridge.team.switchBranch(name);
    this.branchesState.set(branches);
    await this.loadConfig();
    await this.profiles.reloadWorkspaceFromDisk();
    await this.refreshStatus();
  }

  async deleteBranch(name: string): Promise<readonly TeamBranchEntry[]> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return [];
    }
    const branches = await bridge.team.deleteBranch(name);
    this.branchesState.set(branches);
    await this.refreshStatus();
    return branches;
  }

  async resolveConflict(resolution: 'ours' | 'theirs' | 'abort'): Promise<void> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return;
    }
    const status = await bridge.team.resolveConflict(resolution);
    this.statusState.set(status);
    await this.profiles.hydrate();
    await this.profiles.reloadWorkspaceFromDisk();
  }

  async pauseAutoSync(): Promise<TeamWorkspaceConfig | null> {
    const current = this.configState();
    if (!current) {
      return null;
    }
    return this.saveConfig({
      autoSync: { ...current.autoSync, enabled: false },
    });
  }

  async resumeAutoSync(): Promise<TeamWorkspaceConfig | null> {
    const current = this.configState();
    if (!current) {
      return null;
    }
    return this.saveConfig({
      autoSync: { ...current.autoSync, enabled: true },
    });
  }

  async disconnect(): Promise<TeamSyncStatus> {
    const bridge = this.electron.bridge();
    if (!bridge?.team) {
      return this.statusState();
    }
    const status = await bridge.team.disconnect();
    this.statusState.set(status);
    const config = await bridge.team.getConfig();
    this.configState.set(config);
    this.historyState.set({ entries: [], hasMore: false });
    this.branchesState.set([]);
    this.commitDetailState.set(null);
    this.remoteCatalogState.set(null);
    void this.loadGitSetup();
    return status;
  }
}
