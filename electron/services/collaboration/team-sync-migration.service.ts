import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  TEAM_PROFILES_MANIFEST_FILE_NAME,
  TEAM_WORKSPACE_FILE_NAME,
  enrichTeamWorkspaceConfig,
  resolveShareScopeFileNames,
  resolveTeamRepoFilePath,
  resolveTeamRepoProfileDir,
  resolveDefaultTeamRepoDir,
  teamWorkspaceConfigSchema,
  type TeamWorkspaceConfig,
} from '../../../shared/collaboration';
import type { ProfileEntry } from '../../../shared/config';
import { resolveProfileDir } from '../../../shared/config';

import { gitWorkspaceService } from './git-workspace.service';

export interface TeamSyncMigrationInput {
  readonly sharedConfigDir: string;
  readonly profilesRoot: string;
  readonly profiles: readonly ProfileEntry[];
}

export interface TeamSyncMigrationResult {
  readonly config: TeamWorkspaceConfig;
  readonly migratedFromLegacy: boolean;
}

/**
 * Ensures global team config exists under sharedConfigDir and legacy per-profile data is imported.
 */
export async function migrateTeamSyncConfig(input: TeamSyncMigrationInput): Promise<TeamSyncMigrationResult> {
  const globalConfigPath = path.join(input.sharedConfigDir, TEAM_WORKSPACE_FILE_NAME);
  const teamRepoDir = resolveDefaultTeamRepoDir(input.sharedConfigDir);

  let legacyConfig: TeamWorkspaceConfig | null = null;
  let migratedFromLegacy = false;

  try {
    const raw = await fs.readFile(globalConfigPath, 'utf8');
    const config = enrichTeamWorkspaceConfig(JSON.parse(raw), { sharedConfigDir: input.sharedConfigDir });
    await fs.mkdir(config.teamRepoDir, { recursive: true });
    return { config, migratedFromLegacy: false };
  } catch {
    /* continue migration */
  }

  legacyConfig = await findBestLegacyTeamConfig(input);
  if (legacyConfig) {
    migratedFromLegacy = true;
  }

  const config = enrichTeamWorkspaceConfig(legacyConfig, { sharedConfigDir: input.sharedConfigDir });
  const parsed = teamWorkspaceConfigSchema.parse({
    ...config,
    schemaVersion: 2,
    teamRepoDir,
    syncMode: 'mirror' as const,
  });

  await fs.mkdir(input.sharedConfigDir, { recursive: true });
  await fs.mkdir(teamRepoDir, { recursive: true });

  if (migratedFromLegacy) {
    await importLegacyProfileData(input, parsed);
    await removeLegacyTeamConfigFiles(input);
  }

  await fs.writeFile(globalConfigPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
  return { config: parsed, migratedFromLegacy };
}

async function findBestLegacyTeamConfig(input: TeamSyncMigrationInput): Promise<TeamWorkspaceConfig | null> {
  const candidates: TeamWorkspaceConfig[] = [];

  for (const profile of input.profiles) {
    const profileDir = resolveProfileDir(profile, input.profilesRoot);
    const configPath = path.join(profileDir, TEAM_WORKSPACE_FILE_NAME);
    try {
      const raw = await fs.readFile(configPath, 'utf8');
      candidates.push(enrichTeamWorkspaceConfig(JSON.parse(raw), { sharedConfigDir: input.sharedConfigDir }));
    } catch {
      /* no legacy config in this profile */
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  const enabledWithRemote = candidates.find((c) => c.enabled && c.remoteUrl);
  if (enabledWithRemote) {
    return enabledWithRemote;
  }

  const withRemote = candidates.find((c) => c.remoteUrl);
  return withRemote ?? candidates[0] ?? null;
}

async function importLegacyProfileData(
  input: TeamSyncMigrationInput,
  config: TeamWorkspaceConfig,
): Promise<void> {
  const teamRepoDir = config.teamRepoDir;

  for (const profile of input.profiles) {
    const profileDir = resolveProfileDir(profile, input.profilesRoot);
    const hasLegacyGit = await gitWorkspaceService.detectRepo(profileDir);
    if (!hasLegacyGit) {
      continue;
    }

    const shareFiles = resolveShareScopeFileNames(config.shareScope);
    const destDir = resolveTeamRepoProfileDir(teamRepoDir, profile.id);
    await fs.mkdir(destDir, { recursive: true });

    for (const fileName of shareFiles) {
      const sourcePath = path.join(profileDir, fileName);
      const destPath = resolveTeamRepoFilePath(teamRepoDir, profile.id, fileName);
      try {
        await fs.copyFile(sourcePath, destPath);
      } catch {
        /* file may not exist */
      }
    }
  }

  const legacyDir = await findFirstLegacyGitDir(input);
  if (legacyDir && !(await gitWorkspaceService.detectRepo(teamRepoDir))) {
    await gitWorkspaceService.initRepo(teamRepoDir);
    const remoteUrl = await gitWorkspaceService.getRemoteUrl(legacyDir);
    if (remoteUrl) {
      await gitWorkspaceService.setRemote(teamRepoDir, remoteUrl);
    }
  }
}

async function findFirstLegacyGitDir(input: TeamSyncMigrationInput): Promise<string | null> {
  for (const profile of input.profiles) {
    const profileDir = resolveProfileDir(profile, input.profilesRoot);
    if (await gitWorkspaceService.detectRepo(profileDir)) {
      return profileDir;
    }
  }
  return null;
}

async function removeLegacyTeamConfigFiles(input: TeamSyncMigrationInput): Promise<void> {
  for (const profile of input.profiles) {
    const profileDir = resolveProfileDir(profile, input.profilesRoot);
    const configPath = path.join(profileDir, TEAM_WORKSPACE_FILE_NAME);
    try {
      await fs.unlink(configPath);
    } catch {
      /* already removed */
    }
  }
}

/** Absolute path to the global team settings file. */
export function resolveGlobalTeamConfigPath(sharedConfigDir: string): string {
  return path.join(sharedConfigDir, TEAM_WORKSPACE_FILE_NAME);
}

/** Absolute path to the team profiles manifest inside the Git repo. */
export function resolveTeamProfilesManifestPath(teamRepoDir: string): string {
  return path.join(teamRepoDir, TEAM_PROFILES_MANIFEST_FILE_NAME);
}
