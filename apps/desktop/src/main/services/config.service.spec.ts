import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { EnvironmentsFile } from '@testrix/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  nativeTheme: { shouldUseDarkColors: true, themeSource: 'system' },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plain: string) => Buffer.from(`enc:${plain}`, 'utf8'),
    decryptString: (data: Buffer) => data.toString('utf8').slice(4),
  },
}));

const { ConfigStore } = await import('./config.service');
const { readSecretsFile } = await import('./collab/collab-secrets-file');

function fakeApp(userData: string) {
  return { getPath: () => userData } as unknown as ConstructorParameters<typeof ConfigStore>[0];
}

function withSecret(file: EnvironmentsFile, value: string): Pick<EnvironmentsFile, 'items'> {
  const [first, ...rest] = file.items;
  return {
    items: [
      {
        ...first!,
        variables: [{ kind: 'variable', id: 'var-token', key: 'token', value, description: '', enabled: true, secret: true }],
      },
      ...rest,
    ],
  };
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

describe('ConfigStore', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'testrix-config-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates the config layout on first start and reads it back', async () => {
    // Arrange
    const store = new ConfigStore(fakeApp(root));
    await store.load();

    // Act
    await store.patchEnvironments(withSecret(store.environments, 'local-token'));
    const reloaded = new ConfigStore(fakeApp(root));
    await reloaded.load();

    // Assert
    expect(existsSync(path.join(root, 'configs', 'settings.json'))).toBe(true);
    expect(existsSync(store.filePath('workspaces.json'))).toBe(true);
    expect(reloaded.environments.items[0]?.variables[0]).toMatchObject({ key: 'token', value: 'local-token' });
  });

  it('keeps each workspace’s files apart when creating, switching and deleting', async () => {
    // Arrange
    const store = new ConfigStore(fakeApp(root));
    await store.load();
    const firstId = store.workspaces.activeId!;
    await store.patchEnvironments(withSecret(store.environments, 'first'));

    // Act
    const created = await store.createWorkspace('  Second  ');
    const secondId = created.workspaces.activeId!;
    const secondFolder = store.workspaceDir(store.activeWorkspace()!);
    const secondValue = created.environments.items[0]?.variables.find((node) => node.id === 'var-token');
    await store.switchWorkspace(firstId);
    const firstValue = store.environments.items[0]?.variables[0];
    await store.switchWorkspace(secondId);
    const afterDelete = await store.deleteWorkspace(secondId);

    // Assert
    expect(created.workspaces.items.find((item) => item.id === secondId)?.name).toBe('Second');
    expect(secondValue).toBeUndefined();
    expect(firstValue).toMatchObject({ value: 'first' });
    expect(afterDelete.workspaces.activeId).toBe(firstId);
    expect(store.environments.items[0]?.variables[0]).toMatchObject({ value: 'first' });
    expect(existsSync(secondFolder)).toBe(false);
  });

  it('refuses to delete the last workspace', async () => {
    // Arrange
    const store = new ConfigStore(fakeApp(root));
    await store.load();
    const [first, ...others] = store.workspaces.items.map((item) => item.id);
    for (const id of others)
      await store.deleteWorkspace(id);

    // Act
    const snapshot = await store.deleteWorkspace(first!);

    // Assert
    expect(snapshot.workspaces.items.map((item) => item.id)).toEqual([first]);
    expect(existsSync(store.workspaceDir(store.activeWorkspace()!))).toBe(true);
  });

  it('keeps a copy of a corrupt file and starts from defaults', async () => {
    // Arrange
    const first = new ConfigStore(fakeApp(root));
    await first.load();
    const collectionsPath = first.filePath('collections.json');
    await writeFile(collectionsPath, '{"collections": [', 'utf8');

    // Act
    const store = new ConfigStore(fakeApp(root));
    await store.load();
    const siblings = await readdir(path.dirname(collectionsPath));

    // Assert
    expect(siblings.some((name) => name.startsWith('collections.json.corrupt-'))).toBe(true);
    expect(store.collections.collections).toEqual([]);
  });

  it('writes secrets of a shared workspace to the local overlay, not the team file', async () => {
    // Arrange
    const store = new ConfigStore(fakeApp(root));
    await store.load();
    await store.patchActiveWorkspace({ kind: 'shared', collab: { repoId: 'repo-test', remoteId: 'remote-1' } });

    // Act
    await store.patchEnvironments(withSecret(store.environments, 'team-secret'));
    const teamFile = await readJson<EnvironmentsFile>(store.filePath('environments.json'));
    const rawOverlay = await readFile(store.secretsFilePath(), 'utf8');
    const overlay = await readSecretsFile(store.secretsFilePath());

    // Assert
    expect(teamFile.items[0]?.variables[0]).toMatchObject({ key: 'token', value: '' });
    expect(rawOverlay).not.toContain('team-secret');
    expect(overlay.environments['var-token']).toBe('team-secret');
    expect(store.environments.items[0]?.variables[0]).toMatchObject({ value: 'team-secret' });
  });

  it('reads settings from a custom configs folder', async () => {
    // Arrange
    const store = new ConfigStore(fakeApp(root));
    await store.load();
    const custom = path.join(root, 'elsewhere');
    await mkdir(custom, { recursive: true });

    // Act
    await store.setConfigsFolder(custom);
    await store.patchSettings({ logLevel: 'debug' });

    // Assert
    const settings = await readJson<{ logLevel: string }>(path.join(custom, 'settings.json'));
    expect(settings.logLevel).toBe('debug');
  });
});
