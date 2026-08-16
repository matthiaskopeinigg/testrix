import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import {
  resolveLocalProfileFilePath,
  resolveShareScopeFileNames,
  resolveTeamRepoFilePath,
  resolveTeamRepoProfileDir,
  type ProfileSyncTarget,
  type TeamShareScope,
} from '../../../shared/collaboration';
import { DATABASES_FILE_NAME } from '../../../shared/config/constants';
import {
  createDefaultTeamDatabasesFile,
  mergeTeamDatabasesFiles,
  sanitizeTeamDatabasesFile,
  teamDatabasesFileSchema,
  type TeamDatabasesFile,
} from '../../../shared/database';

export interface MirrorProfileFilesOptions {
  readonly teamRepoDir: string;
  readonly target: ProfileSyncTarget;
  readonly shareScope: TeamShareScope;
  readonly repoDataDir?: string;
  readonly fileNames?: readonly string[];
}

/**
 * Copies share-scoped profile workspace files between local profile dirs and the team Git repo.
 */
export class TeamProfileMirrorService {
  /**
   * Mirrors local profile files into the team repo before Git commit.
   */
  async mirrorLocalToRepo(options: MirrorProfileFilesOptions): Promise<readonly string[]> {
    const fileNames = options.fileNames ?? resolveShareScopeFileNames(options.shareScope);
    const mirrored: string[] = [];

    await fs.mkdir(resolveTeamRepoProfileDir(options.teamRepoDir, options.target.profileId, options.repoDataDir), {
      recursive: true,
    });

    for (const fileName of fileNames) {
      const sourcePath = resolveLocalProfileFilePath(options.target.dir, fileName);
      const destPath = resolveTeamRepoFilePath(
        options.teamRepoDir,
        options.target.profileId,
        fileName,
        options.repoDataDir,
      );
      try {
        await fs.access(sourcePath);
      } catch {
        continue;
      }
      if (fileName === DATABASES_FILE_NAME) {
        const local = await readTeamDatabasesFile(sourcePath);
        await writePrettyJson(destPath, sanitizeTeamDatabasesFile(local));
        mirrored.push(fileName);
        continue;
      }
      try {
        await fs.copyFile(sourcePath, destPath);
        mirrored.push(fileName);
      } catch {
        /* local file may not exist yet */
      }
    }

    return mirrored;
  }

  /**
   * Mirrors team repo files back into the local profile workspace after Git pull.
   */
  async mirrorRepoToLocal(options: MirrorProfileFilesOptions): Promise<readonly string[]> {
    const fileNames = options.fileNames ?? resolveShareScopeFileNames(options.shareScope);
    const mirrored: string[] = [];

    await fs.mkdir(options.target.dir, { recursive: true });

    for (const fileName of fileNames) {
      const sourcePath = resolveTeamRepoFilePath(
        options.teamRepoDir,
        options.target.profileId,
        fileName,
        options.repoDataDir,
      );
      const destPath = resolveLocalProfileFilePath(options.target.dir, fileName);
      try {
        await fs.access(sourcePath);
      } catch {
        continue;
      }
      if (fileName === DATABASES_FILE_NAME) {
        const incoming = await readTeamDatabasesFile(sourcePath);
        const local = await readTeamDatabasesFile(destPath);
        await writePrettyJson(destPath, mergeTeamDatabasesFiles(local, incoming));
        mirrored.push(fileName);
        continue;
      }
      try {
        await fs.copyFile(sourcePath, destPath);
        mirrored.push(fileName);
      } catch {
        /* repo file may not exist for this profile/scope */
      }
    }

    return mirrored;
  }
}

export const teamProfileMirrorService = new TeamProfileMirrorService();

/**
 * Reads a profile or repo `databases.json`, or an empty file when missing/invalid.
 */
async function readTeamDatabasesFile(filePath: string): Promise<TeamDatabasesFile> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return teamDatabasesFileSchema.parse(JSON.parse(raw) as unknown);
  } catch {
    return createDefaultTeamDatabasesFile();
  }
}

/**
 * Writes pretty JSON matching other Testrix workspace files.
 */
async function writePrettyJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
