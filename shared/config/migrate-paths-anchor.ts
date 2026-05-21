import type { PathsAnchor, PathsAnchorV1 } from './paths.schema';

function nowIso(): string {
  return new Date().toISOString();
}

export interface V1ToV2MigrationPlan {
  readonly anchor: PathsAnchor;
  readonly defaultProfileName: string;
  readonly legacyConfigDir: string;
  readonly defaultProfileId: string;
}

/**
 * Builds the v2 anchor and default profile metadata for a legacy v1 install.
 * File copy/move is performed in the Electron bootstrap layer.
 */
export function planPathsAnchorV1ToV2(
  v1: PathsAnchorV1,
  userData: string,
  defaultProfileId: string,
): V1ToV2MigrationPlan {
  const profilesRoot = `${userData.replace(/[/\\]+$/, '')}/profiles`;
  const ts = nowIso();
  return {
    legacyConfigDir: v1.configDir,
    defaultProfileName: 'Default',
    defaultProfileId,
    anchor: {
      schemaVersion: 2,
      meta: {
        createdAt: v1.meta.createdAt,
        updatedAt: ts,
      },
      sharedConfigDir: userData,
      profilesRoot,
      activeProfileId: defaultProfileId,
    },
  };
}

/** Fresh v2 anchor for a new install (no legacy config). */
export function createPathsAnchorV2(
  userData: string,
  activeProfileId: string,
): PathsAnchor {
  const ts = nowIso();
  const profilesRoot = `${userData.replace(/[/\\]+$/, '')}/profiles`;
  return {
    schemaVersion: 2,
    meta: {
      createdAt: ts,
      updatedAt: ts,
    },
    sharedConfigDir: userData,
    profilesRoot,
    activeProfileId,
  };
}
