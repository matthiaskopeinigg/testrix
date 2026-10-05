import fs from 'node:fs';
import path from 'node:path';

import {
  COLLAB_GITIGNORE,
  COLLAB_MANIFEST_FILE,
  COLLAB_TEAM_FILES,
  isCollabTeamPath,
  readCollabCommitWorkspaces,
  type CollabTransport,
} from '@testrix/contracts';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';

import { CollabUserError } from './collab-errors';
import type { GitCli, GitNetworkPrefs } from './git-cli';

export interface GitLogEntry {
  readonly oid: string;
  /** Subject line only. */
  readonly message: string;
  readonly author: string;
  readonly at: string;
  /** Repository workspace ids named in the commit's trailers. */
  readonly workspaceIds: readonly string[];
}

export interface GitAuth {
  readonly username: string;
  readonly password: string;
}

export interface GitRemoteSnapshot {
  readonly oid: string;
  /** Collab files in that commit, keyed by repository path. */
  readonly files: Record<string, string>;
}

/**
 * Paths Collab reads and commits: the manifest, team files in each workspace folder,
 * shared state anywhere, and root team files left by a single-workspace repository.
 */
export function isCollabRepoPath(file: string): boolean {
  if ((COLLAB_TEAM_FILES as readonly string[]).includes(file))
    return true;
  if (isCollabTeamPath(file))
    return true;
  return isCollabStatePath(file);
}

/** The Collab paths that are not team files: the manifest, `.gitignore` and shared state. */
export function isCollabStatePath(file: string): boolean {
  if (file === '.gitignore' || file === COLLAB_MANIFEST_FILE)
    return true;
  return /(^|\/)\.collab\/shared\//.test(file);
}

/**
 * Git for a shared workspace. Objects and commits are always handled in-process by
 * isomorphic-git; the network hop uses the system binary for SSH and corporate TLS.
 */
export class WorkspaceGitHost {
  private readonly snapshots = new Map<string, GitRemoteSnapshot>();

  constructor(private readonly cli: GitCli) {}

  usesCli(transport: CollabTransport, prefs: GitNetworkPrefs): boolean {
    return transport === 'ssh' || Boolean(prefs.proxyUrl) || Boolean(prefs.caPath) || !prefs.verifyTls;
  }

  /** True when the system git binary is present, which SSH remotes require. */
  async cliAvailable(): Promise<boolean> {
    return this.cli.available();
  }

  async readCommitMeta(dir: string, oid: string): Promise<GitLogEntry | null> {
    try {
      const { commit } = await git.readCommit({ fs, dir, oid });
      return logEntry(oid, commit);
    } catch {
      return null;
    }
  }

  async ensureRepo(dir: string, branch: string): Promise<void> {
    await fs.promises.mkdir(dir, { recursive: true });
    const gitdir = path.join(dir, '.git');
    if (!fs.existsSync(gitdir))
      await git.init({ fs, dir, defaultBranch: branch || 'main' });
    const ignorePath = path.join(dir, '.gitignore');
    const ignore = fs.existsSync(ignorePath) ? await fs.promises.readFile(ignorePath, 'utf8') : '';
    if (ignore !== COLLAB_GITIGNORE)
      await fs.promises.writeFile(ignorePath, COLLAB_GITIGNORE, 'utf8');
  }

  async setRemote(dir: string, url: string): Promise<void> {
    const remotes = await git.listRemotes({ fs, dir });
    if (remotes.some((remote) => remote.remote === 'origin'))
      await git.deleteRemote({ fs, dir, remote: 'origin' });
    await git.addRemote({ fs, dir, remote: 'origin', url });
  }

  /**
   * One `statusMatrix` for the Collab paths in `scope`. Reused by commit and the
   * no-op sync check so the working tree is walked once per pass.
   */
  async teamStatus(
    dir: string,
    scope: (file: string) => boolean = isCollabRepoPath,
  ): Promise<ReadonlyArray<readonly [string, number, number, number]>> {
    const filter = (file: string): boolean => isCollabRepoPath(file) && scope(file);
    return git.statusMatrix({ fs, dir, filter });
  }

  async hasTeamChanges(dir: string): Promise<boolean> {
    for (const [, head, workdir] of await this.teamStatus(dir)) {
      if (workdir === 0) {
        if (head !== 0)
          return true;
        continue;
      }
      if (workdir !== 1)
        return true;
    }
    return false;
  }

  /**
   * Stages every Collab path that differs from HEAD, including deletions, and commits.
   * Returns the new oid, or null when nothing changed.
   */
  async commitTeam(
    dir: string,
    message: string,
    author: { readonly name: string; readonly email: string },
    scope: (file: string) => boolean = isCollabRepoPath,
  ): Promise<string | null> {
    let hasChanges = false;
    // Rows are [file, head, workdir, stage]: 0 absent, 1 same as HEAD, 2+ different.
    for (const [file, head, workdir, stage] of await this.teamStatus(dir, scope)) {
      if (workdir === 0) {
        if (head !== 0 || stage !== 0)
          await git.remove({ fs, dir, filepath: file });
        hasChanges ||= head !== 0;
        continue;
      }
      if (head !== 1 || workdir !== 1 || stage !== 1)
        await git.add({ fs, dir, filepath: file });
      hasChanges ||= workdir !== 1;
    }
    if (!hasChanges)
      return null;
    return git.commit({
      fs,
      dir,
      message,
      author: { name: author.name || 'Testrix', email: author.email || 'teammate@users.testrix.local' },
    });
  }

  async log(dir: string, depth = 60): Promise<GitLogEntry[]> {
    if (!fs.existsSync(path.join(dir, '.git')))
      return [];
    try {
      const commits = await git.log({ fs, dir, depth });
      return commits.map((commit) => logEntry(commit.oid, commit.commit));
    } catch {
      return [];
    }
  }

  async head(dir: string): Promise<string | null> {
    try {
      return await git.resolveRef({ fs, dir, ref: 'HEAD' });
    } catch {
      return null;
    }
  }

  /** Last fetched tip of the branch, without touching the network. */
  async remoteRef(dir: string, branch: string): Promise<string | null> {
    try {
      return await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${branch}` });
    } catch {
      return null;
    }
  }

  /**
   * Points the local branch at the fetched tip so the next commit lands on top of it.
   * The working tree is left alone: it already holds the merged content, which becomes
   * one commit on top of the teammate's work. Returns true when the branch moved.
   */
  async alignBranch(dir: string, branch: string, remoteOid: string): Promise<boolean> {
    const head = await this.head(dir);
    if (head === remoteOid)
      return false;
    if (head && (await this.isDescendant(dir, head, remoteOid)))
      return false;
    await git.writeRef({ fs, dir, ref: `refs/heads/${branch}`, value: remoteOid, force: true });
    for (const filepath of await git.listFiles({ fs, dir, ref: remoteOid }))
      await git.resetIndex({ fs, dir, filepath, ref: remoteOid });
    return true;
  }

  private async isDescendant(dir: string, oid: string, ancestor: string): Promise<boolean> {
    try {
      return await git.isDescendent({ fs, dir, oid, ancestor, depth: -1 });
    } catch {
      return false;
    }
  }

  /**
   * Fetches the branch and reads the team files plus shared state out of that commit.
   * Returns null when the branch does not exist on the remote yet.
   */
  async fetchFiles(
    dir: string,
    branch: string,
    transport: CollabTransport,
    prefs: GitNetworkPrefs,
    auth: GitAuth | null,
  ): Promise<GitRemoteSnapshot | null> {
    if (this.usesCli(transport, prefs)) {
      try {
        await this.cli.fetch(dir, branch, prefs);
      } catch (error) {
        if (isMissingRemote(error))
          return null;
        throw error;
      }
    } else {
      try {
        await git.fetch({
          fs,
          http,
          dir,
          remote: 'origin',
          ref: branch,
          singleBranch: true,
          onAuth: () => auth ?? { cancel: true },
        });
      } catch (error) {
        if (isMissingRemote(error))
          return null;
        throw error;
      }
    }
    let oid: string;
    try {
      oid = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${branch}` });
    } catch {
      return null;
    }
    const cached = this.snapshots.get(dir);
    if (cached?.oid === oid)
      return { oid, files: { ...cached.files } };
    const snapshot = { oid, files: await this.readCommitFiles(dir, oid) };
    this.snapshots.set(dir, snapshot);
    return { oid, files: { ...snapshot.files } };
  }

  /** Collab files inside one commit, keyed by repository path. */
  async readCommitFiles(dir: string, oid: string): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    let paths: string[] = [];
    try {
      paths = await git.listFiles({ fs, dir, ref: oid });
    } catch {
      return files;
    }
    const wanted = paths.filter((file) => file !== '.gitignore' && isCollabRepoPath(file));
    for (const file of wanted) {
      try {
        const { blob } = await git.readBlob({ fs, dir, oid, filepath: file });
        files[file] = Buffer.from(blob).toString('utf8');
      } catch {
        // not readable in that commit
      }
    }
    return files;
  }

  async push(
    dir: string,
    branch: string,
    transport: CollabTransport,
    prefs: GitNetworkPrefs,
    auth: GitAuth | null,
  ): Promise<void> {
    if (this.usesCli(transport, prefs)) {
      await this.cli.push(dir, branch, prefs);
      return;
    }
    const result = await git.push({
      fs,
      http,
      dir,
      remote: 'origin',
      ref: branch,
      remoteRef: branch,
      onAuth: () => auth ?? { cancel: true },
    });
    if (result.error)
      throw new Error(result.error);
  }
}

export function isCollabAuthError(error: unknown): boolean {
  if (error instanceof CollabUserError)
    return error.code === 'auth';
  return /401|403|auth|credential|unauthorized/i.test(errorText(error));
}

export function isCollabOfflineError(error: unknown): boolean {
  if (error instanceof CollabUserError)
    return error.code === 'offline';
  return /ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|network|fetch failed|unable to connect|getaddrinfo/i.test(
    errorText(error),
  );
}

export function isCollabRejectedPush(error: unknown): boolean {
  return /non-fast-forward|fetch first|rejected|not a simple fast-forward/i.test(errorText(error));
}

function logEntry(
  oid: string,
  commit: { readonly message: string; readonly author: { readonly name?: string; readonly timestamp?: number } },
): GitLogEntry {
  return {
    oid,
    message: commit.message.split('\n')[0] ?? 'Updated workspace',
    author: commit.author.name ?? 'Someone',
    at: new Date((commit.author.timestamp ?? 0) * 1000).toISOString(),
    workspaceIds: readCollabCommitWorkspaces(commit.message),
  };
}

function isMissingRemote(error: unknown): boolean {
  if (error instanceof CollabUserError)
    return false;
  return /not found|does not exist|remote ref|couldn't find remote ref|404/i.test(errorText(error));
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
