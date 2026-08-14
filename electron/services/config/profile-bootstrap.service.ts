import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  COLLECTIONS_FILE_NAME,
  ENVIRONMENTS_FILE_NAME,
  HISTORY_FILE_NAME,
  PROFILES_FILE_NAME,
  SESSION_FILE_NAME,
  SETTINGS_FILE_NAME,
  createDefaultProfilesManifest,
  createPathsAnchorV2,
  createProfileEntry,
  planPathsAnchorV1ToV2,
  profilesManifestSchema,
  pathsAnchorRawSchema,
  type PathsAnchor,
  type PathsAnchorV1,
} from '../../../shared/config';

import type { ConfigPathService } from './config-path.service';

export interface ResolvedProfileLayout {
  readonly anchor: PathsAnchor;
  readonly sharedConfigDir: string;
  readonly activeProfileDir: string;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(src: string, dest: string): Promise<void> {
  if (!(await fileExists(src))) {
    return;
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function migrateV1Anchor(
  paths: ConfigPathService,
  v1: PathsAnchorV1,
  userData: string,
): Promise<ResolvedProfileLayout> {
  const profileId = randomUUID();
  const plan = planPathsAnchorV1ToV2(v1, userData, profileId);
  const profileDir = path.join(plan.anchor.profilesRoot, profileId);
  const legacyDir = plan.legacyConfigDir;

  await fs.mkdir(plan.anchor.profilesRoot, { recursive: true });
  await fs.mkdir(profileDir, { recursive: true });

  const globalSettingsPath = path.join(plan.anchor.sharedConfigDir, SETTINGS_FILE_NAME);
  const legacySettingsPath = path.join(legacyDir, SETTINGS_FILE_NAME);
  if (await fileExists(legacySettingsPath) && !(await fileExists(globalSettingsPath))) {
    await fs.mkdir(plan.anchor.sharedConfigDir, { recursive: true });
    await fs.copyFile(legacySettingsPath, globalSettingsPath);
  }

  await copyIfExists(path.join(legacyDir, COLLECTIONS_FILE_NAME), path.join(profileDir, COLLECTIONS_FILE_NAME));
  await copyIfExists(path.join(legacyDir, ENVIRONMENTS_FILE_NAME), path.join(profileDir, ENVIRONMENTS_FILE_NAME));
  await copyIfExists(path.join(legacyDir, SESSION_FILE_NAME), path.join(profileDir, SESSION_FILE_NAME));
  await copyIfExists(path.join(legacyDir, HISTORY_FILE_NAME), path.join(profileDir, HISTORY_FILE_NAME));

  const manifest = createDefaultProfilesManifest(profileId, plan.defaultProfileName);
  await paths.writeProfilesManifest(manifest);
  await paths.writeAnchor(plan.anchor);

  return {
    anchor: plan.anchor,
    sharedConfigDir: plan.anchor.sharedConfigDir,
    activeProfileDir: profileDir,
  };
}

async function ensureFreshInstall(paths: ConfigPathService, userData: string): Promise<ResolvedProfileLayout> {
  const profileId = randomUUID();
  const anchor = createPathsAnchorV2(userData, profileId);
  const profileDir = path.join(anchor.profilesRoot, profileId);

  await fs.mkdir(anchor.sharedConfigDir, { recursive: true });
  await fs.mkdir(anchor.profilesRoot, { recursive: true });
  await fs.mkdir(profileDir, { recursive: true });

  const manifest = createDefaultProfilesManifest(profileId);
  await paths.writeProfilesManifest(manifest);
  await paths.writeAnchor(anchor);

  return {
    anchor,
    sharedConfigDir: anchor.sharedConfigDir,
    activeProfileDir: profileDir,
  };
}

/**
 * Reads or creates `paths.json` / `profiles.json`, migrates legacy v1 anchors, and ensures profile dirs exist.
 */
export async function resolveAndPrepareProfileLayout(paths: ConfigPathService): Promise<ResolvedProfileLayout> {
  const userData = paths.resolveUserDataDisplay();
  const raw = await paths.readAnchorRaw();

  if (!raw) {
    return ensureFreshInstall(paths, userData);
  }

  const parsed = pathsAnchorRawSchema.parse(raw);

  if (parsed.schemaVersion === 1) {
    return migrateV1Anchor(paths, parsed, userData);
  }

  let manifest = await paths.readProfilesManifest();
  if (!manifest) {
    manifest = createDefaultProfilesManifest(parsed.activeProfileId);
    await paths.writeProfilesManifest(manifest);
  }

  const activeEntry = manifest.profiles.find((p) => p.id === parsed.activeProfileId);
  if (!activeEntry) {
    const fallback = manifest.profiles[0];
    if (!fallback) {
      return ensureFreshInstall(paths, userData);
    }
    const anchor: PathsAnchor = {
      ...parsed,
      activeProfileId: fallback.id,
      meta: { ...parsed.meta, updatedAt: new Date().toISOString() },
    };
    await paths.writeAnchor(anchor);
    const activeProfileDir = path.join(anchor.profilesRoot, fallback.id);
    await fs.mkdir(activeProfileDir, { recursive: true });
    return {
      anchor,
      sharedConfigDir: anchor.sharedConfigDir,
      activeProfileDir,
    };
  }

  const activeProfileDir = path.join(parsed.profilesRoot, parsed.activeProfileId);
  await fs.mkdir(parsed.sharedConfigDir, { recursive: true });
  await fs.mkdir(activeProfileDir, { recursive: true });

  return {
    anchor: parsed,
    sharedConfigDir: parsed.sharedConfigDir,
    activeProfileDir,
  };
}
