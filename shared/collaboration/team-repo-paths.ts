/** Subdirectory under the team repo for synced profile data. */
export const TEAM_REPO_PROFILES_DIR = 'profiles';

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
 * Resolves the default team Git repo directory under shared config.
 */
export function resolveDefaultTeamRepoDir(sharedConfigDir: string): string {
  return joinPathSegments(sharedConfigDir, TEAM_WORKSPACE_DEFAULT_DIR_NAME);
}

/**
 * Resolves the on-disk directory for one profile inside the team repo.
 */
export function resolveTeamRepoProfileDir(teamRepoDir: string, profileId: string): string {
  return joinPathSegments(teamRepoDir, TEAM_REPO_PROFILES_DIR, profileId);
}

/**
 * Resolves the absolute path for a mirrored profile file in the team repo.
 */
export function resolveTeamRepoFilePath(teamRepoDir: string, profileId: string, fileName: string): string {
  return joinPathSegments(resolveTeamRepoProfileDir(teamRepoDir, profileId), fileName);
}

/**
 * Git-relative path for staging (POSIX separators).
 */
export function resolveTeamRepoRelativePath(profileId: string, fileName: string): string {
  return `${TEAM_REPO_PROFILES_DIR}/${profileId}/${fileName}`;
}

/**
 * Resolves a profile workspace file path on the local machine.
 */
export function resolveLocalProfileFilePath(profileDir: string, fileName: string): string {
  return joinPathSegments(profileDir, fileName);
}
