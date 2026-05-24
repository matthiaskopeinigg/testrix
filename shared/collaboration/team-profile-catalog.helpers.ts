import type { ProfileEntry } from '../config/profiles.schema';
import { isTeamProfile } from '../config/profile-kind';

import type { TeamProfilesManifestEntry } from './team-profiles-manifest.schema';
import type { TeamRemoteCatalog, TeamRemoteCatalogEntry } from './team-catalog.schema';

/**
 * Builds a remote catalog view with import status for each team-published profile.
 */
export function buildTeamRemoteCatalog(
  remoteProfiles: readonly TeamProfilesManifestEntry[],
  localProfiles: readonly ProfileEntry[],
  fetchedAt: string,
): TeamRemoteCatalog {
  const localTeamIds = new Set(
    localProfiles.filter((profile) => isTeamProfile(profile)).map((profile) => profile.id),
  );

  const profiles: TeamRemoteCatalogEntry[] = remoteProfiles.map((remote) => ({
    ...remote,
    imported: localTeamIds.has(remote.id),
  }));

  return { profiles, fetchedAt };
}

/**
 * Lists remote profile ids that are not yet imported locally as team profiles.
 */
export function listImportableRemoteProfileIds(
  remoteProfiles: readonly TeamProfilesManifestEntry[],
  localProfiles: readonly ProfileEntry[],
): readonly string[] {
  const localIds = new Set(localProfiles.map((profile) => profile.id));
  return remoteProfiles.filter((remote) => !localIds.has(remote.id)).map((remote) => remote.id);
}

/**
 * Lists local profiles eligible for publishing to the team (local-only).
 */
export function listPublishableLocalProfiles(profiles: readonly ProfileEntry[]): readonly ProfileEntry[] {
  return profiles.filter((profile) => !isTeamProfile(profile));
}

/**
 * Lists all team profiles in the local registry.
 */
export function listTeamProfiles(profiles: readonly ProfileEntry[]): readonly ProfileEntry[] {
  return profiles.filter((profile) => isTeamProfile(profile));
}

/**
 * Lists all local-only profiles in the registry.
 */
export function listLocalProfiles(profiles: readonly ProfileEntry[]): readonly ProfileEntry[] {
  return profiles.filter((profile) => !isTeamProfile(profile));
}
