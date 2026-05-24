import type { ProfileEntry, ProfileKind } from './profiles.schema';

/**
 * Returns whether a profile entry is a team profile (syncs with Git when active).
 */
export function isTeamProfile(entry: Pick<ProfileEntry, 'profileKind' | 'teamEnabled'>): boolean {
  if (entry.profileKind === 'team') {
    return true;
  }
  if (entry.profileKind === 'local') {
    return false;
  }
  return entry.teamEnabled === true;
}

/**
 * Returns whether a profile entry is a local-only profile.
 */
export function isLocalProfile(entry: Pick<ProfileEntry, 'profileKind' | 'teamEnabled'>): boolean {
  return !isTeamProfile(entry);
}

/**
 * Normalizes legacy entries that predate explicit profileKind.
 */
export function normalizeProfileKind(entry: ProfileEntry): ProfileEntry {
  if (entry.profileKind === 'team' || entry.profileKind === 'local') {
    return entry;
  }
  if (entry.teamEnabled) {
    return { ...entry, profileKind: 'team' };
  }
  return { ...entry, profileKind: 'local' };
}

/**
 * Applies profileKind to an entry when promoting or importing a team profile.
 */
export function asTeamProfile(entry: ProfileEntry): ProfileEntry {
  return { ...entry, profileKind: 'team' as ProfileKind, teamEnabled: true };
}

/**
 * Applies profileKind when unpublishing a team profile back to local-only.
 */
export function asLocalProfile(entry: ProfileEntry): ProfileEntry {
  return { ...entry, profileKind: 'local' as ProfileKind, teamEnabled: false };
}
