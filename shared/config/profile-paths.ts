import type { PathsAnchor } from './paths.schema';

/**
 * Resolves the workspace directory for a profile (collections, session, etc.).
 * Main process should join with `path.join` for OS-correct separators.
 */
export function resolveProfileWorkspaceDir(anchor: PathsAnchor, profileId?: string): string {
  const id = profileId ?? anchor.activeProfileId;
  return `${anchor.profilesRoot}/${id}`;
}

/** Directory for global `settings.json`. */
export function resolveSharedConfigDir(anchor: PathsAnchor): string {
  return anchor.sharedConfigDir;
}
