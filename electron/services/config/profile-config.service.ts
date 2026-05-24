import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import {
  createDefaultProfilesManifest,
  createProfileEntry,
  createTeamProfileEntry,
  profilesManifestSchema,
  profilesStateSchema,
  resolveProfileDir,
  asLocalProfile,
  asTeamProfile,
  isTeamProfile,
  normalizeProfileKind,
  type PathsAnchor,
  type ProfileEntry,
  type ProfilesManifest,
  type ProfilesState,
} from '../../../shared/config';
import {
  TEAM_PROFILES_MANIFEST_FILE_NAME,
  teamProfilesManifestSchema,
  type TeamProfilesManifest,
} from '../../../shared/collaboration';

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
  readonly onProfileDirChanged?: (dir: string) => void | Promise<void>;
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

  /**
   * Promotes legacy team-enabled profiles and profileSync entries to profileKind team.
   */
  async migrateLegacyTeamProfileKinds(teamProfileIds: readonly string[]): Promise<ProfilesState> {
    const manifest = await this.requireManifest();
    const teamIdSet = new Set(teamProfileIds);
    let changed = false;
    const profiles = manifest.profiles.map((entry) => {
      const normalized = normalizeProfileKind(entry);
      if (teamIdSet.has(entry.id) && !isTeamProfile(normalized)) {
        changed = true;
        return asTeamProfile(normalized);
      }
      if (normalized.profileKind !== entry.profileKind) {
        changed = true;
        return normalized;
      }
      return entry;
    });

    if (!changed) {
      return this.getProfilesState();
    }

    const nextManifest: ProfilesManifest = profilesManifestSchema.parse({
      ...manifest,
      meta: { ...manifest.meta, updatedAt: new Date().toISOString() },
      profiles,
    });
    await this.deps.paths.writeProfilesManifest(nextManifest);
    return this.getProfilesState();
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

    const profileDir = resolveProfileDir(entry, anchor.profilesRoot);
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
    await this.deps.onProfileDirChanged?.(profileDir);

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

  async linkProfileToDirectory(profileId: string, dirPath: string): Promise<ProfilesState> {
    const trimmed = dirPath.trim();
    if (trimmed.length === 0) {
      throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Directory path is required.');
    }

    const manifest = await this.requireManifest();
    const index = manifest.profiles.findIndex((p) => p.id === profileId);
    if (index < 0) {
      throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Profile not found.');
    }

    await fs.mkdir(trimmed, { recursive: true });
    await this.deps.files.ensureProfileWorkspaceDefaults(trimmed);

    const profiles = [...manifest.profiles];
    profiles[index] = asTeamProfile({
      ...profiles[index],
      linkedDir: trimmed,
    });

    const nextManifest: ProfilesManifest = profilesManifestSchema.parse({
      ...manifest,
      meta: { ...manifest.meta, updatedAt: new Date().toISOString() },
      profiles,
    });
    await this.deps.paths.writeProfilesManifest(nextManifest);

    const anchor = this.deps.getAnchor();
    if (anchor.activeProfileId === profileId) {
      this.deps.setActiveProfileDirRef(trimmed);
      await cookieJarStore.loadForProfile(trimmed);
      await this.deps.onProfileDirChanged?.(trimmed);
    }

    return this.getProfilesState();
  }

  async createLinkedProfile(name: string, dirPath: string): Promise<ProfilesState> {
    const trimmedName = name.trim();
    const trimmedDir = dirPath.trim();
    if (trimmedName.length === 0 || trimmedDir.length === 0) {
      throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Name and directory are required.');
    }

    const anchor = this.deps.getAnchor();
    const manifest = await this.requireManifest();
    const profileId = randomUUID();

    await fs.mkdir(trimmedDir, { recursive: true });
    await this.deps.files.ensureProfileWorkspaceDefaults(trimmedDir);

    const entry = asTeamProfile({
      ...createProfileEntry(profileId, trimmedName),
      linkedDir: trimmedDir,
    });

    const nextManifest: ProfilesManifest = profilesManifestSchema.parse({
      ...manifest,
      meta: { ...manifest.meta, updatedAt: new Date().toISOString() },
      profiles: [...manifest.profiles, entry],
    });
    await this.deps.paths.writeProfilesManifest(nextManifest);

    return this.setActiveProfile(profileId);
  }

  /**
   * Imports selected team profiles from the remote catalog into the local registry.
   */
  async importTeamProfiles(
    teamRepoDir: string,
    profileIds: readonly string[],
  ): Promise<{ readonly importedProfileIds: readonly string[] }> {
    const manifestPath = path.join(teamRepoDir, TEAM_PROFILES_MANIFEST_FILE_NAME);
    let raw: string;
    try {
      raw = await fs.readFile(manifestPath, 'utf8');
    } catch {
      return { importedProfileIds: [] };
    }

    const parsed = teamProfilesManifestSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return { importedProfileIds: [] };
    }

    const selected = new Set(profileIds);
    const toImport = parsed.data.profiles.filter((profile) => selected.has(profile.id));
    if (toImport.length === 0) {
      return { importedProfileIds: [] };
    }

    const anchor = this.deps.getAnchor();
    const localManifest = await this.requireManifest();
    const importedProfileIds: string[] = [];
    let profiles = [...localManifest.profiles];

    for (const teamProfile of toImport) {
      const existingIndex = profiles.findIndex((entry) => entry.id === teamProfile.id);
      if (existingIndex < 0) {
        const profileDir = path.join(anchor.profilesRoot, teamProfile.id);
        await fs.mkdir(profileDir, { recursive: true });
        await this.deps.files.ensureProfileWorkspaceDefaults(profileDir);
        profiles.push(asTeamProfile(createProfileEntry(teamProfile.id, teamProfile.name)));
        importedProfileIds.push(teamProfile.id);
        continue;
      }

      const existing = profiles[existingIndex];
      profiles[existingIndex] = asTeamProfile({
        ...existing,
        name: teamProfile.name,
      });
      if (!isTeamProfile(existing)) {
        importedProfileIds.push(teamProfile.id);
      }
    }

    const nextManifest: ProfilesManifest = profilesManifestSchema.parse({
      ...localManifest,
      meta: { ...localManifest.meta, updatedAt: new Date().toISOString() },
      profiles,
    });
    await this.deps.paths.writeProfilesManifest(nextManifest);
    return { importedProfileIds };
  }

  /**
   * Promotes a local profile to a team profile.
   */
  async publishLocalProfile(profileId: string): Promise<ProfilesState> {
    const manifest = await this.requireManifest();
    const index = manifest.profiles.findIndex((p) => p.id === profileId);
    if (index < 0) {
      throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Profile not found.');
    }
    const existing = manifest.profiles[index];
    if (isTeamProfile(existing)) {
      return this.getProfilesState();
    }

    const profiles = [...manifest.profiles];
    profiles[index] = asTeamProfile(existing);
    const nextManifest: ProfilesManifest = profilesManifestSchema.parse({
      ...manifest,
      meta: { ...manifest.meta, updatedAt: new Date().toISOString() },
      profiles,
    });
    await this.deps.paths.writeProfilesManifest(nextManifest);
    return this.getProfilesState();
  }

  /**
   * Creates a new team profile in the local registry.
   */
  async createTeamProfile(name: string): Promise<{ readonly state: ProfilesState; readonly profileId: string }> {
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
      profiles: [...manifest.profiles, createTeamProfileEntry(profileId, trimmed)],
    });
    await this.deps.paths.writeProfilesManifest(nextManifest);

    const state = await this.setActiveProfile(profileId);
    return { state, profileId };
  }

  /**
   * Converts a team profile back to a local-only profile.
   */
  async unpublishProfile(profileId: string): Promise<ProfilesState> {
    const manifest = await this.requireManifest();
    const index = manifest.profiles.findIndex((p) => p.id === profileId);
    if (index < 0) {
      throw new TestrixError(ErrorCodes.CONFIG_VALIDATION_FAILED, 'Profile not found.');
    }

    const profiles = [...manifest.profiles];
    profiles[index] = asLocalProfile(profiles[index]);
    const nextManifest: ProfilesManifest = profilesManifestSchema.parse({
      ...manifest,
      meta: { ...manifest.meta, updatedAt: new Date().toISOString() },
      profiles,
    });
    await this.deps.paths.writeProfilesManifest(nextManifest);
    return this.getProfilesState();
  }

  /**
   * @deprecated Use importTeamProfiles for explicit imports.
   */
  async mergeTeamProfilesFromManifest(teamRepoDir: string): Promise<{ readonly addedProfileIds: readonly string[] }> {
    const manifestPath = path.join(teamRepoDir, TEAM_PROFILES_MANIFEST_FILE_NAME);
    let raw: string;
    try {
      raw = await fs.readFile(manifestPath, 'utf8');
    } catch {
      return { addedProfileIds: [] };
    }

    const parsed = teamProfilesManifestSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return { addedProfileIds: [] };
    }

    return this.mergeTeamProfilesManifest(parsed.data);
  }

  private async mergeTeamProfilesManifest(manifest: TeamProfilesManifest): Promise<{ readonly addedProfileIds: readonly string[] }> {
    const anchor = this.deps.getAnchor();
    const localManifest = await this.requireManifest();
    const addedProfileIds: string[] = [];
    let profiles = [...localManifest.profiles];
    let changed = false;

    for (const teamProfile of manifest.profiles) {
      const existingIndex = profiles.findIndex((entry) => entry.id === teamProfile.id);
      if (existingIndex < 0) {
        const profileDir = path.join(anchor.profilesRoot, teamProfile.id);
        await fs.mkdir(profileDir, { recursive: true });
        await this.deps.files.ensureProfileWorkspaceDefaults(profileDir);
        profiles.push(asTeamProfile(createProfileEntry(teamProfile.id, teamProfile.name)));
        addedProfileIds.push(teamProfile.id);
        changed = true;
        continue;
      }

      const existing = profiles[existingIndex];
      if (existing.name !== teamProfile.name) {
        profiles[existingIndex] = { ...existing, name: teamProfile.name };
        changed = true;
      }
    }

    if (!changed) {
      return { addedProfileIds };
    }

    const nextManifest: ProfilesManifest = profilesManifestSchema.parse({
      ...localManifest,
      meta: { ...localManifest.meta, updatedAt: new Date().toISOString() },
      profiles,
    });
    await this.deps.paths.writeProfilesManifest(nextManifest);
    return { addedProfileIds };
  }

  private async requireManifest(): Promise<ProfilesManifest> {
    const manifest = await this.deps.paths.readProfilesManifest();
    if (!manifest) {
      const anchor = this.deps.getAnchor();
      const fresh = createDefaultProfilesManifest(anchor.activeProfileId);
      await this.deps.paths.writeProfilesManifest(fresh);
      return fresh;
    }

    let changed = false;
    const profiles = manifest.profiles.map((entry) => {
      const normalized = normalizeProfileKind(entry);
      if (normalized.profileKind !== entry.profileKind || normalized.teamEnabled !== entry.teamEnabled) {
        changed = true;
      }
      return normalized;
    });

    if (!changed) {
      return manifest;
    }

    const nextManifest: ProfilesManifest = profilesManifestSchema.parse({
      ...manifest,
      meta: { ...manifest.meta, updatedAt: new Date().toISOString() },
      profiles,
    });
    await this.deps.paths.writeProfilesManifest(nextManifest);
    return nextManifest;
  }
}
