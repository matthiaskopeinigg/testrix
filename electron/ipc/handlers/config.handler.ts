import type { IpcMainInvokeEvent } from 'electron';
import { BrowserWindow, dialog, shell } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  COLLECTIONS_FILE_NAME,
  ENVIRONMENTS_FILE_NAME,
  HISTORY_FILE_NAME,
  PROFILES_FILE_NAME,
  SESSION_FILE_NAME,
  SETTINGS_FILE_NAME,
  createDefaultSession,
  createDefaultSettings,
  settingsFileSchema,
  settingsPatchSchema,
  sessionPatchSchema,
  collectionsFileSchema,
  environmentsFileSchema,
  historyFileSchema,
  readWorkspaceFileMeta,
  WORKSPACE_FILE_DESCRIPTORS,
} from '../../../shared/config';
import {
  CAPTURE_FILE_NAME,
  COOKIE_JAR_FILE_NAME,
  INTERCEPTOR_FILE_NAME,
  LOAD_TESTS_FILE_NAME,
  MOCK_SERVER_FILE_NAME,
  PATHS_ANCHOR_FILE_NAME,
  REGRESSIONS_FILE_NAME,
  TEST_SUITES_FILE_NAME,
} from '../../../shared/config/constants';

import { ErrorCodes, TestrixError } from '../../../shared/errors';

import type { ConfigFileService } from '../../services/config/config-file.service';
import type { ConfigPathService } from '../../services/config/config-path.service';
import type { ProfileConfigService } from '../../services/config/profile-config.service';
import { setMainSettings } from '../../services/settings-runtime';
import { ConfigChannels } from '../channels/config.channels';
import { refreshTeamSyncWatchers } from './team.handler';
import { wrapInvokeHandler } from '../wrap-ipc-handler';
import type { IpcMainBinder } from '../register-ipc';

export interface ConfigHandlerDeps {
  readonly paths: ConfigPathService;
  readonly files: ConfigFileService;
  readonly profiles: ProfileConfigService;
  /** Active profile workspace directory (collections, session, …). */
  readonly getConfigDir: () => string;
  readonly setConfigDirRef: (dir: string) => void;
  readonly getSharedConfigDir: () => string;
  readonly setSharedConfigDirRef: (dir: string) => void;
  readonly getActiveProfileId: () => string | null;
  readonly getTeamRepoDir: () => string | null;
  readonly initTeamSync: () => Promise<void>;
  readonly mergeTeamProfilesFromManifest: (
    teamRepoDir: string,
  ) => Promise<{ readonly addedProfileIds: readonly string[] }>;
  readonly importTeamProfiles: (
    teamRepoDir: string,
    profileIds: readonly string[],
  ) => Promise<{ readonly importedProfileIds: readonly string[] }>;
  readonly publishLocalProfile: (profileId: string) => Promise<ProfilesState>;
  readonly createTeamProfile: (name: string) => Promise<{ readonly state: ProfilesState; readonly profileId: string }>;
  readonly unpublishProfile: (profileId: string) => Promise<ProfilesState>;
  readonly migrateLegacyTeamProfileKinds: (teamProfileIds: readonly string[]) => Promise<ProfilesState>;
}

export function registerConfigHandlers(ipc: IpcMainBinder, deps: ConfigHandlerDeps): void {
  ipc.handle(
    ConfigChannels.getConfigDir,
    wrapInvokeHandler(ConfigChannels.getConfigDir, async (_e: IpcMainInvokeEvent) => {
      return deps.getConfigDir();
    }),
  );

  ipc.handle(
    ConfigChannels.setConfigDir,
    wrapInvokeHandler(ConfigChannels.setConfigDir, async (_e: IpcMainInvokeEvent, next: unknown) => {
      if (typeof next !== 'string' || next.length === 0) {
        throw new TestrixError(ErrorCodes.CONFIG_DIR_NOT_WRITABLE, 'Invalid configuration directory.');
      }
      await assertDirWritable(next);
      const anchor = await deps.paths.readAnchor();
      if (!anchor) {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Paths anchor is missing.');
      }
      const updated = {
        ...anchor,
        sharedConfigDir: next,
        meta: {
          ...anchor.meta,
          updatedAt: new Date().toISOString(),
        },
      };
      await deps.paths.writeAnchor(updated);
      deps.setSharedConfigDirRef(next);
      await fs.mkdir(next, { recursive: true });
      return undefined;
    }),
  );

  ipc.handle(
    ConfigChannels.getSettings,
    wrapInvokeHandler(ConfigChannels.getSettings, async () => deps.files.readSettings()),
  );

  ipc.handle(
    ConfigChannels.setSettings,
    wrapInvokeHandler(ConfigChannels.setSettings, async (_e, patch: unknown) => {
      const p = settingsPatchSchema.parse(patch);
      return deps.files.mergeSettingsPatch(p);
    }),
  );

  ipc.handle(
    ConfigChannels.getSession,
    wrapInvokeHandler(ConfigChannels.getSession, async () => deps.files.readSession()),
  );

  ipc.handle(
    ConfigChannels.setSession,
    wrapInvokeHandler(ConfigChannels.setSession, async (_e, patch: unknown) => {
      const p = sessionPatchSchema.parse(patch);
      return deps.files.mergeSessionPatch(p);
    }),
  );

  ipc.handle(
    ConfigChannels.getCollections,
    wrapInvokeHandler(ConfigChannels.getCollections, async () => deps.files.readCollections()),
  );

  ipc.handle(
    ConfigChannels.setCollections,
    wrapInvokeHandler(ConfigChannels.setCollections, async (_e, data: unknown) => {
      const parsed = collectionsFileSchema.parse(data);
      return deps.files.saveCollections(parsed);
    }),
  );

  ipc.handle(
    ConfigChannels.getEnvironments,
    wrapInvokeHandler(ConfigChannels.getEnvironments, async () => deps.files.readEnvironments()),
  );

  ipc.handle(
    ConfigChannels.setEnvironments,
    wrapInvokeHandler(ConfigChannels.setEnvironments, async (_e, data: unknown) => {
      const parsed = environmentsFileSchema.parse(data);
      return deps.files.saveEnvironments(parsed);
    }),
  );

  ipc.handle(
    ConfigChannels.getHistory,
    wrapInvokeHandler(ConfigChannels.getHistory, async () => deps.files.readHistory()),
  );

  ipc.handle(
    ConfigChannels.setHistory,
    wrapInvokeHandler(ConfigChannels.setHistory, async (_e, data: unknown) => {
      const parsed = historyFileSchema.parse(data);
      return deps.files.saveHistory(parsed);
    }),
  );

  ipc.handle(
    ConfigChannels.getProfiles,
    wrapInvokeHandler(ConfigChannels.getProfiles, async () => deps.profiles.getProfilesState()),
  );

  ipc.handle(
    ConfigChannels.setActiveProfile,
    wrapInvokeHandler(ConfigChannels.setActiveProfile, async (_e, profileId: unknown) => {
      if (typeof profileId !== 'string' || profileId.length === 0) {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Invalid profile id.');
      }
      return deps.profiles.setActiveProfile(profileId);
    }),
  );

  ipc.handle(
    ConfigChannels.createProfile,
    wrapInvokeHandler(ConfigChannels.createProfile, async (_e, name: unknown) => {
      if (typeof name !== 'string') {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Invalid profile name.');
      }
      return deps.profiles.createProfile(name);
    }),
  );

  ipc.handle(
    ConfigChannels.renameProfile,
    wrapInvokeHandler(ConfigChannels.renameProfile, async (_e, payload: unknown) => {
      if (!payload || typeof payload !== 'object') {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Invalid rename payload.');
      }
      const { id, name } = payload as { id?: unknown; name?: unknown };
      if (typeof id !== 'string' || typeof name !== 'string') {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Invalid rename payload.');
      }
      return deps.profiles.renameProfile(id, name);
    }),
  );

  ipc.handle(
    ConfigChannels.deleteProfile,
    wrapInvokeHandler(ConfigChannels.deleteProfile, async (_e, profileId: unknown) => {
      if (typeof profileId !== 'string' || profileId.length === 0) {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Invalid profile id.');
      }
      return deps.profiles.deleteProfile(profileId);
    }),
  );

  ipc.handle(
    ConfigChannels.linkProfileToDirectory,
    wrapInvokeHandler(ConfigChannels.linkProfileToDirectory, async (_e, payload: unknown) => {
      if (!payload || typeof payload !== 'object') {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Invalid link payload.');
      }
      const { profileId, dirPath } = payload as { profileId?: unknown; dirPath?: unknown };
      if (typeof profileId !== 'string' || typeof dirPath !== 'string') {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Invalid link payload.');
      }
      const state = await deps.profiles.linkProfileToDirectory(profileId, dirPath);
      await refreshTeamSyncWatchers({ getProfilesState: () => deps.profiles.getProfilesState() });
      return state;
    }),
  );

  ipc.handle(
    ConfigChannels.createLinkedProfile,
    wrapInvokeHandler(ConfigChannels.createLinkedProfile, async (_e, payload: unknown) => {
      if (!payload || typeof payload !== 'object') {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Invalid create linked profile payload.');
      }
      const { name, dirPath } = payload as { name?: unknown; dirPath?: unknown };
      if (typeof name !== 'string' || typeof dirPath !== 'string') {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Invalid create linked profile payload.');
      }
      return deps.profiles.createLinkedProfile(name, dirPath);
    }),
  );

  ipc.handle(
    ConfigChannels.getFilePaths,
    wrapInvokeHandler(ConfigChannels.getFilePaths, async () => {
      const configDir = deps.getConfigDir();
      const sharedConfigDir = deps.getSharedConfigDir();
      const anchor = await deps.paths.readAnchor();
      return {
        configDir,
        sharedConfigDir,
        settingsPath: path.join(sharedConfigDir, SETTINGS_FILE_NAME),
        sessionPath: path.join(configDir, SESSION_FILE_NAME),
        collectionsPath: path.join(configDir, COLLECTIONS_FILE_NAME),
        environmentsPath: path.join(configDir, ENVIRONMENTS_FILE_NAME),
        historyPath: path.join(configDir, HISTORY_FILE_NAME),
        pathsAnchorPath: deps.paths.anchorFilePath(),
        profilesManifestPath: deps.paths.profilesManifestPath(),
        profilesRoot: anchor?.profilesRoot ?? '',
      };
    }),
  );

  ipc.handle(
    ConfigChannels.getWorkspaceFileInventory,
    wrapInvokeHandler(ConfigChannels.getWorkspaceFileInventory, async () => {
      const configDir = deps.getConfigDir();
      const sharedConfigDir = deps.getSharedConfigDir();
      const readFile = async (filePath: string) => fs.readFile(filePath, 'utf8');

      const globalRoots: Record<string, string> = {
        [PATHS_ANCHOR_FILE_NAME]: deps.paths.anchorFilePath(),
        [PROFILES_FILE_NAME]: deps.paths.profilesManifestPath(),
        [SETTINGS_FILE_NAME]: path.join(sharedConfigDir, SETTINGS_FILE_NAME),
      };

      const profileRoots: Record<string, string> = {
        [SESSION_FILE_NAME]: path.join(configDir, SESSION_FILE_NAME),
        [COLLECTIONS_FILE_NAME]: path.join(configDir, COLLECTIONS_FILE_NAME),
        [ENVIRONMENTS_FILE_NAME]: path.join(configDir, ENVIRONMENTS_FILE_NAME),
        [HISTORY_FILE_NAME]: path.join(configDir, HISTORY_FILE_NAME),
        [COOKIE_JAR_FILE_NAME]: path.join(configDir, COOKIE_JAR_FILE_NAME),
        [TEST_SUITES_FILE_NAME]: path.join(configDir, TEST_SUITES_FILE_NAME),
        [LOAD_TESTS_FILE_NAME]: path.join(configDir, LOAD_TESTS_FILE_NAME),
        [REGRESSIONS_FILE_NAME]: path.join(configDir, REGRESSIONS_FILE_NAME),
        [MOCK_SERVER_FILE_NAME]: path.join(configDir, MOCK_SERVER_FILE_NAME),
        [CAPTURE_FILE_NAME]: path.join(configDir, CAPTURE_FILE_NAME),
        [INTERCEPTOR_FILE_NAME]: path.join(configDir, INTERCEPTOR_FILE_NAME),
      };

      const entries = await Promise.all(
        WORKSPACE_FILE_DESCRIPTORS.map((descriptor) => {
          const absolutePath =
            descriptor.scope === 'global'
              ? (globalRoots[descriptor.fileName] ?? path.join(sharedConfigDir, descriptor.fileName))
              : (profileRoots[descriptor.fileName] ?? path.join(configDir, descriptor.fileName));
          return readWorkspaceFileMeta(readFile, { absolutePath, descriptor });
        }),
      );
      return entries;
    }),
  );

  ipc.handle(
    ConfigChannels.openConfigDir,
    wrapInvokeHandler(ConfigChannels.openConfigDir, async () => {
      await shell.openPath(deps.getConfigDir());
      return undefined;
    }),
  );

  ipc.handle(
    ConfigChannels.pickDirectory,
    wrapInvokeHandler(ConfigChannels.pickDirectory, async (event: IpcMainInvokeEvent) => {
      const parent = BrowserWindow.fromWebContents(event.sender);
      const dialogOptions = {
        properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>,
      };
      const result = parent
        ? await dialog.showOpenDialog(parent, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths[0] ?? null;
    }),
  );

  ipc.handle(
    ConfigChannels.exportSettings,
    wrapInvokeHandler(ConfigChannels.exportSettings, async () => {
      const settings = await deps.files.readSettings();
      const indent = settings.dataConfig.prettyPrintJson ? 2 : undefined;
      return JSON.stringify(settings, null, indent);
    }),
  );

  ipc.handle(
    ConfigChannels.importSettings,
    wrapInvokeHandler(ConfigChannels.importSettings, async (_e, raw: unknown) => {
      if (typeof raw !== 'string' || raw.trim().length === 0) {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Settings JSON is empty.');
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (e: unknown) {
        throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Settings JSON is invalid.', {
          cause: e,
        });
      }
      const current = await deps.files.readSettings();
      const importedPayload =
        typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
      const imported = settingsFileSchema.parse({
        ...importedPayload,
        meta: {
          ...current.meta,
          updatedAt: new Date().toISOString(),
        },
      });
      await deps.files.writeSettings(imported);
      setMainSettings(imported);
      return imported;
    }),
  );

  ipc.handle(
    ConfigChannels.resetSettings,
    wrapInvokeHandler(ConfigChannels.resetSettings, async () => {
      const current = await deps.files.readSettings();
      const fresh = createDefaultSettings();
      const reset = settingsFileSchema.parse({
        ...fresh,
        meta: {
          ...fresh.meta,
          createdAt: current.meta.createdAt,
          updatedAt: new Date().toISOString(),
        },
      });
      await deps.files.writeSettings(reset);
      setMainSettings(reset);
      return reset;
    }),
  );

  ipc.handle(
    ConfigChannels.resetSession,
    wrapInvokeHandler(ConfigChannels.resetSession, async () => {
      const fresh = createDefaultSession();
      await deps.files.writeSession(fresh);
      return fresh;
    }),
  );
}

async function assertDirWritable(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const probe = `${dir}/.__testrix_write_probe`;
  try {
    await fs.writeFile(probe, 'ok', 'utf8');
    await fs.rm(probe, { force: true });
  } catch {
    throw new TestrixError(ErrorCodes.CONFIG_DIR_NOT_WRITABLE, 'Chosen folder is not writable.');
  }
}
