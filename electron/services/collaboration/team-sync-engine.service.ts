import type { BrowserWindow } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  TEAM_GITIGNORE_LINES,
  buildTeamRemoteCatalog,
  createDefaultTeamGitSetupContext,
  createDefaultTeamSyncStatus,
  deriveTeamSyncStatusId,
  ensureProfileSyncEntries,
  enrichTeamWorkspaceConfig,
  isActiveTeamProfileSyncEnabled,
  isSshGitRemoteUrl,
  resolveActiveTeamSyncTarget,
  resolveEffectiveShareScope,
  resolveShareScopeFileNames,
  resolveLegacyTeamProfilesManifestPath,
  normalizeRepoDataDir,
  resolveTeamRepoDataDirPath,
  resolveTeamProfilesManifestPath,
  resolveTeamProfilesManifestRelativePath,
  resolveTeamRepoRelativePath,
  summarizeShareScope,
  teamProfilesManifestSchema,
  teamWorkspaceConfigSchema,
  type ProfileSyncTarget,
  type TeamGitAuthMethod,
  type TeamGitSetupContext,
  type TeamBranchEntry,
  type TeamProfilesManifest,
  type TeamFetchRemoteCatalogOptions,
  type TeamFetchRemoteCatalogResult,
  type TeamRemoteCatalog,
  type TeamImportProfilesResult,
  type TeamPublishProfileResult,
  type TeamCreateProfileResult,
  type TeamSyncStatus,
  type TeamWorkspaceConfig,
} from '../../../shared/collaboration';
import { isTeamProfile, resolveProfileDir, type ProfilesState } from '../../../shared/config';

import { gitWorkspaceService } from './git-workspace.service';
import { teamCredentialsService } from './team-credentials.service';
import { teamProfileMirrorService } from './team-profile-mirror.service';
import {
  migrateTeamSyncConfig,
  resolveGlobalTeamConfigPath,
  type TeamSyncMigrationInput,
} from './team-sync-migration.service';

type StatusListener = (status: TeamSyncStatus) => void;
type ExternalChangeListener = (payload: { readonly fileName: string; readonly workspaceDir: string }) => void;
type SyncTargetsResolver = () => Promise<readonly ProfileSyncTarget[]>;
type ProfilesStateResolver = () => Promise<ProfilesState>;
type TeamProfilesMergedListener = (payload: { readonly addedProfileIds: readonly string[] }) => void;
type MergeTeamProfilesHandler = (
  teamRepoDir: string,
  repoDataDir: string,
) => Promise<{ readonly addedProfileIds: readonly string[] }>;
type ImportTeamProfilesHandler = (
  teamRepoDir: string,
  profileIds: readonly string[],
  repoDataDir: string,
) => Promise<{ readonly importedProfileIds: readonly string[] }>;
type PublishLocalProfileHandler = (profileId: string) => Promise<ProfilesState>;
type CreateTeamProfileHandler = (name: string) => Promise<{ readonly state: ProfilesState; readonly profileId: string }>;
type UnpublishProfileHandler = (profileId: string) => Promise<ProfilesState>;

const COMMIT_DEBOUNCE_MS = 2000;

function pendingKey(profileId: string, fileName: string): string {
  return `${profileId}::${fileName}`;
}

function parsePendingKey(key: string): { profileId: string; fileName: string } | null {
  const index = key.indexOf('::');
  if (index <= 0) {
    return null;
  }
  return { profileId: key.slice(0, index), fileName: key.slice(index + 2) };
}

/**
 * Orchestrates global Git team sync with a single repo and per-profile mirror rules.
 */
export class TeamSyncEngine {
  private sharedConfigDir: string | null = null;
  private workspaceDir: string | null = null;
  private config: TeamWorkspaceConfig = enrichTeamWorkspaceConfig(null);
  private status: TeamSyncStatus = createDefaultTeamSyncStatus();
  private statusListeners = new Set<StatusListener>();
  private externalChangeListeners = new Set<ExternalChangeListener>();
  private profilesMergedListeners = new Set<TeamProfilesMergedListener>();
  private pendingFiles = new Set<string>();
  private localSelfWriteUntil = new Map<string, number>();
  private commitTimer: ReturnType<typeof setTimeout> | null = null;
  private syncInProgress = false;
  private syncRescheduleRequested = false;
  private pullInterval: ReturnType<typeof setInterval> | null = null;
  private pushRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private mainWindow: BrowserWindow | null = null;
  private authMethod: TeamGitAuthMethod = 'none';
  private authReady = false;
  private gitSetupTask: Promise<void> | null = null;
  private getActiveProfileId: () => string | null = () => null;
  private getSyncTargets: SyncTargetsResolver = async () => [];
  private getProfilesState: ProfilesStateResolver = async () => {
    throw new Error('Profiles state resolver not configured');
  };
  private mergeTeamProfiles: MergeTeamProfilesHandler = async () => ({ addedProfileIds: [] });
  private importTeamProfiles: ImportTeamProfilesHandler = async () => ({ importedProfileIds: [] });
  private publishLocalProfile: PublishLocalProfileHandler = async (profileId) => {
    throw new Error(`Publish handler not configured for profile ${profileId}`);
  };
  private createTeamProfile: CreateTeamProfileHandler = async () => {
    throw new Error('Create team profile handler not configured');
  };
  private unpublishProfile: UnpublishProfileHandler = async (profileId) => {
    throw new Error(`Unpublish handler not configured for profile ${profileId}`);
  };

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  setActiveProfileIdResolver(resolver: () => string | null): void {
    this.getActiveProfileId = resolver;
  }

  setSyncTargetsResolver(resolver: SyncTargetsResolver): void {
    this.getSyncTargets = resolver;
  }

  setProfilesStateResolver(resolver: ProfilesStateResolver): void {
    this.getProfilesState = resolver;
  }

  setMergeTeamProfilesHandler(handler: MergeTeamProfilesHandler): void {
    this.mergeTeamProfiles = handler;
  }

  setImportTeamProfilesHandler(handler: ImportTeamProfilesHandler): void {
    this.importTeamProfiles = handler;
  }

  setPublishLocalProfileHandler(handler: PublishLocalProfileHandler): void {
    this.publishLocalProfile = handler;
  }

  setCreateTeamProfileHandler(handler: CreateTeamProfileHandler): void {
    this.createTeamProfile = handler;
  }

  setUnpublishProfileHandler(handler: UnpublishProfileHandler): void {
    this.unpublishProfile = handler;
  }

  onProfilesMerged(listener: TeamProfilesMergedListener): () => void {
    this.profilesMergedListeners.add(listener);
    return () => this.profilesMergedListeners.delete(listener);
  }

  onStatusChanged(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  onExternalChange(listener: ExternalChangeListener): () => void {
    this.externalChangeListeners.add(listener);
    return () => this.externalChangeListeners.delete(listener);
  }

  getStatus(): TeamSyncStatus {
    return this.status;
  }

  getConfig(): TeamWorkspaceConfig {
    return this.config;
  }

  getTeamRepoDir(): string | null {
    return this.workspaceDir;
  }

  getSharedConfigDir(): string | null {
    return this.sharedConfigDir;
  }

  /** Bootstraps global team sync from sharedConfigDir (runs migration when needed). */
  async initTeamSync(input: TeamSyncMigrationInput): Promise<void> {
    this.sharedConfigDir = input.sharedConfigDir;
    const { config } = await migrateTeamSyncConfig(input);
    this.config = config;
    this.workspaceDir = config.teamRepoDir;
    await this.ensureGitSetup(config.teamRepoDir);
    await this.autoConfigureFromGit();
    this.startPullInterval();
    await this.refreshStatus();
  }

  async loadConfig(): Promise<TeamWorkspaceConfig> {
    if (!this.sharedConfigDir) {
      this.config = enrichTeamWorkspaceConfig(null);
      return this.config;
    }
    const filePath = resolveGlobalTeamConfigPath(this.sharedConfigDir);
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      this.config = enrichTeamWorkspaceConfig(JSON.parse(raw), { sharedConfigDir: this.sharedConfigDir });
      this.workspaceDir = this.config.teamRepoDir;
    } catch {
      this.config = enrichTeamWorkspaceConfig(null, { sharedConfigDir: this.sharedConfigDir });
      await this.saveConfig(this.config);
    }
    return this.config;
  }

  async saveConfig(next: TeamWorkspaceConfig): Promise<TeamWorkspaceConfig> {
    if (!this.sharedConfigDir) {
      return next;
    }
    const parsed = teamWorkspaceConfigSchema.safeParse(next);
    if (!parsed.success) {
      this.config = enrichTeamWorkspaceConfig(null, { sharedConfigDir: this.sharedConfigDir });
    } else {
      this.config = parsed.data;
    }
    this.workspaceDir = this.config.teamRepoDir;
    await fs.mkdir(this.sharedConfigDir, { recursive: true });
    await fs.mkdir(this.config.teamRepoDir, { recursive: true });
    if (this.workspaceDir && normalizeRepoDataDir(this.config.repoDataDir).length > 0) {
      await fs.mkdir(resolveTeamRepoDataDirPath(this.workspaceDir, this.config.repoDataDir), { recursive: true });
    }
    await fs.writeFile(
      resolveGlobalTeamConfigPath(this.sharedConfigDir),
      `${JSON.stringify(this.config, null, 2)}\n`,
      'utf8',
    );
    await this.updateGitignore(this.config.teamRepoDir);
    this.startPullInterval();
    await this.refreshStatus();
    return this.config;
  }

  notifyFileSaved(workspaceDir: string, fileName: string): void {
    void this.handleFileSaved(workspaceDir, fileName);
  }

  private async handleFileSaved(workspaceDir: string, fileName: string): Promise<void> {
    if (!this.config.enabled || !this.config.autoSync.enabled || !this.config.autoSync.commitOnSave) {
      return;
    }

    if (this.isLocalSelfWrite(workspaceDir)) {
      return;
    }

    const targets = await this.getEnabledSyncTargets();
    const target = targets.find((entry) => this.normalizeDir(entry.dir) === this.normalizeDir(workspaceDir));
    if (!target) {
      return;
    }

    const shareFiles = this.shareFilesForProfile(target.profileId);
    if (!shareFiles.includes(fileName)) {
      return;
    }

    this.pendingFiles.add(pendingKey(target.profileId, fileName));
    this.markLocalSelfWrite(workspaceDir);
    this.updateStatusPartial({ status: 'dirty', pendingPush: true });
    if (this.commitTimer !== null) {
      clearTimeout(this.commitTimer);
    }
    this.commitTimer = setTimeout(() => {
      this.commitTimer = null;
      void this.runSyncCycle('save', workspaceDir);
    }, COMMIT_DEBOUNCE_MS);
  }

  handleExternalFileChange(fileName: string, workspaceDir: string): void {
    if (this.isLocalSelfWrite(workspaceDir)) {
      return;
    }
    const payload = { fileName, workspaceDir };
    for (const listener of this.externalChangeListeners) {
      listener(payload);
    }
  }

  async syncNow(): Promise<TeamSyncStatus> {
    await this.runSyncCycle('manual');
    return this.status;
  }

  async onAppFocus(): Promise<void> {
    if (!this.config.enabled || !this.config.autoSync.enabled || !this.config.autoSync.pullOnFocus) {
      return;
    }
    await this.runSyncCycle('focus');
  }

  async disconnectSync(): Promise<TeamSyncStatus> {
    this.clearTimers();
    this.pendingFiles.clear();
    this.syncInProgress = false;
    this.syncRescheduleRequested = false;
    this.authMethod = 'none';
    this.authReady = false;

    if (this.workspaceDir) {
      try {
        await gitWorkspaceService.removeRemote(this.workspaceDir);
      } catch {
        /* remote may already be absent */
      }
      await teamCredentialsService.clearToken(this.workspaceDir);
    }

    if (this.sharedConfigDir) {
      this.config = await this.saveConfig({
        ...this.config,
        enabled: false,
        remoteUrl: null,
        autoSync: { ...this.config.autoSync, enabled: false },
      });
    } else {
      this.config = enrichTeamWorkspaceConfig({
        ...this.config,
        enabled: false,
        remoteUrl: null,
        autoSync: { ...this.config.autoSync, enabled: false },
      });
    }

    this.updateStatus(createDefaultTeamSyncStatus());
    return this.status;
  }

  async createBranch(name: string): Promise<readonly TeamBranchEntry[]> {
    if (!this.workspaceDir) {
      throw new Error('Team workspace is not initialized');
    }

    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Invalid branch name');
    }

    this.updateStatusPartial({ status: 'syncing', operation: 'creating branch', lastError: null });

    try {
      if (this.config.enabled && this.config.remoteUrl) {
        await this.syncNow();
      }

      await gitWorkspaceService.createBranch(this.workspaceDir, trimmed);
      this.config = await this.saveConfig({ ...this.config, defaultBranch: trimmed });
      await this.publishBranch(trimmed);

      await this.refreshStatus();
      this.updateStatusPartial({
        status: 'synced',
        lastSyncedAt: new Date().toISOString(),
        operation: null,
        lastError: null,
      });

      return gitWorkspaceService.listBranches(this.workspaceDir);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to create branch';
      this.updateStatusPartial({ status: 'failed', lastError: message, operation: null });
      throw e;
    }
  }

  async switchBranch(name: string): Promise<readonly TeamBranchEntry[]> {
    if (!this.workspaceDir) {
      throw new Error('Team workspace is not initialized');
    }

    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Invalid branch name');
    }

    this.updateStatusPartial({ status: 'syncing', operation: 'switching branch', lastError: null });

    try {
      if (this.config.enabled && this.config.remoteUrl) {
        await this.syncNow();
      }

      await gitWorkspaceService.checkoutBranch(this.workspaceDir, trimmed);
      this.config = await this.saveConfig({ ...this.config, defaultBranch: trimmed });
      await this.publishBranch(trimmed);
      await this.applyPullToLocalProfiles();

      await this.refreshStatus();
      this.updateStatusPartial({
        status: 'synced',
        lastSyncedAt: new Date().toISOString(),
        operation: null,
        lastError: null,
      });

      return gitWorkspaceService.listBranches(this.workspaceDir);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to switch branch';
      this.updateStatusPartial({ status: 'failed', lastError: message, operation: null });
      throw e;
    }
  }

  async deleteBranch(name: string): Promise<readonly TeamBranchEntry[]> {
    if (!this.workspaceDir) {
      throw new Error('Team workspace is not initialized');
    }

    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Invalid branch name');
    }

    if (trimmed === this.config.defaultBranch) {
      throw new Error('Switch default branch before deleting it.');
    }

    this.updateStatusPartial({ status: 'syncing', operation: 'deleting branch', lastError: null });

    try {
      const token = await teamCredentialsService.loadToken(this.workspaceDir);
      const env = gitWorkspaceService.buildAuthEnv(token);
      const deleteRemote = Boolean(this.config.remoteUrl);

      await gitWorkspaceService.deleteBranch(this.workspaceDir, trimmed, { deleteRemote, env });

      await this.refreshStatus();
      this.updateStatusPartial({ status: 'synced', operation: null, lastError: null });

      return gitWorkspaceService.listBranches(this.workspaceDir);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to delete branch';
      this.updateStatusPartial({ status: 'failed', lastError: message, operation: null });
      throw e;
    }
  }

  async listRepoDirectories(): Promise<readonly string[]> {
    if (!this.workspaceDir) {
      throw new Error('Team workspace is not initialized');
    }

    return gitWorkspaceService.listRepoDirectories(this.workspaceDir);
  }

  async setRemote(url: string, token?: string | null): Promise<void> {
    if (!this.workspaceDir) {
      throw new Error('Team workspace is not initialized');
    }

    const trimmedToken = token?.trim() ?? '';
    if (isSshGitRemoteUrl(url)) {
      await teamCredentialsService.clearToken(this.workspaceDir);
    } else if (trimmedToken.length > 0) {
      await teamCredentialsService.saveToken(this.workspaceDir, trimmedToken);
    } else {
      await teamCredentialsService.clearToken(this.workspaceDir);
    }

    await this.ensureGitSetup(this.workspaceDir);
    await gitWorkspaceService.setRemote(this.workspaceDir, url);

    const storedToken = await teamCredentialsService.loadToken(this.workspaceDir);
    const env = gitWorkspaceService.buildAuthEnv(isSshGitRemoteUrl(url) ? null : storedToken);
    const access = await gitWorkspaceService.testRemoteAccess(this.workspaceDir, url, env);
    if (!access.ok) {
      const detail = access.stderr.trim();
      if (isSshGitRemoteUrl(url)) {
        throw new Error(
          detail ||
            'Cannot access SSH remote. Ensure your SSH key is loaded (ssh-agent) and you can run git ls-remote against this URL in a terminal.',
        );
      }
      throw new Error(
        detail ||
          'Cannot access remote. Configure Git credentials on your system or add an optional HTTPS access token.',
      );
    }

    await this.applyAuthFromProbe(url);
    this.config = await this.saveConfig({ ...this.config, enabled: true, remoteUrl: url });
    await this.fetchRemoteOnly();
  }

  /**
   * Fetches the remote team profile catalog. When {@link TeamFetchRemoteCatalogOptions.importMissing}
   * is true, registers and mirrors any remote profiles not yet imported locally.
   */
  async fetchRemoteCatalog(options?: TeamFetchRemoteCatalogOptions): Promise<TeamFetchRemoteCatalogResult> {
    const empty: TeamFetchRemoteCatalogResult = {
      profiles: [],
      fetchedAt: new Date().toISOString(),
      importedProfileIds: [],
    };

    if (!this.workspaceDir || !this.config.remoteUrl) {
      return empty;
    }

    await this.fetchRemoteOnly();
    let catalog = await this.readRemoteCatalog();
    let importedProfileIds: readonly string[] = [];

    if (options?.importMissing) {
      const missingIds = catalog.profiles.filter((profile) => !profile.imported).map((profile) => profile.id);
      importedProfileIds = await this.importProfilesIntoRegistry(missingIds);
      if (importedProfileIds.length > 0) {
        catalog = await this.readRemoteCatalog();
      }
    }

    return { ...catalog, importedProfileIds: [...importedProfileIds] };
  }

  async importProfiles(profileIds: readonly string[]): Promise<TeamImportProfilesResult> {
    if (!this.workspaceDir) {
      throw new Error('Team workspace is not initialized');
    }

    await this.fetchRemoteOnly();
    const importedProfileIds = await this.importProfilesIntoRegistry(profileIds);
    return { importedProfileIds: [...importedProfileIds] };
  }

  /**
   * Registers team profiles locally and mirrors repo content. Optionally runs a follow-up sync cycle.
   */
  private async importProfilesIntoRegistry(
    profileIds: readonly string[],
    options?: { readonly runSync?: boolean },
  ): Promise<readonly string[]> {
    if (!this.workspaceDir || profileIds.length === 0) {
      return [];
    }

    const result = await this.importTeamProfiles(this.workspaceDir, profileIds, this.config.repoDataDir);
    await this.afterTeamProfilesChanged(result.importedProfileIds);
    for (const profileId of result.importedProfileIds) {
      await this.mirrorTeamProfileFromRepo(profileId);
    }

    const runSync = options?.runSync !== false;
    if (runSync && result.importedProfileIds.length > 0) {
      await this.runSyncCycle('import', undefined, result.importedProfileIds[0]);
    }

    return result.importedProfileIds;
  }

  async publishLocalProfileToTeam(profileId: string): Promise<TeamPublishProfileResult> {
    if (!this.workspaceDir) {
      throw new Error('Team workspace is not initialized');
    }

    await this.publishLocalProfile(profileId);
    await this.afterTeamProfilesChanged([profileId]);
    await this.runSyncCycle('publish', undefined, profileId);
    return { profileId };
  }

  async createTeamProfileAndPublish(name: string): Promise<TeamCreateProfileResult> {
    if (!this.workspaceDir) {
      throw new Error('Team workspace is not initialized');
    }

    const { profileId } = await this.createTeamProfile(name);
    await this.afterTeamProfilesChanged([profileId]);
    await this.runSyncCycle('create-team-profile', undefined, profileId);
    return { profileId };
  }

  async unpublishTeamProfile(profileId: string): Promise<TeamPublishProfileResult> {
    if (!this.workspaceDir) {
      throw new Error('Team workspace is not initialized');
    }

    await this.unpublishProfile(profileId);
    const entries = this.config.profileSync.entries.filter((entry) => entry.profileId !== profileId);
    this.config = await this.saveConfig({ ...this.config, profileSync: { entries } });
    await this.runSyncCycle('unpublish', undefined, profileId);
    return { profileId };
  }

  /** Pulls latest remote data when switching to an active team profile. */
  async onActiveProfileChanged(): Promise<void> {
    const state = await this.getProfilesState();
    if (!isActiveTeamProfileSyncEnabled(state.profiles, state.activeProfileId)) {
      return;
    }
    if (!this.config.enabled || !this.config.remoteUrl) {
      return;
    }
    await this.runSyncCycle('profile-switch');
  }

  private async fetchRemoteOnly(): Promise<void> {
    if (!this.workspaceDir || !this.config.remoteUrl) {
      return;
    }

    await this.ensureGitSetup(this.workspaceDir);
    const token = await teamCredentialsService.loadToken(this.workspaceDir);
    const env = gitWorkspaceService.buildAuthEnv(isSshGitRemoteUrl(this.config.remoteUrl) ? null : token);
    await gitWorkspaceService.fetch(this.workspaceDir, env);

    const branch = this.config.defaultBranch;
    await gitWorkspaceService.ensureTrackingBranchFromRemote(this.workspaceDir, branch, env);

    const behindCount = await gitWorkspaceService.countCommitsBehindRemote(this.workspaceDir, branch);
    if (behindCount > 0) {
      const pullResult = await gitWorkspaceService.pullRebase(this.workspaceDir, branch, env);
      if (!pullResult.ok && !this.isNetworkError(pullResult.stderr)) {
        throw new Error(pullResult.stderr.trim() || 'Failed to fetch team profiles from remote');
      }
    }
  }

  private async readRemoteCatalog(): Promise<TeamRemoteCatalog> {
    if (!this.workspaceDir) {
      return { profiles: [], fetchedAt: new Date().toISOString() };
    }

    const manifest = await this.readTeamProfilesManifest();
    const state = await this.getProfilesState();
    const fetchedAt = new Date().toISOString();
    return buildTeamRemoteCatalog(manifest?.profiles ?? [], state.profiles, fetchedAt);
  }

  private async readTeamProfilesManifest(): Promise<TeamProfilesManifest | null> {
    if (!this.workspaceDir) {
      return null;
    }

    const candidatePaths = [
      resolveTeamProfilesManifestPath(this.workspaceDir, this.config.repoDataDir),
      resolveLegacyTeamProfilesManifestPath(this.workspaceDir),
    ];

    for (const manifestPath of candidatePaths) {
      try {
        const raw = await fs.readFile(manifestPath, 'utf8');
        const parsed = teamProfilesManifestSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          return parsed.data;
        }
      } catch {
        /* try next location */
      }
    }

    return null;
  }

  private async afterTeamProfilesChanged(profileIds: readonly string[]): Promise<void> {
    if (profileIds.length === 0) {
      return;
    }

    const state = await this.getProfilesState();
    const teamProfiles = state.profiles.filter((profile) => isTeamProfile(profile));
    const nextProfileSync = ensureProfileSyncEntries(teamProfiles, this.config.profileSync);
    this.config = await this.saveConfig({ ...this.config, profileSync: nextProfileSync });

    for (const listener of this.profilesMergedListeners) {
      listener({ addedProfileIds: profileIds });
    }
  }

  private async mirrorTeamProfileFromRepo(profileId: string): Promise<void> {
    if (!this.workspaceDir) {
      return;
    }

    const state = await this.getProfilesState();
    const localProfile = state.profiles.find((profile) => profile.id === profileId);
    if (!localProfile) {
      return;
    }

    const target: ProfileSyncTarget = {
      profileId,
      dir: resolveProfileDir(localProfile, state.profilesRoot),
    };
    const shareScope = resolveEffectiveShareScope(this.config, profileId);
    this.markLocalSelfWrite(target.dir);
    const mirrored = await teamProfileMirrorService.mirrorRepoToLocal({
      teamRepoDir: this.workspaceDir,
      target,
      shareScope,
      repoDataDir: this.config.repoDataDir,
    });
    for (const fileName of mirrored) {
      const payload = { fileName, workspaceDir: target.dir };
      for (const listener of this.externalChangeListeners) {
        listener(payload);
      }
    }
  }

  async getGitSetupContext(): Promise<TeamGitSetupContext> {
    return this.probeGitSetup();
  }

  isSelfWriteWindow(workspaceDir?: string): boolean {
    if (workspaceDir) {
      return this.isLocalSelfWrite(workspaceDir);
    }
    const now = Date.now();
    for (const until of this.localSelfWriteUntil.values()) {
      if (now < until) {
        return true;
      }
    }
    return false;
  }

  private normalizeDir(dir: string): string {
    return path.resolve(dir);
  }

  private isLocalSelfWrite(localDir: string): boolean {
    return Date.now() < (this.localSelfWriteUntil.get(this.normalizeDir(localDir)) ?? 0);
  }

  private markLocalSelfWrite(localDir: string): void {
    // Cover profile reload debounce + flushPending after team pull.
    this.localSelfWriteUntil.set(this.normalizeDir(localDir), Date.now() + 10_000);
  }

  private clearTimers(): void {
    if (this.commitTimer !== null) {
      clearTimeout(this.commitTimer);
      this.commitTimer = null;
    }
    if (this.pullInterval !== null) {
      clearInterval(this.pullInterval);
      this.pullInterval = null;
    }
    if (this.pushRetryTimer !== null) {
      clearTimeout(this.pushRetryTimer);
      this.pushRetryTimer = null;
    }
  }

  private startPullInterval(): void {
    if (this.pullInterval !== null) {
      clearInterval(this.pullInterval);
    }
    if (!this.config.enabled || !this.config.autoSync.enabled) {
      return;
    }
    this.pullInterval = setInterval(() => {
      void this.runSyncCycle('interval');
    }, this.config.autoSync.pullIntervalSec * 1000);
  }

  private async resolveTeamSyncTarget(profileId?: string | null): Promise<ProfileSyncTarget | null> {
    const state = await this.getProfilesState();
    const resolvedId = profileId ?? state.activeProfileId;
    if (!resolvedId) {
      return null;
    }
    const profile = state.profiles.find((entry) => entry.id === resolvedId);
    if (!profile || !isTeamProfile(profile)) {
      return null;
    }
    return {
      profileId: profile.id,
      dir: resolveProfileDir(profile, state.profilesRoot),
    };
  }

  private async getActiveTeamSyncTarget(): Promise<ProfileSyncTarget | null> {
    return this.resolveTeamSyncTarget(null);
  }

  private async getEnabledSyncTargets(profileIdOverride?: string): Promise<readonly ProfileSyncTarget[]> {
    const target = await this.resolveTeamSyncTarget(profileIdOverride ?? null);
    return target ? [target] : [];
  }

  private shareFilesForProfile(profileId: string): readonly string[] {
    return resolveShareScopeFileNames(resolveEffectiveShareScope(this.config, profileId));
  }

  private async ensureGitSetup(dir: string): Promise<void> {
    if (this.gitSetupTask) {
      return this.gitSetupTask;
    }
    this.gitSetupTask = this.runEnsureGitSetup(dir).finally(() => {
      this.gitSetupTask = null;
    });
    return this.gitSetupTask;
  }

  private async runEnsureGitSetup(dir: string): Promise<void> {
    try {
      const gitOk = await gitWorkspaceService.isGitAvailable();
      if (!gitOk) {
        return;
      }
      if (!(await gitWorkspaceService.detectRepo(dir))) {
        await gitWorkspaceService.initRepo(dir);
      }
      await this.updateGitignore(dir);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Git setup failed';
      this.updateStatusPartial({ status: 'failed', lastError: message });
    }
  }

  private async updateGitignore(dir: string): Promise<void> {
    const gitignorePath = path.join(dir, '.gitignore');
    let existing = '';
    try {
      existing = await fs.readFile(gitignorePath, 'utf8');
    } catch {
      /* new */
    }
    const marker = '# Testrix — personal / local-only';
    if (existing.includes(marker)) {
      return;
    }
    await fs.writeFile(gitignorePath, `${existing}\n${TEAM_GITIGNORE_LINES.join('\n')}\n`, 'utf8');
  }

  private async resolveSyncCycleTargets(
    localProfileDir?: string,
    profileIdOverride?: string,
  ): Promise<readonly ProfileSyncTarget[]> {
    const targets = await this.getEnabledSyncTargets(profileIdOverride);
    if (!localProfileDir) {
      return targets;
    }
    const normalized = this.normalizeDir(localProfileDir);
    return targets.filter((target) => this.normalizeDir(target.dir) === normalized);
  }

  private async runSyncCycle(trigger: string, localProfileDir?: string, profileIdOverride?: string): Promise<void> {
    if (!this.config.enabled || !this.config.remoteUrl || !this.workspaceDir) {
      await this.refreshStatus();
      return;
    }

    const targets = await this.resolveSyncCycleTargets(localProfileDir, profileIdOverride);

    if (this.syncInProgress) {
      this.syncRescheduleRequested = true;
      return;
    }

    this.syncInProgress = true;
    this.syncRescheduleRequested = false;
    this.updateStatusPartial({ status: 'syncing', operation: trigger, lastError: null, conflictedFiles: [] });

    try {
      const gitOk = await gitWorkspaceService.isGitAvailable();
      if (!gitOk) {
        this.updateStatusPartial({
          status: 'failed',
          lastError: 'Git is not installed or not on PATH.',
          gitAvailable: false,
          operation: null,
        });
        return;
      }

      await this.ensureGitSetup(this.workspaceDir);
      const token = await teamCredentialsService.loadToken(this.workspaceDir);
      const env = gitWorkspaceService.buildAuthEnv(token);
      const branch = this.config.defaultBranch;
      const repoPathsToStage = new Set<string>();

      if (targets.length > 0) {
        for (const target of targets) {
          const shareScope = resolveEffectiveShareScope(this.config, target.profileId);
          const shareFiles = resolveShareScopeFileNames(shareScope);
          const pendingForProfile = [...this.pendingFiles]
            .map(parsePendingKey)
            .filter((entry): entry is { profileId: string; fileName: string } => entry !== null)
            .filter((entry) => entry.profileId === target.profileId)
            .map((entry) => entry.fileName)
            .filter((fileName) => shareFiles.includes(fileName));

          const forceFullMirror =
            trigger === 'publish' ||
            trigger === 'create-team-profile' ||
            trigger === 'setup' ||
            trigger === 'import';

          const filesToMirror =
            pendingForProfile.length > 0 ? pendingForProfile : forceFullMirror ? shareFiles : [];

          if (filesToMirror.length > 0) {
            await teamProfileMirrorService.mirrorLocalToRepo({
              teamRepoDir: this.workspaceDir,
              target,
              shareScope,
              repoDataDir: this.config.repoDataDir,
              fileNames: filesToMirror,
            });
            for (const fileName of filesToMirror) {
              repoPathsToStage.add(resolveTeamRepoRelativePath(target.profileId, fileName, this.config.repoDataDir));
            }
          }
        }
      }

      const shouldUpdateManifest =
        targets.length > 0 ||
        trigger === 'publish' ||
        trigger === 'create-team-profile' ||
        trigger === 'unpublish' ||
        trigger === 'import';

      if (shouldUpdateManifest) {
        await this.writeTeamProfilesManifest();
        repoPathsToStage.add(resolveTeamProfilesManifestRelativePath(this.config.repoDataDir));
      }

      const stagedFiles = [...repoPathsToStage];
      let committed = false;
      if (stagedFiles.length > 0) {
        await gitWorkspaceService.stageFiles(this.workspaceDir, stagedFiles);
        committed = await gitWorkspaceService.commit(
          this.workspaceDir,
          `Testrix: sync ${stagedFiles.join(', ')}`,
          this.config.commitAuthor,
        );
        if (committed) {
          for (const key of [...this.pendingFiles]) {
            const parsed = parsePendingKey(key);
            if (parsed && targets.some((target) => target.profileId === parsed.profileId)) {
              this.pendingFiles.delete(key);
            }
          }
        }
      }

      await gitWorkspaceService.fetch(this.workspaceDir, env);
      await gitWorkspaceService.ensureTrackingBranchFromRemote(this.workspaceDir, branch, env);
      const repoStatus = await gitWorkspaceService.status(this.workspaceDir);
      let needsPull = repoStatus.behind > 0;
      let needsPush = repoStatus.ahead > 0 || committed;

      if (
        !needsPull &&
        this.config.remoteUrl &&
        (trigger === 'setup' || trigger === 'auto-detect' || trigger === 'manual')
      ) {
        const behindCount = await gitWorkspaceService.countCommitsBehindRemote(this.workspaceDir, branch);
        needsPull = behindCount > 0;
      }

      if (!needsPull && !needsPush) {
        this.authReady = true;
        this.updateStatusPartial({
          status: this.pendingFiles.size > 0 ? 'dirty' : 'synced',
          lastSyncedAt: new Date().toISOString(),
          pendingPush: this.pendingFiles.size > 0,
          lastError: null,
          operation: null,
          authReady: true,
          conflictedFiles: [],
        });
        return;
      }

      if (needsPull && this.pendingFiles.size > 0) {
        needsPull = false;
        needsPush = true;
      }

      if (!needsPull && needsPush) {
        this.updateStatusPartial({ operation: 'pushing' });
        const pushOnlyResult = await gitWorkspaceService.push(this.workspaceDir, branch, env);
        if (!pushOnlyResult.ok) {
          if (this.isNetworkError(pushOnlyResult.stderr)) {
            this.schedulePushRetry();
            this.updateStatusPartial({
              status: 'offline',
              pendingPush: true,
              lastError: pushOnlyResult.stderr,
              operation: null,
            });
            return;
          }
          if (this.isAuthError(pushOnlyResult.stderr)) {
            this.authReady = false;
            this.updateStatusPartial({
              status: 'failed',
              lastError: 'Authentication failed. Configure Git credentials or add an access token.',
              operation: null,
              authReady: false,
            });
            return;
          }
          this.updateStatusPartial({ status: 'failed', lastError: pushOnlyResult.stderr, operation: null });
          return;
        }

        this.authReady = true;
        this.updateStatusPartial({
          status: 'synced',
          lastSyncedAt: new Date().toISOString(),
          pendingPush: false,
          lastError: null,
          operation: null,
          authReady: true,
          conflictedFiles: [],
        });
        return;
      }

      this.updateStatusPartial({ operation: 'pulling' });
      const pullResult = await gitWorkspaceService.pullRebase(this.workspaceDir, branch, env);
      if (!pullResult.ok) {
        const repoStatus = await gitWorkspaceService.status(this.workspaceDir);
        if (repoStatus.conflict) {
          const conflictedFiles = await gitWorkspaceService.listConflictedFiles(this.workspaceDir);
          this.updateStatusPartial({
            status: 'conflict',
            lastError: pullResult.stderr,
            operation: null,
            conflictedFiles,
          });
          this.emitOpenPanel();
          return;
        }
        if (this.isNetworkError(pullResult.stderr)) {
          this.schedulePushRetry();
          this.updateStatusPartial({ status: 'offline', lastError: pullResult.stderr, operation: null });
          return;
        }
        if (this.isAuthError(pullResult.stderr)) {
          this.authReady = false;
          this.updateStatusPartial({
            status: 'failed',
            lastError: 'Authentication failed. Configure Git credentials or add an access token.',
            operation: null,
            authReady: false,
          });
          return;
        }
        this.updateStatusPartial({
          status: 'failed',
          lastError: pullResult.stderr.trim() || 'Pull failed',
          operation: null,
        });
        return;
      }

      this.updateStatusPartial({ operation: 'pushing' });
      const pushResult = await gitWorkspaceService.push(this.workspaceDir, branch, env);
      if (!pushResult.ok) {
        if (this.isNetworkError(pushResult.stderr)) {
          this.schedulePushRetry();
          this.updateStatusPartial({
            status: 'offline',
            pendingPush: true,
            lastError: pushResult.stderr,
            operation: null,
          });
          return;
        }
        if (this.isAuthError(pushResult.stderr)) {
          this.authReady = false;
          this.updateStatusPartial({
            status: 'failed',
            lastError: 'Authentication failed. Configure Git credentials or add an access token.',
            operation: null,
            authReady: false,
          });
          return;
        }
        this.updateStatusPartial({ status: 'failed', lastError: pushResult.stderr, operation: null });
        return;
      }

      const catalogAfterPull = await this.readRemoteCatalog();
      const missingAfterPull = catalogAfterPull.profiles
        .filter((profile) => !profile.imported)
        .map((profile) => profile.id);
      await this.importProfilesIntoRegistry(missingAfterPull, { runSync: false });
      await this.applyPullToLocalProfiles();
      this.authReady = true;
      this.updateStatusPartial({
        status: 'synced',
        lastSyncedAt: new Date().toISOString(),
        pendingPush: false,
        lastError: null,
        operation: null,
        authReady: true,
        conflictedFiles: [],
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Sync failed';
      this.updateStatusPartial({ status: 'failed', lastError: message, operation: null });
    } finally {
      this.syncInProgress = false;
      await this.refreshStatus();
      if (this.syncRescheduleRequested) {
        this.syncRescheduleRequested = false;
        void this.runSyncCycle('reschedule');
      }
    }
  }

  private async writeTeamProfilesManifest(): Promise<void> {
    if (!this.workspaceDir) {
      return;
    }

    const state = await this.getProfilesState();
    const teamProfiles = state.profiles.filter((profile) => isTeamProfile(profile));
    const profiles = teamProfiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      shareScopeLabel: summarizeShareScope(resolveEffectiveShareScope(this.config, profile.id)),
    }));

    const manifest: TeamProfilesManifest = teamProfilesManifestSchema.parse({
      schemaVersion: 1,
      profiles,
    });

    await fs.writeFile(
      resolveTeamProfilesManifestPath(this.workspaceDir, this.config.repoDataDir),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
  }

  private async applyPullToLocalProfiles(): Promise<void> {
    if (!this.workspaceDir || this.pendingFiles.size > 0) {
      return;
    }

    const target = await this.getActiveTeamSyncTarget();
    if (!target) {
      return;
    }

    const shareScope = resolveEffectiveShareScope(this.config, target.profileId);
    this.markLocalSelfWrite(target.dir);
    const mirrored = await teamProfileMirrorService.mirrorRepoToLocal({
      teamRepoDir: this.workspaceDir,
      target,
      shareScope,
      repoDataDir: this.config.repoDataDir,
    });
    for (const fileName of mirrored) {
      const payload = { fileName, workspaceDir: target.dir };
      for (const listener of this.externalChangeListeners) {
        listener(payload);
      }
    }
  }

  private async publishBranch(branch: string): Promise<void> {
    if (!this.workspaceDir) {
      return;
    }

    const remoteUrl = this.config.remoteUrl ?? (await gitWorkspaceService.getRemoteUrl(this.workspaceDir));
    if (!remoteUrl) {
      return;
    }

    const token = await teamCredentialsService.loadToken(this.workspaceDir);
    const env = gitWorkspaceService.buildAuthEnv(token);
    this.updateStatusPartial({ operation: 'pushing branch' });

    const pushResult = await gitWorkspaceService.push(this.workspaceDir, branch, env);
    if (!pushResult.ok) {
      if (this.isAuthError(pushResult.stderr)) {
        this.authReady = false;
        throw new Error(
          'Authentication failed while pushing branch. Configure Git credentials or add an access token.',
        );
      }
      throw new Error(pushResult.stderr.trim() || 'Failed to push branch to remote');
    }

    this.authReady = true;
  }

  private schedulePushRetry(): void {
    if (this.pushRetryTimer !== null) {
      clearTimeout(this.pushRetryTimer);
    }
    this.pushRetryTimer = setTimeout(() => {
      this.pushRetryTimer = null;
      void this.runSyncCycle('retry');
    }, this.config.autoSync.pushRetrySec * 1000);
  }

  private isNetworkError(stderr: string): boolean {
    const lower = stderr.toLowerCase();
    return (
      lower.includes('could not resolve') ||
      lower.includes('unable to access') ||
      lower.includes('connection refused') ||
      lower.includes('network') ||
      lower.includes('timed out')
    );
  }

  private isAuthError(stderr: string): boolean {
    const lower = stderr.toLowerCase();
    return (
      lower.includes('401') ||
      lower.includes('403') ||
      lower.includes('authentication failed') ||
      lower.includes('invalid username or password') ||
      lower.includes('support for password authentication was removed')
    );
  }

  private async autoConfigureFromGit(): Promise<void> {
    if (!this.workspaceDir || this.config.enabled) {
      return;
    }

    const setup = await this.probeGitSetup();
    if (!setup.canAutoEnable || !setup.remoteUrl) {
      return;
    }

    const patch: Partial<TeamWorkspaceConfig> = {
      enabled: true,
      remoteUrl: setup.remoteUrl,
    };

    if (setup.identity.name && setup.identity.email) {
      patch.commitAuthor = {
        name: setup.identity.name,
        email: setup.identity.email,
      };
    }

    this.config = await this.saveConfig({ ...this.config, ...patch });
    void this.fetchRemoteCatalog({ importMissing: true });
  }

  private async probeGitSetup(): Promise<TeamGitSetupContext> {
    const gitAvailable = await gitWorkspaceService.isGitAvailable();
    if (!this.workspaceDir || !gitAvailable) {
      return createDefaultTeamGitSetupContext({ gitAvailable });
    }

    const repoDetected = await gitWorkspaceService.detectRepo(this.workspaceDir);
    const gitRemoteUrl = repoDetected ? await gitWorkspaceService.getRemoteUrl(this.workspaceDir) : null;
    const identity = repoDetected
      ? await gitWorkspaceService.readUserIdentity(this.workspaceDir)
      : { name: null, email: null };
    const storedToken = await teamCredentialsService.loadToken(this.workspaceDir);
    const remoteUrl = this.config.enabled ? this.config.remoteUrl || gitRemoteUrl : this.config.remoteUrl;

    let authMethod: TeamGitAuthMethod = 'none';
    let canAccessRemote = false;
    let message: string | null = null;

    if (remoteUrl) {
      if (storedToken && !isSshGitRemoteUrl(remoteUrl)) {
        const tokenEnv = gitWorkspaceService.buildAuthEnv(storedToken);
        const tokenResult = await gitWorkspaceService.testRemoteAccess(this.workspaceDir, remoteUrl, tokenEnv);
        if (tokenResult.ok) {
          authMethod = 'token';
          canAccessRemote = true;
          message = 'Using saved personal access token';
        }
      }

      if (!canAccessRemote) {
        const systemEnv = gitWorkspaceService.buildAuthEnv(null);
        const systemResult = await gitWorkspaceService.testRemoteAccess(this.workspaceDir, remoteUrl, systemEnv);
        if (systemResult.ok) {
          authMethod = 'system';
          canAccessRemote = true;
          message = isSshGitRemoteUrl(remoteUrl)
            ? 'Using system SSH credentials'
            : 'Using system Git credentials (Credential Manager, SSH, or gh auth)';
        } else if (isSshGitRemoteUrl(remoteUrl)) {
          message =
            'SSH remote — uses your system SSH keys. Connect to verify access; no HTTPS token is needed.';
        } else {
          message = storedToken
            ? 'Saved token cannot access remote — try updating credentials'
            : 'Authentication required — configure Git credentials or add an optional HTTPS access token';
        }
      }
    } else {
      message = 'Add a remote URL to connect your team workspace';
    }

    this.authMethod = authMethod;
    this.authReady = canAccessRemote;

    return createDefaultTeamGitSetupContext({
      gitAvailable,
      repoDetected,
      remoteUrl,
      gitRemoteUrl,
      identity,
      authMethod,
      canAccessRemote,
      hasStoredToken: Boolean(storedToken),
      canAutoEnable: canAccessRemote && Boolean(remoteUrl) && !this.config.enabled,
      message,
    });
  }

  private async applyAuthFromProbe(remoteUrl: string): Promise<void> {
    if (!this.workspaceDir) {
      return;
    }

    const storedToken = await teamCredentialsService.loadToken(this.workspaceDir);
    if (storedToken && !isSshGitRemoteUrl(remoteUrl)) {
      const tokenEnv = gitWorkspaceService.buildAuthEnv(storedToken);
      const tokenResult = await gitWorkspaceService.testRemoteAccess(this.workspaceDir, remoteUrl, tokenEnv);
      if (tokenResult.ok) {
        this.authMethod = 'token';
        this.authReady = true;
        return;
      }
    }

    const systemEnv = gitWorkspaceService.buildAuthEnv(null);
    const systemResult = await gitWorkspaceService.testRemoteAccess(this.workspaceDir, remoteUrl, systemEnv);
    this.authMethod = systemResult.ok ? 'system' : 'none';
    this.authReady = systemResult.ok;
  }

  async refreshStatus(): Promise<TeamSyncStatus> {
    const gitAvailable = await gitWorkspaceService.isGitAvailable();
    if (!this.workspaceDir) {
      this.updateStatus(createDefaultTeamSyncStatus());
      return this.status;
    }

    const repoDetected = gitAvailable ? await gitWorkspaceService.detectRepo(this.workspaceDir) : false;
    let branch: string | null = null;
    let ahead = 0;
    let behind = 0;
    let conflictedFiles: readonly string[] = [];

    if (repoDetected) {
      const repoStatus = await gitWorkspaceService.status(this.workspaceDir);
      branch = repoStatus.branch;
      ahead = repoStatus.ahead;
      behind = repoStatus.behind;
      if (repoStatus.conflict) {
        conflictedFiles = await gitWorkspaceService.listConflictedFiles(this.workspaceDir);
        this.updateStatusPartial({
          status: 'conflict',
          branch,
          ahead,
          behind,
          gitAvailable,
          repoDetected,
          authMethod: this.authMethod,
          authReady: this.authReady,
          conflictedFiles: [...conflictedFiles],
        });
        return this.status;
      }
    }

    const primaryPending = this.pendingFiles.size;
    const statusId = deriveTeamSyncStatusId({
      current: this.status,
      enabled: this.config.enabled,
      remoteUrl: this.config.remoteUrl,
      primaryPending,
      anyPending: primaryPending > 0,
    });

    this.updateStatusPartial({
      status: statusId,
      branch,
      ahead,
      behind,
      gitAvailable,
      repoDetected,
      authMethod: this.authMethod,
      authReady: this.authReady,
      conflictedFiles: [...conflictedFiles],
    });
    return this.status;
  }

  private updateStatusPartial(patch: Partial<TeamSyncStatus>): void {
    this.updateStatus({ ...this.status, ...patch });
  }

  private updateStatus(next: TeamSyncStatus): void {
    this.status = next;
    for (const listener of this.statusListeners) {
      listener(this.status);
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('team:statusChanged', this.status);
    }
  }

  private emitOpenPanel(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('team:openPanel');
    }
  }
}

export const teamSyncEngine = new TeamSyncEngine();
