import type { App } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  PATHS_ANCHOR_FILE_NAME,
  PROFILES_FILE_NAME,
  pathsAnchorRawSchema,
  pathsAnchorSchema,
  profilesManifestSchema,
  type PathsAnchor,
  type ProfilesManifest,
} from '../../../shared/config';

import { defaultConfigDir } from '../../config/environment';

export class ConfigPathService {
  constructor(private readonly getPath: App['getPath']) {}

  anchorFilePath(): string {
    return path.join(this.getPath('userData'), PATHS_ANCHOR_FILE_NAME);
  }

  resolveUserDataDisplay(): string {
    return this.getPath('userData');
  }

  profilesManifestPath(): string {
    return path.join(this.getPath('userData'), PROFILES_FILE_NAME);
  }

  async readAnchorRaw(): Promise<unknown | undefined> {
    const p = this.anchorFilePath();
    try {
      const raw = await fs.readFile(p, 'utf8');
      return JSON.parse(raw) as unknown;
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        return undefined;
      }
      throw e;
    }
  }

  async readAnchor(): Promise<PathsAnchor | undefined> {
    const raw = await this.readAnchorRaw();
    if (!raw) {
      return undefined;
    }
    const parsed = pathsAnchorRawSchema.parse(raw);
    if (parsed.schemaVersion === 1) {
      return undefined;
    }
    return pathsAnchorSchema.parse(parsed);
  }

  async readProfilesManifest(): Promise<ProfilesManifest | undefined> {
    const p = this.profilesManifestPath();
    try {
      const raw = await fs.readFile(p, 'utf8');
      const json: unknown = JSON.parse(raw);
      return profilesManifestSchema.parse(json);
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === 'ENOENT') {
        return undefined;
      }
      throw e;
    }
  }

  async writeProfilesManifest(manifest: ProfilesManifest): Promise<void> {
    const p = this.profilesManifestPath();
    await fs.mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    const body = `${JSON.stringify(manifest, null, 2)}\n`;
    await fs.writeFile(tmp, body, 'utf8');
    await fs.rename(tmp, p);
  }

  async writeAnchor(anchor: PathsAnchor): Promise<void> {
    const p = this.anchorFilePath();
    await fs.mkdir(path.dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    const body = `${JSON.stringify(anchor, null, 2)}\n`;
    await fs.writeFile(tmp, body, 'utf8');
    await fs.rename(tmp, p);
  }

  getDefaultConfigDirectory(): string {
    return process.env.TESTRIX_CONFIG_DIR ?? defaultConfigDir();
  }
}
