import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { TeamBranchEntry, TeamCommitDetail, TeamCommitFileChange, TeamCommitFileStatus, TeamHistoryEntry } from '../../../shared/collaboration';
import { splitUnifiedDiffByFile } from '../../../shared/collaboration/unified-diff';

export interface GitRepoStatus {
  readonly branch: string | null;
  readonly clean: boolean;
  readonly ahead: number;
  readonly behind: number;
  readonly changedFiles: readonly string[];
  readonly conflict: boolean;
}

export interface GitRunResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
}

const GIT_TIMEOUT_MS = 120_000;
const GIT_INIT_RETRY_MS = 150;

/**
 * Parses one line of `git branch -a` output into a branch entry, or null when ignorable.
 */
export function parseGitBranchListLine(line: string): { readonly name: string; readonly remote: boolean } | null {
  const trimmed = line.trim().replace(/^\*\s*/, '');
  if (trimmed.length === 0 || trimmed.includes(' -> ')) {
    return null;
  }

  const remote = trimmed.startsWith('remotes/origin/');
  const name = remote ? trimmed.slice('remotes/origin/'.length) : trimmed;
  if (name === 'HEAD' || !isValidGitBranchName(name)) {
    return null;
  }

  return { name, remote };
}

/** Rejects symbolic refs and other non-branch names from `git branch -a`. */
export function isValidGitBranchName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && !trimmed.includes(' -> ') && trimmed !== 'HEAD';
}

/**
 * Low-level Git operations scoped to a workspace directory.
 */
export class GitWorkspaceService {
  private gitAvailable: boolean | null = null;
  private readonly initLocks = new Map<string, Promise<void>>();

  /** Returns whether `git` is available on PATH. */
  async isGitAvailable(): Promise<boolean> {
    if (this.gitAvailable !== null) {
      return this.gitAvailable;
    }
    const result = await this.runGitRaw(['--version'], process.cwd());
    this.gitAvailable = result.ok;
    return this.gitAvailable;
  }

  async detectRepo(workspaceDir: string): Promise<boolean> {
    const result = await this.runGit(['rev-parse', '--git-dir'], workspaceDir);
    return result.ok;
  }

  async initRepo(workspaceDir: string): Promise<void> {
    const key = path.resolve(workspaceDir);
    const pending = this.initLocks.get(key);
    if (pending) {
      await pending;
      if (await this.detectRepo(workspaceDir)) {
        return;
      }
    }

    const initPromise = this.runInitRepo(workspaceDir);
    this.initLocks.set(key, initPromise);
    try {
      await initPromise;
    } finally {
      if (this.initLocks.get(key) === initPromise) {
        this.initLocks.delete(key);
      }
    }
  }

  private async runInitRepo(workspaceDir: string): Promise<void> {
    if (await this.detectRepo(workspaceDir)) {
      return;
    }

    await this.clearStaleGitConfigLock(workspaceDir);

    const result = await this.runGit(['init', '-b', 'main'], workspaceDir);
    if (result.ok || (await this.detectRepo(workspaceDir))) {
      return;
    }

    if (this.isGitConfigLockError(result.stderr)) {
      await this.clearStaleGitConfigLock(workspaceDir);
      await new Promise((resolve) => setTimeout(resolve, GIT_INIT_RETRY_MS));
      if (await this.detectRepo(workspaceDir)) {
        return;
      }

      const retry = await this.runGit(['init', '-b', 'main'], workspaceDir);
      if (retry.ok || (await this.detectRepo(workspaceDir))) {
        return;
      }

      throw new Error(retry.stderr || result.stderr || 'git init failed');
    }

    throw new Error(result.stderr || 'git init failed');
  }

  private isGitConfigLockError(stderr: string): boolean {
    const lower = stderr.toLowerCase();
    return lower.includes('could not lock config file') || lower.includes('config.lock');
  }

  private async clearStaleGitConfigLock(workspaceDir: string): Promise<void> {
    const lockPath = path.join(workspaceDir, '.git', 'config.lock');
    try {
      await fs.unlink(lockPath);
    } catch {
      /* no stale lock */
    }
  }

  async status(workspaceDir: string): Promise<GitRepoStatus> {
    const branchResult = await this.runGit(['rev-parse', '--abbrev-ref', 'HEAD'], workspaceDir);
    const branch = branchResult.ok ? branchResult.stdout.trim() : null;

    const porcelain = await this.runGit(['status', '--porcelain', '-b'], workspaceDir);
    const lines = porcelain.stdout.split('\n').filter((l) => l.length > 0);
    let ahead = 0;
    let behind = 0;
    const changedFiles: string[] = [];
    let conflict = false;

    for (const line of lines) {
      if (line.startsWith('##')) {
        const aheadMatch = line.match(/ahead (\d+)/);
        const behindMatch = line.match(/behind (\d+)/);
        if (aheadMatch) {
          ahead = Number(aheadMatch[1]);
        }
        if (behindMatch) {
          behind = Number(behindMatch[1]);
        }
        continue;
      }
      if (line.includes('UU') || line.startsWith('U ')) {
        conflict = true;
      }
      const file = line.slice(3).trim();
      if (file.length > 0) {
        changedFiles.push(file);
      }
    }

    return { branch, clean: changedFiles.length === 0 && !conflict, ahead, behind, changedFiles, conflict };
  }

  /**
   * Counts commits on `origin/{branch}` that are not reachable from HEAD (after fetch).
   */
  async countCommitsBehindRemote(workspaceDir: string, branch: string): Promise<number> {
    if (!(await this.hasLocalCommits(workspaceDir))) {
      const remoteRef = await this.runGit(['rev-parse', '--verify', `origin/${branch}`], workspaceDir);
      if (!remoteRef.ok) {
        return 0;
      }
      const countResult = await this.runGit(['rev-list', '--count', `origin/${branch}`], workspaceDir);
      if (!countResult.ok) {
        return 0;
      }
      const count = Number(countResult.stdout.trim());
      return Number.isFinite(count) ? count : 0;
    }

    const result = await this.runGit(['rev-list', '--count', `HEAD..origin/${branch}`], workspaceDir);
    if (!result.ok) {
      return 0;
    }
    const count = Number(result.stdout.trim());
    return Number.isFinite(count) ? count : 0;
  }

  /** Returns whether the repo has at least one local commit (HEAD exists). */
  async hasLocalCommits(workspaceDir: string): Promise<boolean> {
    const result = await this.runGit(['rev-parse', '--verify', 'HEAD'], workspaceDir);
    return result.ok;
  }

  /**
   * Checks out `origin/{branch}` when the local repo has no commits yet (fresh `git init`).
   */
  async ensureTrackingBranchFromRemote(
    workspaceDir: string,
    branch: string,
    env?: NodeJS.ProcessEnv,
  ): Promise<boolean> {
    if (await this.hasLocalCommits(workspaceDir)) {
      return false;
    }

    const remoteRef = await this.runGit(['rev-parse', '--verify', `origin/${branch}`], workspaceDir, env);
    if (!remoteRef.ok) {
      return false;
    }

    const checkout = await this.runGit(['checkout', '-B', branch, `origin/${branch}`], workspaceDir, env);
    if (!checkout.ok) {
      throw new Error(checkout.stderr.trim() || `Failed to check out origin/${branch}`);
    }

    return true;
  }

  async stageFiles(workspaceDir: string, files: readonly string[]): Promise<void> {
    if (files.length === 0) {
      return;
    }
    const result = await this.runGit(['add', '--', ...files], workspaceDir);
    if (!result.ok) {
      throw new Error(result.stderr || 'git add failed');
    }
  }

  async commit(
    workspaceDir: string,
    message: string,
    author: { readonly name: string; readonly email: string },
  ): Promise<boolean> {
    const result = await this.runGit(
      ['-c', `user.name=${author.name}`, '-c', `user.email=${author.email}`, 'commit', '-m', message],
      workspaceDir,
    );
    return result.ok;
  }

  async pullRebase(workspaceDir: string, branch: string, env?: NodeJS.ProcessEnv): Promise<GitRunResult> {
    return this.runGit(['pull', '--rebase', 'origin', branch], workspaceDir, env);
  }

  async push(workspaceDir: string, branch: string, env?: NodeJS.ProcessEnv): Promise<GitRunResult> {
    return this.runGit(['push', '-u', 'origin', branch], workspaceDir, env);
  }

  async setRemote(workspaceDir: string, url: string): Promise<void> {
    const existing = await this.runGit(['remote', 'get-url', 'origin'], workspaceDir);
    if (existing.ok) {
      const result = await this.runGit(['remote', 'set-url', 'origin', url], workspaceDir);
      if (!result.ok) {
        throw new Error(result.stderr || 'git remote set-url failed');
      }
      return;
    }
    const result = await this.runGit(['remote', 'add', 'origin', url], workspaceDir);
    if (!result.ok) {
      throw new Error(result.stderr || 'git remote add failed');
    }
  }

  async removeRemote(workspaceDir: string, name = 'origin'): Promise<void> {
    const existing = await this.runGit(['remote', 'get-url', name], workspaceDir);
    if (!existing.ok) {
      return;
    }

    const result = await this.runGit(['remote', 'remove', name], workspaceDir);
    if (!result.ok) {
      throw new Error(result.stderr || 'git remote remove failed');
    }
  }

  async getRemoteUrl(workspaceDir: string): Promise<string | null> {
    const result = await this.runGit(['remote', 'get-url', 'origin'], workspaceDir);
    return result.ok ? result.stdout.trim() || null : null;
  }

  async readUserIdentity(workspaceDir: string): Promise<{ readonly name: string | null; readonly email: string | null }> {
    const nameResult = await this.runGit(['config', 'user.name'], workspaceDir);
    const emailResult = await this.runGit(['config', 'user.email'], workspaceDir);
    return {
      name: nameResult.ok ? nameResult.stdout.trim() || null : null,
      email: emailResult.ok ? emailResult.stdout.trim() || null : null,
    };
  }

  async testRemoteAccess(
    workspaceDir: string,
    remoteUrl?: string | null,
    env?: NodeJS.ProcessEnv,
  ): Promise<GitRunResult> {
    const target = remoteUrl?.trim() || 'origin';
    return this.runGit(['ls-remote', '--heads', target], workspaceDir, env);
  }

  async fetch(workspaceDir: string, env?: NodeJS.ProcessEnv): Promise<GitRunResult> {
    return this.runGit(['fetch', 'origin'], workspaceDir, env);
  }

  async log(workspaceDir: string, limit: number, skip: number): Promise<TeamHistoryEntry[]> {
    const format = '%H%x00%h%x00%an%x00%ae%x00%aI%x00%s';
    const result = await this.runGit(
      ['log', `--format=${format}`, '-n', String(limit), `--skip=${skip}`],
      workspaceDir,
    );
    if (!result.ok) {
      return [];
    }

    const entries: TeamHistoryEntry[] = [];
    for (const line of result.stdout.split('\n').filter((l) => l.length > 0)) {
      const parts = line.split('\0');
      const [hash, shortHash, authorName, authorEmail, committedAt, message] = parts;
      if (!hash || !shortHash) {
        continue;
      }
      const fileStats = await this.readCommitFileStats(workspaceDir, hash);
      entries.push({
        hash,
        shortHash,
        authorName: authorName ?? '',
        authorEmail: authorEmail ?? '',
        committedAt: committedAt ?? '',
        message: message ?? '',
        files: fileStats.files.map((f) => f.path),
        additions: fileStats.additions,
        deletions: fileStats.deletions,
      });
    }
    return entries;
  }

  async getCommitDetail(workspaceDir: string, commitHash: string): Promise<TeamCommitDetail | null> {
    const format = '%H%x00%h%x00%an%x00%ae%x00%aI%x00%s';
    const metaResult = await this.runGit(['show', '-s', `--format=${format}`, commitHash], workspaceDir);
    if (!metaResult.ok) {
      return null;
    }

    const parts = metaResult.stdout.trim().split('\0');
    const [hash, shortHash, authorName, authorEmail, committedAt, message] = parts;
    if (!hash || !shortHash) {
      return null;
    }

    const fileStats = await this.readCommitFileStats(workspaceDir, commitHash);
    const diffResult = await this.runGit(['show', '-U3', '--format=', commitHash], workspaceDir);
    const diffByPath = new Map(splitUnifiedDiffByFile(diffResult.ok ? diffResult.stdout : '').map((f) => [f.path, f.diff]));

    const files: TeamCommitFileChange[] = fileStats.files.map((file) => ({
      ...file,
      diff: diffByPath.get(file.path) ?? '',
    }));

    return {
      hash,
      shortHash,
      authorName: authorName ?? '',
      authorEmail: authorEmail ?? '',
      committedAt: committedAt ?? '',
      message: message ?? '',
      additions: fileStats.additions,
      deletions: fileStats.deletions,
      files,
    };
  }

  private async readCommitFileStats(
    workspaceDir: string,
    commitHash: string,
  ): Promise<{ readonly files: readonly Omit<TeamCommitFileChange, 'diff'>[]; readonly additions: number; readonly deletions: number }> {
    const result = await this.runGit(['show', '--name-status', '--numstat', '--format=', commitHash], workspaceDir);
    if (!result.ok) {
      return { files: [], additions: 0, deletions: 0 };
    }
    return parseCommitFileStats(result.stdout);
  }

  async diffCommit(workspaceDir: string, commitHash: string): Promise<string> {
    const result = await this.runGit(['show', '-U3', '--format=', commitHash], workspaceDir);
    return result.ok ? result.stdout : '';
  }

  async listBranches(workspaceDir: string): Promise<TeamBranchEntry[]> {
    const result = await this.runGit(['branch', '-a'], workspaceDir);
    if (!result.ok) {
      return [];
    }
    const currentStatus = await this.status(workspaceDir);
    const entries: TeamBranchEntry[] = [];
    const seen = new Set<string>();

    for (const line of result.stdout.split('\n')) {
      const parsed = parseGitBranchListLine(line);
      if (!parsed || seen.has(parsed.name)) {
        continue;
      }
      seen.add(parsed.name);
      entries.push({
        name: parsed.name,
        current: currentStatus.branch === parsed.name,
        remote: parsed.remote,
      });
    }
    return entries.sort((a, b) => (a.current === b.current ? a.name.localeCompare(b.name) : a.current ? -1 : 1));
  }

  /**
   * Lists directory paths tracked in the current HEAD commit (repository-relative POSIX paths).
   */
  async listRepoDirectories(workspaceDir: string): Promise<readonly string[]> {
    const result = await this.runGit(['ls-tree', '-d', '--name-only', '-r', 'HEAD'], workspaceDir);
    if (!result.ok) {
      return [];
    }

    return result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .sort((a, b) => a.localeCompare(b));
  }

  async createBranch(workspaceDir: string, name: string): Promise<void> {
    const result = await this.runGit(['checkout', '-b', name], workspaceDir);
    if (!result.ok) {
      throw new Error(result.stderr || 'git checkout -b failed');
    }
  }

  async checkoutBranch(workspaceDir: string, name: string): Promise<void> {
    const result = await this.runGit(['checkout', name], workspaceDir);
    if (!result.ok) {
      throw new Error(result.stderr || 'git checkout failed');
    }
  }

  async deleteBranch(
    workspaceDir: string,
    name: string,
    options?: { readonly deleteRemote?: boolean; readonly env?: NodeJS.ProcessEnv },
  ): Promise<void> {
    if (!isValidGitBranchName(name)) {
      throw new Error('Invalid branch name.');
    }

    const status = await this.status(workspaceDir);
    if (status.branch === name) {
      throw new Error('Switch to another branch before deleting the current branch.');
    }

    const localRef = await this.runGit(['show-ref', '--verify', `refs/heads/${name}`], workspaceDir);
    if (localRef.ok) {
      const localResult = await this.runGit(['branch', '-D', name], workspaceDir);
      if (!localResult.ok) {
        throw new Error(localResult.stderr.trim() || 'Could not delete local branch');
      }
    }

    if (options?.deleteRemote) {
      const remoteResult = await this.runGit(['push', 'origin', '--delete', name], workspaceDir, options.env);
      if (!remoteResult.ok && !remoteResult.stderr.toLowerCase().includes('remote ref does not exist')) {
        throw new Error(remoteResult.stderr.trim() || 'Could not delete remote branch');
      }
    } else if (!localRef.ok) {
      throw new Error(`Branch "${name}" was not found locally.`);
    }
  }

  /** Lists unmerged file paths during a rebase or merge conflict. */
  async listConflictedFiles(workspaceDir: string): Promise<readonly string[]> {
    const conflictFiles = await this.runGit(['diff', '--name-only', '--diff-filter=U'], workspaceDir);
    if (!conflictFiles.ok) {
      return [];
    }
    return conflictFiles.stdout.split('\n').filter((file) => file.length > 0);
  }

  async resolveConflict(workspaceDir: string, resolution: 'ours' | 'theirs' | 'abort'): Promise<void> {
    if (resolution === 'abort') {
      await this.runGit(['rebase', '--abort'], workspaceDir);
      return;
    }
    const strategy = resolution === 'ours' ? '--ours' : '--theirs';
    const conflictFiles = await this.runGit(['diff', '--name-only', '--diff-filter=U'], workspaceDir);
    if (conflictFiles.ok) {
      for (const file of conflictFiles.stdout.split('\n').filter((f) => f.length > 0)) {
        await this.runGit(['checkout', strategy, '--', file], workspaceDir);
        await this.runGit(['add', '--', file], workspaceDir);
      }
    }
    await this.runGit(['rebase', '--continue'], workspaceDir);
  }

  buildAuthEnv(token: string | null): NodeJS.ProcessEnv {
    if (!token) {
      return { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    }
    const header = `Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
    return {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'http.extraHeader',
      GIT_CONFIG_VALUE_0: header,
    };
  }

  private async runGit(
    args: readonly string[],
    cwd: string,
    env?: NodeJS.ProcessEnv,
  ): Promise<GitRunResult> {
    return this.runGitRaw(args, cwd, env);
  }

  private runGitRaw(args: readonly string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<GitRunResult> {
    return new Promise((resolve) => {
      const child = spawn('git', [...args], { cwd, env: env ?? process.env, windowsHide: true });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        resolve({ ok: false, stdout, stderr: 'Git operation timed out', code: null });
      }, GIT_TIMEOUT_MS);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ ok: code === 0, stdout, stderr, code });
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve({ ok: false, stdout, stderr: 'Git executable not found', code: null });
      });
    });
  }
}

export const gitWorkspaceService = new GitWorkspaceService();

function parseCommitFileStats(stdout: string): {
  readonly files: readonly Omit<TeamCommitFileChange, 'diff'>[];
  readonly additions: number;
  readonly deletions: number;
} {
  const byPath = new Map<string, Omit<TeamCommitFileChange, 'diff'>>();
  let additions = 0;
  let deletions = 0;

  for (const line of stdout.split('\n').filter((entry) => entry.length > 0)) {
    const statusMatch = line.match(/^([AMDRT])\t(.+)$/);
    if (statusMatch) {
      const [, code, rest] = statusMatch;
      if (code === 'R' || code === 'T') {
        const [previousPath, path] = rest.split('\t');
        if (path) {
          byPath.set(path, {
            path,
            previousPath: previousPath ?? null,
            status: mapGitFileStatus(code),
            additions: 0,
            deletions: 0,
          });
        }
        continue;
      }
      byPath.set(rest, {
        path: rest,
        status: mapGitFileStatus(code ?? 'M'),
        additions: 0,
        deletions: 0,
      });
      continue;
    }

    const numMatch = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
    if (!numMatch) {
      continue;
    }

    const [, addRaw, delRaw, path] = numMatch;
    const fileAdditions = addRaw === '-' ? 0 : Number(addRaw);
    const fileDeletions = delRaw === '-' ? 0 : Number(delRaw);
    additions += fileAdditions;
    deletions += fileDeletions;

    const existing = byPath.get(path);
    if (existing) {
      byPath.set(path, { ...existing, additions: fileAdditions, deletions: fileDeletions });
      continue;
    }

    byPath.set(path, {
      path,
      status: 'modified',
      additions: fileAdditions,
      deletions: fileDeletions,
    });
  }

  return {
    files: [...byPath.values()],
    additions,
    deletions,
  };
}

function mapGitFileStatus(code: string): TeamCommitFileStatus {
  switch (code) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
    case 'T':
      return 'renamed';
    default:
      return 'modified';
  }
}
