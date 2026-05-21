import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  createDefaultProfilesManifest,
  createProfileEntry,
  profilesManifestSchema,
  profilesStateSchema,
  type PathsAnchor,
  type ProfileEntry,
  type ProfilesManifest,
  type ProfilesState,
} from '../../../shared/config';

import { ErrorCodes, TestrixError } from '../../../shared/errors';

import { cookieJarStore } from '../http/cookie-jar.service';

import type { ConfigFileService } from './config-file.service';
import type { ConfigPathService } from './config-path.service';

export interface ProfileConfigServiceDeps {
  readonly paths: ConfigPathService;
  readonly files: ConfigFileService;
  readonly getAnchor: () => PathsAnchor;
  readonly setAnchor: (anchor: PathsAnchor) => Promise<void>;
  readonly getActiveProfileDir: () => string;
  readonly setActiveProfileDirRef: (dir: string) => void;
}

export class ProfileConfigService {
  constructor(private readonly deps: ProfileConfigServiceDeps) {}

  async getProfilesState(): Promise<ProfilesState> {
    const anchor = this.deps.getAnchor();
    const manifest = await this.requireManifest();
    const state = {
      activeProfileId: anchor.activeProfileId,
      profiles: manifest.profiles,
      activeProfileDir: this.deps.getActiveProfileDir(),
      sharedConfigDir: anchor.sharedConfigDir,
      profilesRoot: anchor.profilesRoot,
    };
    return profilesStateSchema.parse(state);
  }

  async setActiveProfile(profileId: string): Promise<ProfilesState> {
    const manifest = await this.requireManifest();
    const entry = manifest.profiles.find((p) => p.id === profileId);
    if (!entry) {
      throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Profile not found.');
    }

    const anchor = this.deps.getAnchor();
    if (anchor.activeProfileId === profileId) {
      return this.getProfilesState();
    }

    const profileDir = path.join(anchor.profilesRoot, profileId);
    await fs.mkdir(profileDir, { recursive: true });
    await this.deps.files.ensureProfileWorkspaceDefaults(profileDir);

    const updatedAnchor: PathsAnchor = {
      ...anchor,
      activeProfileId: profileId,
      meta: { ...anchor.meta, updatedAt: new Date().toISOString() },
    };
    await this.deps.setAnchor(updatedAnchor);
    this.deps.setActiveProfileDirRef(profileDir);
    await cookieJarStore.loadForProfile(profileDir);

    return this.getProfilesState();
  }

  async createProfile(name: string): Promise<ProfilesState> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Profile name is required.');
    }

    const anchor = this.deps.getAnchor();
    const manifest = await this.requireManifest();
    const profileId = randomUUID();
    const profileDir = path.join(anchor.profilesRoot, profileId);

    await fs.mkdir(profileDir, { recursive: true });
    await this.deps.files.ensureProfileWorkspaceDefaults(profileDir);

    const nextManifest: ProfilesManifest = profilesManifestSchema.parse({
      ...manifest,
      meta: { ...manifest.meta, updatedAt: new Date().toISOString() },
      profiles: [...manifest.profiles, createProfileEntry(profileId, trimmed)],
    });
    await this.deps.paths.writeProfilesManifest(nextManifest);

    return this.setActiveProfile(profileId);
  }

  async renameProfile(profileId: string, name: string): Promise<ProfilesState> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Profile name is required.');
    }

    const manifest = await this.requireManifest();
    const index = manifest.profiles.findIndex((p) => p.id === profileId);
    if (index < 0) {
      throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Profile not found.');
    }

    const profiles = [...manifest.profiles];
    profiles[index] = { ...profiles[index], name: trimmed } as ProfileEntry;

    const nextManifest: ProfilesManifest = profilesManifestSchema.parse({
      ...manifest,
      meta: { ...manifest.meta, updatedAt: new Date().toISOString() },
      profiles,
    });
    await this.deps.paths.writeProfilesManifest(nextManifest);
    return this.getProfilesState();
  }

  async deleteProfile(profileId: string): Promise<ProfilesState> {
    const anchor = this.deps.getAnchor();
    const manifest = await this.requireManifest();

    if (manifest.profiles.length <= 1) {
      throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'At least one profile is required.');
    }
    if (anchor.activeProfileId === profileId) {
      throw new TestrixError(
        ErrorCodes.CONFIG_VALIDATION_FAILED,
        'Switch to another profile before deleting the active profile.',
      );
    }

    const profiles = manifest.profiles.filter((p) => p.id !== profileId);
    const nextManifest: ProfilesManifest = profilesManifestSchema.parse({
      ...manifest,
      meta: { ...manifest.meta, updatedAt: new Date().toISOString() },
      profiles,
    });
    await this.deps.paths.writeProfilesManifest(nextManifest);

    const profileDir = path.join(anchor.profilesRoot, profileId);
    try {
      await fs.rm(profileDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }

    return this.getProfilesState();
  }

  private async requireManifest(): Promise<ProfilesManifest> {
    const manifest = await this.deps.paths.readProfilesManifest();
    if (!manifest) {
      const anchor = this.deps.getAnchor();
      const fresh = createDefaultProfilesManifest(anchor.activeProfileId);
      await this.deps.paths.writeProfilesManifest(fresh);
      return fresh;
    }
    return manifest;
  }
}
