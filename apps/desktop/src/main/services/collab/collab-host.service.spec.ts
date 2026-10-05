import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { on: vi.fn(), off: vi.fn(), getVersion: () => '0.0.0-test' },
  nativeTheme: { shouldUseDarkColors: true, themeSource: 'system' },
  shell: {},
  safeStorage: undefined,
}));

const { ConfigStore } = await import('../config.service');
const { CollabCredentialVault } = await import('./collab-credential-vault');
const { CollabHost } = await import('./collab-host.service');
const { CollabUserError } = await import('./collab-errors');

type WorkspaceGitHost = ConstructorParameters<typeof CollabHost>[2];

const cipher = {
  isAvailable: () => true,
  encrypt: (plain: string) => Buffer.from(`enc:${plain}`, 'utf8'),
  decrypt: (data: Buffer) => data.toString('utf8').slice(4),
};

function fakeGit(fetchError: Error | null, hasCli = true) {
  return {
    cliAvailable: vi.fn(() => Promise.resolve(hasCli)),
    ensureRepo: vi.fn((dir: string) => mkdir(dir, { recursive: true })),
    setRemote: vi.fn(() => Promise.resolve()),
    fetchFiles: vi.fn(() => (fetchError ? Promise.reject(fetchError) : Promise.resolve(null))),
  };
}

describe('CollabHost.connectRepo', () => {
  let root = '';
  let store: InstanceType<typeof ConfigStore>;
  let vault: InstanceType<typeof CollabCredentialVault>;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'testrix-collab-host-'));
    store = new ConfigStore({ getPath: () => root } as never);
    await store.load();
    vault = new CollabCredentialVault(path.join(root, 'collab-vault.bin'), cipher);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  function hostWith(git: ReturnType<typeof fakeGit>) {
    return new CollabHost(store, vault, git as unknown as WorkspaceGitHost, vi.fn());
  }

  async function leftoverClones(): Promise<string[]> {
    return existsSync(store.reposRoot()) ? readdir(store.reposRoot()) : [];
  }

  it('rejects an address that is not a Git remote', async () => {
    // Arrange
    const git = fakeGit(null);

    // Act
    const connecting = hostWith(git).connectRepo({ url: 'not a repo' });

    // Assert
    await expect(connecting).rejects.toBeInstanceOf(CollabUserError);
    expect(git.ensureRepo).not.toHaveBeenCalled();
  });

  it('asks for Git before using an SSH address without the CLI', async () => {
    // Arrange
    const git = fakeGit(null, false);

    // Act
    const connecting = hostWith(git).connectRepo({ url: 'git@github.com:team/testing.git' });

    // Assert
    await expect(connecting).rejects.toMatchObject({ code: 'tooling' });
  });

  it('cleans up the clone and reports offline when the remote is unreachable', async () => {
    // Arrange
    const git = fakeGit(new Error('getaddrinfo ENOTFOUND github.com'));

    // Act
    const connecting = hostWith(git).connectRepo({ url: 'https://github.com/team/testing.git' });

    // Assert
    await expect(connecting).rejects.toMatchObject({ code: 'offline' });
    expect(store.collabRepos()).toEqual([]);
    expect(await leftoverClones()).toEqual([]);
  });

  it('reports a credential problem as an auth error', async () => {
    // Arrange
    const git = fakeGit(new Error('HTTP 401 Unauthorized'));

    // Act
    const connecting = hostWith(git).connectRepo({
      url: 'https://github.com/team/testing.git',
      username: 'sam',
      password: 'wrong',
    });

    // Assert
    await expect(connecting).rejects.toMatchObject({ code: 'auth' });
    expect(store.collabRepos()).toEqual([]);
    expect(await vault.getGit('https://github.com/team/testing.git')).toEqual({ username: 'sam', password: 'wrong' });
  });

  it('reports a local-only status before any repository is connected', async () => {
    // Act
    const status = await hostWith(fakeGit(null)).status();

    // Assert
    expect(status.repos).toEqual([]);
  });
});
