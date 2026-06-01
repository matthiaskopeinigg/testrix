import * as fs from 'node:fs/promises';

import {
  resolveLocalProfileFilePath,
  resolveShareScopeFileNames,
  resolveTeamRepoFilePath,
  resolveTeamRepoProfileDir,
  type ProfileSyncTarget,
  type TeamShareScope,
} from '../../../shared/collaboration';

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
