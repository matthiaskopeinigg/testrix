import type { BrowserWindow } from 'electron';

import {
  enrichTeamWorkspaceConfig,
  listProfileSyncTargets,
  resolveEffectiveShareScope,
  teamConflictResolutionSchema,
  teamFetchRemoteCatalogOptionsSchema,
  teamWorkspaceConfigSchema,
  type TeamWorkspaceConfig,
} from '../../../shared/collaboration';
import type { ProfilesState } from '../../../shared/config';

import { configFileWatcherService } from '../../services/collaboration/config-file-watcher.service';
import { gitWorkspaceService } from '../../services/collaboration/git-workspace.service';
import { teamSyncEngine } from '../../services/collaboration/team-sync-engine.service';
import { TeamChannels } from '../channels/team.channels';
import { wrapInvokeHandler } from '../wrap-ipc-handler';
import type { IpcMainBinder } from '../register-ipc';

export interface TeamHandlerDeps {
  readonly getTeamRepoDir: () => string | null;
  readonly getMainWindow: () => BrowserWindow | null;
  readonly getActiveProfileId: () => string | null;
  readonly getProfilesState: () => Promise<ProfilesState>;
  readonly mergeTeamProfilesFromManifest: (
    teamRepoDir: string,
    repoDataDir: string,
  ) => Promise<{ readonly addedProfileIds: readonly string[] }>;
  readonly importTeamProfiles: (
    teamRepoDir: string,
    profileIds: readonly string[],
    repoDataDir: string,
  ) => Promise<{ readonly importedProfileIds: readonly string[] }>;
  readonly publishLocalProfile: (profileId: string) => Promise<ProfilesState>;
  readonly createTeamProfile: (name: string) => Promise<{ readonly state: ProfilesState; readonly profileId: string }>;
  readonly unpublishProfile: (profileId: string) => Promise<ProfilesState>;
  readonly migrateLegacyTeamProfileKinds: (teamProfileIds: readonly string[]) => Promise<ProfilesState>;
  readonly initTeamSync: () => Promise<void>;
}

export async function refreshTeamSyncWatchers(deps: Pick<TeamHandlerDeps, 'getProfilesState'>): Promise<void> {
  const state = await deps.getProfilesState();
  const config = teamSyncEngine.getConfig();
  const targets = listProfileSyncTargets(state.profiles, state.profilesRoot, config.profileSync, state.activeProfileId);
  if (targets.length === 0) {
    await configFileWatcherService.stop();
    return;
  }

  await configFileWatcherService.start(
    targets.map((target) => ({
      dir: target.dir,
      shareScope: resolveEffectiveShareScope(config, target.profileId),
    })),
  );
}

export function registerTeamHandlers(ipc: IpcMainBinder, deps: TeamHandlerDeps): void {
  teamSyncEngine.setMainWindow(deps.getMainWindow());
  teamSyncEngine.setActiveProfileIdResolver(deps.getActiveProfileId);
  teamSyncEngine.setProfilesStateResolver(deps.getProfilesState);
  teamSyncEngine.setMergeTeamProfilesHandler(deps.mergeTeamProfilesFromManifest);
  teamSyncEngine.setImportTeamProfilesHandler(deps.importTeamProfiles);
  teamSyncEngine.setPublishLocalProfileHandler(deps.publishLocalProfile);
  teamSyncEngine.setCreateTeamProfileHandler(deps.createTeamProfile);
  teamSyncEngine.setUnpublishProfileHandler(deps.unpublishProfile);
  teamSyncEngine.setSyncTargetsResolver(async () => {
    const state = await deps.getProfilesState();
    return listProfileSyncTargets(
      state.profiles,
      state.profilesRoot,
      teamSyncEngine.getConfig().profileSync,
      state.activeProfileId,
    );
  });

  teamSyncEngine.onExternalChange((payload) => {
    const win = deps.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(TeamChannels.externalFileChanged, payload);
    }
  });

  teamSyncEngine.onProfilesMerged((payload) => {
    const win = deps.getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send(TeamChannels.profilesMerged, payload);
    }
  });

  ipc.handle(
    TeamChannels.getStatus,
    wrapInvokeHandler(TeamChannels.getStatus, async () => teamSyncEngine.refreshStatus()),
  );

  ipc.handle(
    TeamChannels.getConfig,
    wrapInvokeHandler(TeamChannels.getConfig, async () => teamSyncEngine.loadConfig()),
  );

  ipc.handle(
    TeamChannels.setConfig,
    wrapInvokeHandler(TeamChannels.setConfig, async (_e, raw: unknown) => {
      const patch = (raw ?? {}) as Partial<TeamWorkspaceConfig>;
      const current = teamSyncEngine.getConfig();
      const merged = enrichTeamWorkspaceConfig(
        {
          ...current,
          ...patch,
          shareScope: { ...current.shareScope, ...patch.shareScope },
          profileSync: {
            ...current.profileSync,
            ...(patch.profileSync ?? {}),
            entries: patch.profileSync?.entries ?? current.profileSync.entries,
          },
          autoSync: { ...current.autoSync, ...patch.autoSync },
          commitAuthor: { ...current.commitAuthor, ...patch.commitAuthor },
        },
        { sharedConfigDir: teamSyncEngine.getSharedConfigDir() ?? undefined },
      );
      const saved = await teamSyncEngine.saveConfig(teamWorkspaceConfigSchema.parse(merged));
      await refreshTeamSyncWatchers(deps);
      return saved;
    }),
  );

  ipc.handle(
    TeamChannels.getGitSetup,
    wrapInvokeHandler(TeamChannels.getGitSetup, async () => teamSyncEngine.getGitSetupContext()),
  );

  ipc.handle(
    TeamChannels.setRemote,
    wrapInvokeHandler(TeamChannels.setRemote, async (_e, payload: unknown) => {
      const { url, token } = payload as { url: string; token?: string | null };
      if (typeof url !== 'string') {
        throw new Error('Invalid remote payload');
      }
      await teamSyncEngine.setRemote(url, typeof token === 'string' ? token : null);
      await refreshTeamSyncWatchers(deps);
      return teamSyncEngine.getStatus();
    }),
  );

  ipc.handle(
    TeamChannels.fetchRemoteCatalog,
    wrapInvokeHandler(TeamChannels.fetchRemoteCatalog, async (_event, options: unknown) => {
      const parsed = teamFetchRemoteCatalogOptionsSchema.safeParse(options ?? {});
      return teamSyncEngine.fetchRemoteCatalog(parsed.success ? parsed.data : undefined);
    }),
  );

  ipc.handle(
    TeamChannels.importProfiles,
    wrapInvokeHandler(TeamChannels.importProfiles, async (_e, profileIds: unknown) => {
      if (!Array.isArray(profileIds)) {
        throw new Error('Invalid profile id list');
      }
      const ids = profileIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
      const result = await teamSyncEngine.importProfiles(ids);
      await refreshTeamSyncWatchers(deps);
      return result;
    }),
  );

  ipc.handle(
    TeamChannels.publishLocalProfile,
    wrapInvokeHandler(TeamChannels.publishLocalProfile, async (_e, profileId: unknown) => {
      if (typeof profileId !== 'string' || profileId.trim().length === 0) {
        throw new Error('Invalid profile id');
      }
      const result = await teamSyncEngine.publishLocalProfileToTeam(profileId.trim());
      await refreshTeamSyncWatchers(deps);
      return result;
    }),
  );

  ipc.handle(
    TeamChannels.createTeamProfile,
    wrapInvokeHandler(TeamChannels.createTeamProfile, async (_e, name: unknown) => {
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('Invalid profile name');
      }
      const result = await teamSyncEngine.createTeamProfileAndPublish(name.trim());
      await refreshTeamSyncWatchers(deps);
      return result;
    }),
  );

  ipc.handle(
    TeamChannels.unpublishProfile,
    wrapInvokeHandler(TeamChannels.unpublishProfile, async (_e, profileId: unknown) => {
      if (typeof profileId !== 'string' || profileId.trim().length === 0) {
        throw new Error('Invalid profile id');
      }
      const result = await teamSyncEngine.unpublishTeamProfile(profileId.trim());
      await refreshTeamSyncWatchers(deps);
      return result;
    }),
  );

  ipc.handle(
    TeamChannels.syncNow,
    wrapInvokeHandler(TeamChannels.syncNow, async () => teamSyncEngine.syncNow()),
  );

  ipc.handle(
    TeamChannels.onFocus,
    wrapInvokeHandler(TeamChannels.onFocus, async () => {
      await teamSyncEngine.onAppFocus();
      return teamSyncEngine.getStatus();
    }),
  );

  ipc.handle(
    TeamChannels.getHistory,
    wrapInvokeHandler(TeamChannels.getHistory, async (_e, payload: unknown) => {
      const { limit = 20, skip = 0 } = (payload ?? {}) as { limit?: number; skip?: number };
      const dir = deps.getTeamRepoDir();
      if (!dir) {
        return { entries: [], hasMore: false };
      }
      const entries = await gitWorkspaceService.log(dir, limit, skip);
      return { entries, hasMore: entries.length >= limit };
    }),
  );

  ipc.handle(
    TeamChannels.getCommitDetail,
    wrapInvokeHandler(TeamChannels.getCommitDetail, async (_e, hash: unknown) => {
      if (typeof hash !== 'string') {
        throw new Error('Invalid commit hash');
      }
      const dir = deps.getTeamRepoDir();
      if (!dir) {
        throw new Error('Team workspace is not initialized');
      }
      const detail = await gitWorkspaceService.getCommitDetail(dir, hash);
      if (!detail) {
        throw new Error('Commit not found');
      }
      return detail;
    }),
  );

  ipc.handle(
    TeamChannels.getCommitDiff,
    wrapInvokeHandler(TeamChannels.getCommitDiff, async (_e, hash: unknown) => {
      if (typeof hash !== 'string') {
        throw new Error('Invalid commit hash');
      }
      const dir = deps.getTeamRepoDir();
      if (!dir) {
        throw new Error('Team workspace is not initialized');
      }
      return gitWorkspaceService.diffCommit(dir, hash);
    }),
  );

  ipc.handle(
    TeamChannels.listBranches,
    wrapInvokeHandler(TeamChannels.listBranches, async () => {
      const dir = deps.getTeamRepoDir();
      if (!dir) {
        return [];
      }
      return gitWorkspaceService.listBranches(dir);
    }),
  );

  ipc.handle(
    TeamChannels.createBranch,
    wrapInvokeHandler(TeamChannels.createBranch, async (_e, name: unknown) => {
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('Invalid branch name');
      }
      return teamSyncEngine.createBranch(name.trim());
    }),
  );

  ipc.handle(
    TeamChannels.switchBranch,
    wrapInvokeHandler(TeamChannels.switchBranch, async (_e, name: unknown) => {
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('Invalid branch name');
      }
      return teamSyncEngine.switchBranch(name.trim());
    }),
  );

  ipc.handle(
    TeamChannels.deleteBranch,
    wrapInvokeHandler(TeamChannels.deleteBranch, async (_e, name: unknown) => {
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('Invalid branch name');
      }
      return teamSyncEngine.deleteBranch(name.trim());
    }),
  );

  ipc.handle(
    TeamChannels.resolveConflict,
    wrapInvokeHandler(TeamChannels.resolveConflict, async (_e, resolution: unknown) => {
      const parsed = teamConflictResolutionSchema.parse(resolution);
      const dir = deps.getTeamRepoDir();
      if (!dir) {
        throw new Error('Team workspace is not initialized');
      }
      await gitWorkspaceService.resolveConflict(dir, parsed);
      await teamSyncEngine.syncNow();
      return teamSyncEngine.getStatus();
    }),
  );

  ipc.handle(
    TeamChannels.listRepoDirectories,
    wrapInvokeHandler(TeamChannels.listRepoDirectories, async () => teamSyncEngine.listRepoDirectories()),
  );

  ipc.handle(
    TeamChannels.linkWorkspace,
    wrapInvokeHandler(TeamChannels.linkWorkspace, async () => {
      await deps.initTeamSync();
      await refreshTeamSyncWatchers(deps);
      return teamSyncEngine.getStatus();
    }),
  );

  ipc.handle(
    TeamChannels.disconnect,
    wrapInvokeHandler(TeamChannels.disconnect, async () => {
      const status = await teamSyncEngine.disconnectSync();
      await refreshTeamSyncWatchers(deps);
      return status;
    }),
  );
}

export async function initTeamSyncFromBoot(deps: TeamHandlerDeps): Promise<void> {
  teamSyncEngine.setMainWindow(deps.getMainWindow());
  await deps.initTeamSync();
  const config = teamSyncEngine.getConfig();
  const legacyTeamIds = config.profileSync.entries.map((entry) => entry.profileId);
  if (legacyTeamIds.length > 0) {
    await deps.migrateLegacyTeamProfileKinds(legacyTeamIds);
  }
  await refreshTeamSyncWatchers(deps);
}

export async function refreshTeamSyncOnProfileSwitch(deps: Pick<TeamHandlerDeps, 'getProfilesState'>): Promise<void> {
  await refreshTeamSyncWatchers(deps);
  await teamSyncEngine.onActiveProfileChanged();
  await teamSyncEngine.refreshStatus();
}

export function notifyTeamFileSaved(workspaceDir: string, fileName: string): void {
  teamSyncEngine.notifyFileSaved(workspaceDir, fileName);
}
