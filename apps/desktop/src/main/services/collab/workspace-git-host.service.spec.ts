import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { COLLAB_MANIFEST_FILE, collabPresencePath, collabWorkspacePath } from '@testrix/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GitCli } from './git-cli';
import { isCollabRepoPath, isCollabStatePath, WorkspaceGitHost } from './workspace-git-host.service';

const AUTHOR = { name: 'Sam', email: 'sam@users.testrix.local' };

describe('collab repository paths', () => {
  it('separates team files from shared state', () => {
    // Arrange
    const team = collabWorkspacePath('api', 'collections.json');
    const presence = collabPresencePath('device-1');

    // Act
    const results = {
      teamIsRepo: isCollabRepoPath(team),
      teamIsState: isCollabStatePath(team),
      presenceIsState: isCollabStatePath(presence),
      manifestIsState: isCollabStatePath(COLLAB_MANIFEST_FILE),
      strangerIsRepo: isCollabRepoPath('notes.txt'),
    };

    // Assert
    expect(results).toEqual({
      teamIsRepo: true,
      teamIsState: false,
      presenceIsState: true,
      manifestIsState: true,
      strangerIsRepo: false,
    });
  });
});

describe('WorkspaceGitHost.commitTeam', () => {
  let dir: string;
  const host = new WorkspaceGitHost(new GitCli());

  async function put(repoPath: string, text: string): Promise<void> {
    const filePath = path.join(dir, ...repoPath.split('/'));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, text, 'utf8');
  }

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'testrix-git-host-'));
    await host.ensureRepo(dir, 'main');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('commits additions and returns null when nothing changed', async () => {
    // Arrange
    await put(collabWorkspacePath('api', 'collections.json'), '{"a":1}');
    await put('notes.txt', 'ignored');

    // Act
    const first = await host.commitTeam(dir, 'first', AUTHOR);
    const second = await host.commitTeam(dir, 'second', AUTHOR);

    // Assert
    expect(first).toMatch(/^[0-9a-f]{40}$/);
    expect(second).toBeNull();
    expect(await host.head(dir)).toBe(first);
  });

  it('commits a deleted team file', async () => {
    // Arrange
    const repoPath = collabWorkspacePath('api', 'collections.json');
    await put(repoPath, '{"a":1}');
    await host.commitTeam(dir, 'first', AUTHOR);
    await rm(path.join(dir, ...repoPath.split('/')));

    // Act
    const oid = await host.commitTeam(dir, 'delete', AUTHOR);

    // Assert
    expect(oid).not.toBeNull();
    expect((await host.log(dir)).map((entry) => entry.message)).toEqual(['delete', 'first']);
  });

  it('limits a state-only commit to shared state', async () => {
    // Arrange
    const team = collabWorkspacePath('api', 'collections.json');
    await put(team, '{"a":1}');
    await host.commitTeam(dir, 'first', AUTHOR);
    await put(team, '{"a":2}');

    // Act
    const teamOnly = await host.commitTeam(dir, 'state', AUTHOR, isCollabStatePath);
    await put(collabPresencePath('device-1'), '{}');
    const withPresence = await host.commitTeam(dir, 'state', AUTHOR, isCollabStatePath);
    const files = await host.readCommitFiles(dir, withPresence ?? '');

    // Assert
    expect(teamOnly).toBeNull();
    expect(files[team]).toBe('{"a":1}');
    expect(files[collabPresencePath('device-1')]).toBe('{}');
  });

  it('reports a dirty tree and a clean tree', async () => {
    await put(collabWorkspacePath('api', 'collections.json'), '{"a":1}');
    expect(await host.hasTeamChanges(dir)).toBe(true);
    await host.commitTeam(dir, 'first', AUTHOR);
    expect(await host.hasTeamChanges(dir)).toBe(false);
  });
});
