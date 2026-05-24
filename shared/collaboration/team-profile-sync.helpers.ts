import { isTeamProfile } from '../config/profile-kind';
import { resolveProfileDir } from '../config/resolve-profile-dir';
import type { ProfileEntry } from '../config/profiles.schema';

import { TEAM_SHARE_CATALOG } from './team-share-catalog';
import { resolveShareScopeFileNames } from './share-scope-files';
import {
  createDefaultTeamShareScope,
  type TeamProfileSync,
  type TeamProfileSyncEntry,
  type TeamShareScope,
  type TeamWorkspaceConfig,
} from './team-workspace.schema';

export interface ProfileSyncTarget {
  readonly profileId: string;
  readonly dir: string;
}

/**
 * Builds a default share-scope entry for a team profile.
 */
export function createProfileSyncEntry(profileId: string): TeamProfileSyncEntry {
  return {
    profileId,
    useCustomShareScope: false,
    shareScope: { ...createDefaultTeamShareScope() },
  };
}

/**
 * Ensures every team profile has a share-scope entry (preserves existing settings).
 */
export function ensureProfileSyncEntries(
  profiles: readonly ProfileEntry[],
  profileSync: TeamProfileSync,
): TeamProfileSync {
  const byId = new Map(profileSync.entries.map((entry) => [entry.profileId, entry]));
  const teamProfiles = profiles.filter((profile) => isTeamProfile(profile));
  const entries = teamProfiles.map((profile) => {
    const existing = byId.get(profile.id);
    if (existing) {
      return existing;
    }
    return createProfileSyncEntry(profile.id);
  });
  return { entries };
}

/**
 * Migrates legacy profile sync config (includedProfileIds, enabled flags, pullTarget).
 */
export function migrateLegacyProfileSync(profileSync: Partial<TeamProfileSync> | undefined): TeamProfileSync {
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

/**
 * Returns whether the active profile is a team profile eligible for Git sync.
 */
export function isActiveTeamProfileSyncEnabled(
  profiles: readonly ProfileEntry[],
  activeProfileId: string | null,
): boolean {
  if (!activeProfileId) {
    return false;
  }
  const active = profiles.find((profile) => profile.id === activeProfileId);
  return active ? isTeamProfile(active) : false;
}

/**
 * @deprecated Use isActiveTeamProfileSyncEnabled. Kept for transitional UI reads.
 */
export function isProfileSyncEnabled(
  _profileSync: TeamProfileSync,
  profileId: string | null,
  activeProfileId: string | null = null,
  profiles: readonly ProfileEntry[] = [],
): boolean {
  if (!profileId || profileId !== activeProfileId) {
    return false;
  }
  const entry = profiles.find((profile) => profile.id === profileId);
  return entry ? isTeamProfile(entry) : false;
}

/**
 * Resolves the share scope for a team profile (global default or per-profile override).
 */
export function resolveEffectiveShareScope(
  config: TeamWorkspaceConfig,
  profileId: string | null,
): TeamShareScope {
  if (!profileId) {
    return config.shareScope;
  }
  const entry = config.profileSync.entries.find((e) => e.profileId === profileId);
  if (entry?.useCustomShareScope && entry.shareScope) {
    return entry.shareScope;
  }
  return config.shareScope;
}

/**
 * Human-readable summary of what a profile sync entry shares with the team.
 */
export function summarizeShareScope(scope: TeamShareScope): string {
  const enabledFiles = resolveShareScopeFileNames(scope);
  if (enabledFiles.length === 0) {
    return 'Nothing shared';
  }
  const allDefaultFiles = resolveShareScopeFileNames(createDefaultTeamShareScope());
  if (enabledFiles.length === allDefaultFiles.length) {
    const allCatalogDefaults = TEAM_SHARE_CATALOG.filter((entry) => entry.key !== 'profiles' && entry.key !== 'settings')
      .every((entry) => scope[entry.key]);
    if (allCatalogDefaults && !scope.profiles && !scope.settings && !scope.capture && !scope.interceptor) {
      return 'All shared workspace files';
    }
  }
  if (enabledFiles.length === 1) {
    return `${enabledFiles[0]} only`;
  }
  return enabledFiles.join(', ');
}

export function findProfileSyncEntry(
  profileSync: TeamProfileSync,
  profileId: string,
): TeamProfileSyncEntry | undefined {
  return profileSync.entries.find((entry) => entry.profileId === profileId);
}

/**
 * Resolves the active team profile sync target, if the active profile is a team profile.
 */
export function resolveActiveTeamSyncTarget(
  profiles: readonly ProfileEntry[],
  profilesRoot: string,
  activeProfileId: string | null,
): ProfileSyncTarget | null {
  if (!activeProfileId) {
    return null;
  }
  const active = profiles.find((profile) => profile.id === activeProfileId);
  if (!active || !isTeamProfile(active)) {
    return null;
  }
  return {
    profileId: active.id,
    dir: resolveProfileDir(active, profilesRoot),
  };
}

/**
 * Lists on-disk workspace directories for team sync (active team profile only).
 */
export function listProfileSyncTargets(
  profiles: readonly ProfileEntry[],
  profilesRoot: string,
  _profileSync: TeamProfileSync,
  activeProfileId: string | null,
): readonly ProfileSyncTarget[] {
  const target = resolveActiveTeamSyncTarget(profiles, profilesRoot, activeProfileId);
  return target ? [target] : [];
}

/** Human-readable list of JSON files included in sync for a share scope. */
export function describeSharedSyncFiles(scope: TeamShareScope): readonly string[] {
  return resolveShareScopeFileNames(scope);
}
