import type { ProfileEntry } from './profiles.schema';

/**
 * Resolves the on-disk directory for a profile entry.
 */
export function resolveProfileDir(entry: ProfileEntry, profilesRoot: string): string {
  if (entry.linkedDir) {
    return entry.linkedDir;
  }
  const root = profilesRoot.replace(/[/\\]+$/, '');
  return `${root}/${entry.id}`;
}
