import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { isValidGitBranchName } from '@testrix/contracts';

import { CollabUserError } from './collab-errors';

export interface GitNetworkPrefs {
  /** `http://host:port` when the workspace proxy is on, otherwise null. */
  readonly proxyUrl: string | null;
  /** Extra CA bundle path, otherwise null. */
  readonly caPath: string | null;
  readonly verifyTls: boolean;
}

const RUN_TIMEOUT_MS = 120_000;

/**
 * The system git binary. SSH remotes and corporate TLS go through here so the
 * person's existing keys, agents, and CA bundles keep working.
 */
export class GitCli {
  private resolved: string | null | undefined;

  async path(): Promise<string | null> {
    if (this.resolved !== undefined)
      return this.resolved;
    this.resolved = await locateGit();
    return this.resolved;
  }

  async available(): Promise<boolean> {
    return (await this.path()) !== null;
  }

  async fetch(dir: string, branch: string, prefs: GitNetworkPrefs): Promise<void> {
    const ref = assertGitBranch(branch);
    await this.run(
      dir,
      ['fetch', '--quiet', 'origin', `+refs/heads/${ref}:refs/remotes/origin/${ref}`],
      prefs,
    );
  }

  async push(dir: string, branch: string, prefs: GitNetworkPrefs): Promise<void> {
    const ref = assertGitBranch(branch);
    await this.run(dir, ['push', '--quiet', 'origin', `HEAD:refs/heads/${ref}`], prefs);
  }

  private async run(dir: string, args: readonly string[], prefs: GitNetworkPrefs): Promise<string> {
    const binary = await this.path();
    if (!binary) {
      throw new CollabUserError(
        'Install Git, or use an https address, to sync this workspace.',
        'tooling',
      );
    }
    const config = configArgs(prefs);
    return new Promise((resolve, reject) => {
      execFile(
        binary,
        [...config, ...args],
        {
          cwd: dir,
          timeout: RUN_TIMEOUT_MS,
          windowsHide: true,
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: '0',
            GIT_ASKPASS: '',
            GIT_SSH_COMMAND: process.env['GIT_SSH_COMMAND'] ?? 'ssh -o BatchMode=yes',
            GIT_CONFIG_NOSYSTEM: '1',
            LC_ALL: 'C',
            ...(prefs.caPath ? { GIT_SSL_CAINFO: prefs.caPath } : {}),
          },
        },
        (error, stdout, stderr) => {
          if (!error) {
            resolve(stdout);
            return;
          }
          reject(translate(`${stderr || ''}${stdout || ''}` || error.message));
        },
      );
    });
  }
}

function assertGitBranch(branch: string): string {
  if (!isValidGitBranchName(branch)) {
    throw new CollabUserError('Use a valid Git branch name, for example main or team/api.', 'tooling');
  }
  return branch;
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** A proxy URL git can take as one `-c` value: http(s)/socks with a host and no control characters. */
export function isSafeGitProxyUrl(value: string): boolean {
  if (CONTROL_CHARS.test(value) || /\s/.test(value))
    return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'socks5:', 'socks5h:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function configArgs(prefs: GitNetworkPrefs): string[] {
  const args: string[] = [];
  if (prefs.proxyUrl && isSafeGitProxyUrl(prefs.proxyUrl))
    args.push('-c', `http.proxy=${prefs.proxyUrl}`);
  if (prefs.caPath && !CONTROL_CHARS.test(prefs.caPath))
    args.push('-c', `http.sslCAInfo=${prefs.caPath}`);
  if (!prefs.verifyTls)
    args.push('-c', 'http.sslVerify=false');
  return args;
}

function translate(output: string): Error {
  const text = output.trim();
  if (/host key verification failed|no matching host key|known_hosts/i.test(text)) {
    return new CollabUserError(
      'This PC has not trusted that server yet. Connect once with your Git client, then sync again.',
      'auth',
    );
  }
  if (/permission denied \(publickey\)|could not read from remote repository|authentication failed|invalid username or password|403/i.test(text)) {
    return new CollabUserError('That repository refused the credentials on this PC.', 'auth');
  }
  if (/could not resolve host|connection refused|network is unreachable|operation timed out|failed to connect/i.test(text)) {
    return new CollabUserError('Offline. Your changes are saved on this PC.', 'offline');
  }
  if (/non-fast-forward|fetch first|rejected/i.test(text))
    return new Error(`push rejected: ${text}`);
  return new Error(text || 'Git command failed');
}

async function locateGit(): Promise<string | null> {
  const explicit = process.env['GIT_PATH']?.trim();
  if (explicit && existsSync(explicit))
    return explicit;
  if (await works('git'))
    return 'git';
  for (const candidate of candidatePaths()) {
    if (existsSync(candidate) && (await works(candidate)))
      return candidate;
  }
  return null;
}

function candidatePaths(): string[] {
  if (process.platform === 'win32') {
    const local = process.env['LOCALAPPDATA'] ?? path.join(os.homedir(), 'AppData', 'Local');
    return [
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
      path.join(local, 'Programs', 'Git', 'cmd', 'git.exe'),
    ];
  }
  return ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git'];
}

function works(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(binary, ['--version'], { timeout: 5_000, windowsHide: true }, (error) => {
      resolve(!error);
    });
  });
}
