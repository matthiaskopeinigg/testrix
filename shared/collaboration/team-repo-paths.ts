import { TEAM_PROFILES_MANIFEST_FILE_NAME } from './team-profiles-manifest.schema';

/** Default relative path in the Git repo for team profile data. */
export const DEFAULT_TEAM_REPO_DATA_DIR = 'profiles';

/** @deprecated Use {@link DEFAULT_TEAM_REPO_DATA_DIR}. */
export const TEAM_REPO_PROFILES_DIR = DEFAULT_TEAM_REPO_DATA_DIR;

/** Default folder name under sharedConfigDir for the Git team workspace. */
export const TEAM_WORKSPACE_DEFAULT_DIR_NAME = 'team-workspace';

function joinPathSegments(...segments: readonly string[]): string {
  const filtered = segments.filter((segment) => segment.length > 0);
  if (filtered.length === 0) {
    return '';
  }

  const useBackslash = filtered.some((segment) => segment.includes('\\'));
  const separator = useBackslash ? '\\' : '/';

  return filtered
    .map((segment, index) => {
      const trimmed = segment.replace(/[/\\]+/g, separator);
      if (index === 0) {
        return trimmed.replace(new RegExp(`${separator}+$`), '');
      }
      return trimmed.replace(new RegExp(`^${separator}+`), '').replace(new RegExp(`${separator}+$`), '');
    })
    .join(separator);
}

/**
 * Normalizes a repository-relative data directory (POSIX separators, no `..` segments).
 */
export function normalizeRepoDataDir(repoDataDir: string | undefined | null): string {
  if (!repoDataDir || repoDataDir.trim().length === 0) {
    return '';
  }

  const normalized = repoDataDir.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (normalized.length === 0 || normalized.split('/').some((segment) => segment === '..')) {
    throw new Error('Invalid repository data directory');
  }

  return normalized;
}

/**
 * Validates user input for a new repository data directory.
 */
export function tryNormalizeRepoDataDir(
  repoDataDir: string,
): { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string } {
  const trimmed = repoDataDir.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: 'Enter a folder name or path' };
  }

  try {
    const value = normalizeRepoDataDir(trimmed);
    if (value.length === 0) {
      return { ok: false, error: 'Enter a folder name or path' };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, error: 'Use letters, numbers, slashes, and hyphens only (no ..)' };
  }
}

/**
 * Resolves the absolute path to the team data directory inside a Git checkout.
 */
export function resolveTeamRepoDataDirPath(teamRepoDir: string, repoDataDir?: string): string {
  const prefix = normalizeRepoDataDir(repoDataDir ?? '');
  if (prefix.length === 0) {
    return teamRepoDir;
  }
  return joinPathSegments(teamRepoDir, prefix);
}

/**
 * Resolves the configured repository data directory prefix (defaults to `profiles`).
 */
export function resolveTeamRepoDataDirPrefix(repoDataDir?: string): string {
  return normalizeRepoDataDir(repoDataDir ?? DEFAULT_TEAM_REPO_DATA_DIR);
}

/**
 * Resolves the default team Git repo directory under shared config.
 */
export function resolveDefaultTeamRepoDir(sharedConfigDir: string): string {
  return joinPathSegments(sharedConfigDir, TEAM_WORKSPACE_DEFAULT_DIR_NAME);
}

/**
 * Resolves the on-disk directory for one profile inside the team repo.
 */
export function resolveTeamRepoProfileDir(
  teamRepoDir: string,
  profileId: string,
  repoDataDir?: string,
): string {
  const prefix = resolveTeamRepoDataDirPrefix(repoDataDir);
  if (prefix.length === 0) {
    return joinPathSegments(teamRepoDir, profileId);
  }
  return joinPathSegments(teamRepoDir, prefix, profileId);
}

/**
 * Resolves the absolute path for a mirrored profile file in the team repo.
 */
export function resolveTeamRepoFilePath(
  teamRepoDir: string,
  profileId: string,
  fileName: string,
  repoDataDir?: string,
): string {
  return joinPathSegments(resolveTeamRepoProfileDir(teamRepoDir, profileId, repoDataDir), fileName);
}

/**
 * Git-relative path for staging (POSIX separators).
 */
export function resolveTeamRepoRelativePath(
  profileId: string,
  fileName: string,
  repoDataDir?: string,
): string {
  const prefix = resolveTeamRepoDataDirPrefix(repoDataDir);
  if (prefix.length === 0) {
    return `${profileId}/${fileName}`;
  }
  return `${prefix}/${profileId}/${fileName}`;
}

/**
 * Git-relative path to the team profiles manifest inside the repository.
 */
export function resolveTeamProfilesManifestRelativePath(repoDataDir?: string): string {
  const prefix = resolveTeamRepoDataDirPrefix(repoDataDir);
  if (prefix.length === 0) {
    return TEAM_PROFILES_MANIFEST_FILE_NAME;
  }
  return `${prefix}/${TEAM_PROFILES_MANIFEST_FILE_NAME}`;
}

/**
 * Absolute path to the team profiles manifest inside the Git repo checkout.
 */
export function resolveTeamProfilesManifestPath(teamRepoDir: string, repoDataDir?: string): string {
  return joinPathSegments(teamRepoDir, resolveTeamProfilesManifestRelativePath(repoDataDir));
}

/**
 * Legacy manifest location at the repository root (pre–repo data directory setting).
 */
export function resolveLegacyTeamProfilesManifestPath(teamRepoDir: string): string {
  return joinPathSegments(teamRepoDir, TEAM_PROFILES_MANIFEST_FILE_NAME);
}

/**
 * Resolves a profile workspace file path on the local machine.
 */
export function resolveLocalProfileFilePath(profileDir: string, fileName: string): string {
  return joinPathSegments(profileDir, fileName);
}

/**
 * Human-readable label for a repository data directory value.
 */
export function formatRepoDataDirLabel(repoDataDir: string | undefined | null): string {
  const normalized = normalizeRepoDataDir(repoDataDir ?? '');
  return normalized.length > 0 ? normalized : '(repository root)';
}
