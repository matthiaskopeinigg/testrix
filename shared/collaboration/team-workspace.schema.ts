import { z } from 'zod';

import { resolveDefaultTeamRepoDir } from './team-repo-paths';
import { createProfileSyncEntry } from './team-profile-sync.helpers';

export const TEAM_WORKSPACE_FILE_NAME = 'testrix.team.json';

export const teamShareScopeSchema = z.object({
  collections: z.boolean(),
  environments: z.boolean(),
  testSuites: z.boolean(),
  loadTests: z.boolean(),
  regressions: z.boolean(),
  mockServer: z.boolean(),
  profiles: z.boolean(),
  settings: z.boolean(),
  capture: z.boolean(),
  interceptor: z.boolean(),
});

export type TeamShareScope = z.infer<typeof teamShareScopeSchema>;

export const teamProfileSyncEntrySchema = z.object({
  profileId: z.string().min(1),
  useCustomShareScope: z.boolean(),
  shareScope: teamShareScopeSchema,
});

export type TeamProfileSyncEntry = z.infer<typeof teamProfileSyncEntrySchema>;

export const teamProfileSyncSchema = z.object({
  entries: z.array(teamProfileSyncEntrySchema),
});

export type TeamProfileSync = z.infer<typeof teamProfileSyncSchema>;

export const teamAutoSyncSchema = z.object({
  enabled: z.boolean(),
  commitOnSave: z.boolean(),
  pullOnFocus: z.boolean(),
  pullIntervalSec: z.number().int().min(15).max(3600),
  pushRetrySec: z.number().int().min(10).max(600),
});

export type TeamAutoSync = z.infer<typeof teamAutoSyncSchema>;

export const teamCommitAuthorSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().min(1).max(254),
});

export type TeamCommitAuthor = z.infer<typeof teamCommitAuthorSchema>;

export const teamSyncModeSchema = z.literal('mirror');

export type TeamSyncMode = z.infer<typeof teamSyncModeSchema>;

/** Legacy v1 config (per-profile workspace anchor). */
export const teamWorkspaceConfigV1Schema = z.object({
  schemaVersion: z.literal(1),
  enabled: z.boolean(),
  remoteUrl: z.string().nullable(),
  defaultBranch: z.string().min(1).max(120),
  shareScope: teamShareScopeSchema,
  profileSync: teamProfileSyncSchema,
  autoSync: teamAutoSyncSchema,
  commitAuthor: teamCommitAuthorSchema,
});

export type TeamWorkspaceConfigV1 = z.infer<typeof teamWorkspaceConfigV1Schema>;

/** Global team sync config (v2): settings in sharedConfigDir, Git repo at teamRepoDir. */
export const teamWorkspaceConfigSchema = z.object({
  schemaVersion: z.literal(2),
  enabled: z.boolean(),
  remoteUrl: z.string().nullable(),
  defaultBranch: z.string().min(1).max(120),
  teamRepoDir: z.string().min(1),
  syncMode: teamSyncModeSchema,
  shareScope: teamShareScopeSchema,
  profileSync: teamProfileSyncSchema,
  autoSync: teamAutoSyncSchema,
  commitAuthor: teamCommitAuthorSchema,
});

export type TeamWorkspaceConfig = z.infer<typeof teamWorkspaceConfigSchema>;

export function createDefaultTeamShareScope(): TeamShareScope {
  return { ...DEFAULT_TEAM_SHARE_SCOPE };
}

export const DEFAULT_TEAM_SHARE_SCOPE: TeamShareScope = {
  collections: true,
  environments: true,
  testSuites: true,
  loadTests: true,
  regressions: true,
  mockServer: true,
  profiles: false,
  settings: false,
  capture: false,
  interceptor: false,
};

export function createDefaultTeamProfileSync(): TeamProfileSync {
  return {
    entries: [],
  };
}

export interface EnrichTeamWorkspaceOptions {
  readonly sharedConfigDir?: string;
}

export function createDefaultTeamWorkspaceConfig(sharedConfigDir?: string): TeamWorkspaceConfig {
  return {
    schemaVersion: 2,
    enabled: false,
    remoteUrl: null,
    defaultBranch: 'main',
    teamRepoDir: sharedConfigDir ? resolveDefaultTeamRepoDir(sharedConfigDir) : '',
    syncMode: 'mirror',
    shareScope: createDefaultTeamShareScope(),
    profileSync: createDefaultTeamProfileSync(),
    autoSync: {
      enabled: true,
      commitOnSave: true,
      pullOnFocus: true,
      pullIntervalSec: 60,
      pushRetrySec: 30,
    },
    commitAuthor: {
      name: 'Testrix User',
      email: 'testrix@example.com',
    },
  };
}

export function enrichTeamWorkspaceConfig(
  data: unknown,
  options?: EnrichTeamWorkspaceOptions,
): TeamWorkspaceConfig {
  const defaults = createDefaultTeamWorkspaceConfig(options?.sharedConfigDir);
  const legacy = data as Partial<TeamWorkspaceConfig> | null | undefined;

  if (!legacy || typeof legacy !== 'object') {
    return defaults;
  }

  const profileSync = migrateLegacyProfileSyncData(legacy.profileSync);
  const teamRepoDir =
    legacy.teamRepoDir && legacy.teamRepoDir.length > 0 ? legacy.teamRepoDir : defaults.teamRepoDir;

  const merged: TeamWorkspaceConfig = {
    ...defaults,
    ...legacy,
    schemaVersion: 2,
    teamRepoDir,
    syncMode: 'mirror',
    shareScope: { ...defaults.shareScope, ...(legacy.shareScope ?? {}) },
    profileSync: {
      ...defaults.profileSync,
      ...profileSync,
      entries: profileSync.entries.map((entry) => ({
        ...createProfileSyncEntryDefaults(),
        ...entry,
        shareScope: { ...defaults.shareScope, ...(entry.shareScope ?? {}) },
      })),
    },
    autoSync: { ...defaults.autoSync, ...(legacy.autoSync ?? {}) },
    commitAuthor: { ...defaults.commitAuthor, ...(legacy.commitAuthor ?? {}) },
  };

  const parsed = teamWorkspaceConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : merged;
}

function createProfileSyncEntryDefaults(): TeamProfileSyncEntry {
  return {
    profileId: '',
    useCustomShareScope: false,
    shareScope: createDefaultTeamShareScope(),
  };
}

function migrateLegacyProfileSyncData(profileSync: Partial<TeamProfileSync> | undefined): TeamProfileSync {
  const legacyIds = (profileSync as { includedProfileIds?: string[] } | undefined)?.includedProfileIds;
  const legacyEntries = profileSync?.entries ?? [];
  if (legacyIds?.length) {
    return {
      entries: legacyIds.map((profileId) => createProfileSyncEntry(profileId)),
    };
  }
  return {
    entries: legacyEntries
      .filter((entry) => {
        const legacy = entry as TeamProfileSyncEntry & { enabled?: boolean };
        return legacy.enabled !== false;
      })
      .map((entry) => ({
        profileId: entry.profileId,
        useCustomShareScope: entry.useCustomShareScope,
        shareScope: entry.shareScope,
      })),
  };
}
