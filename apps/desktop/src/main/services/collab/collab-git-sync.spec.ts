import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import {
  arbitrateCollabLock,
  COLLAB_LEGACY_WORKSPACE,
  COLLAB_MANIFEST_FILE,
  collabCommitBody,
  collabPresencePath,
  collabWorkspacePath,
  parseCollabManifest,
  type CollabLockFile,
  type CollabManifest,
} from '@testrix/contracts';
import { describe, expect, it } from 'vitest';

import { migrateLegacyRepoLayout } from './collab-repo-storage';
import { CollabSharedState } from './collab-shared-state';
import { GitCli, type GitNetworkPrefs } from './git-cli';
import { isCollabRejectedPush, WorkspaceGitHost } from './workspace-git-host.service';

const run = promisify(execFile);
const PREFS: GitNetworkPrefs = { proxyUrl: null, caPath: null, verifyTls: true };
const AUTHOR = { name: 'Sam', email: 'sam@users.testrix.local' };
const BOB = { name: 'Bob', email: 'bob@users.testrix.local' };
const MANIFEST: CollabManifest = {
  schemaVersion: 1,
  workspaces: [
    { id: 'ws-api', name: 'Client API', folder: 'api' },
    { id: 'ws-web', name: 'Web', folder: 'web' },
  ],
};

// Resolved before collection so the suite skips cleanly on a PC without Git.
const hasGit = await new GitCli().available();

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function lockFor(owner: string, deviceId: string): CollabLockFile {
  const now = new Date().toISOString();
  return {
    packId: 'pack_smoke',
    packName: 'Smoke pack',
    owner,
    deviceId,
    environment: 'Staging',
    startedAt: now,
    renewedAt: now,
    completed: 0,
    total: 30,
  };
}

/**
 * Exercises the real Git path against a bare repository on disk: the system binary
 * moves commits, isomorphic-git writes and reads them, and `.collab/shared` travels.
 * One repository holds several workspaces, each in `workspaces/<folder>/`.
 */
describe.skipIf(!hasGit)('collab git sync', () => {
  it('syncs several workspaces, per-workspace locks, and removals between two clones', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'testrix-collab-'));
    const origin = path.join(root, 'origin.git');
    await run('git', ['init', '--bare', '--initial-branch=main', origin]);
    const remoteUrl = `file:///${origin.replace(/\\/g, '/')}`;

    const git = new WorkspaceGitHost(new GitCli());
    const shared = new CollabSharedState();
    const alice = path.join(root, 'alice');
    const bob = path.join(root, 'bob');
    const aliceApi = path.join(alice, 'workspaces', 'api');
    const bobApi = path.join(bob, 'workspaces', 'api');

    // Alice publishes two workspaces plus a heartbeat. Her secrets stay on her PC.
    await git.ensureRepo(alice, 'main');
    await git.setRemote(alice, remoteUrl);
    await writeJson(path.join(alice, COLLAB_MANIFEST_FILE), MANIFEST);
    await writeJson(path.join(aliceApi, 'collections.json'), {
      collections: [{ id: 'req_1', name: 'Login request', kind: 'http' }],
    });
    await writeJson(path.join(aliceApi, 'secrets.local.json'), { token: 'hunter2' });
    await writeJson(path.join(aliceApi, 'history.json'), { items: [] });
    await writeJson(path.join(alice, 'workspaces', 'web', 'flows.json'), { items: [{ id: 'flow_1' }] });
    await shared.heartbeat(
      alice,
      { identity: AUTHOR, presenceMode: 'active', shareRuns: true, deviceId: 'device-alice' },
      '2.0.0',
    );
    const published = `Published Client API and Web\n\n${collabCommitBody(['ws-api', 'ws-web'])}`;
    expect(await git.commitTeam(alice, published, AUTHOR)).toBeTruthy();
    await git.push(alice, 'main', 'ssh', PREFS, null);

    // Bob connects and receives both workspaces, keyed by repository path.
    await git.ensureRepo(bob, 'main');
    await git.setRemote(bob, remoteUrl);
    const remote = await git.fetchFiles(bob, 'main', 'ssh', PREFS, null);
    expect(remote).not.toBeNull();
    const files = remote?.files ?? {};
    expect(parseCollabManifest(JSON.parse(files[COLLAB_MANIFEST_FILE] ?? '{}')).workspaces.map((w) => w.id)).toEqual([
      'ws-api',
      'ws-web',
    ]);
    expect(files[collabWorkspacePath('api', 'collections.json')]).toContain('Login request');
    expect(files[collabWorkspacePath('web', 'flows.json')]).toContain('flow_1');
    expect(files[collabWorkspacePath('api', 'secrets.local.json')]).toBeUndefined();
    expect(files[collabWorkspacePath('api', 'history.json')]).toBeUndefined();
    expect(files[collabPresencePath('device-alice')]).toContain('device-alice');

    const aliceLog = await git.log(alice);
    expect(aliceLog[0]?.workspaceIds).toEqual(['ws-api', 'ws-web']);

    await shared.mergeRemote(bob, files, 'device-bob');
    const presence = await shared.view(bob, {
      identity: { name: 'Bob', email: BOB.email },
      presenceMode: 'active',
      shareRuns: true,
      deviceId: 'device-bob',
    });
    expect(presence.presence.map((entry) => entry.name)).toEqual(['Sam']);

    // Bob's history starts fresh, so his work replays on top of the fetched tip.
    expect(await git.alignBranch(bob, 'main', remote?.oid ?? '')).toBe(true);
    await writeJson(path.join(bob, COLLAB_MANIFEST_FILE), MANIFEST);
    for (const [file, text] of Object.entries(files)) {
      if (!file.startsWith('workspaces/') || file.includes('/.collab/'))
        continue;
      const target = path.join(bob, ...file.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, text, 'utf8');
    }

    // Bob claims the pack in the api workspace and pushes the lock first.
    await shared.writeLock(bobApi, lockFor('Bob', 'device-bob'));
    await git.commitTeam(bob, `Updated team status\n\n${collabCommitBody(['ws-api'])}`, BOB);
    await git.push(bob, 'main', 'ssh', PREFS, null);

    // Alice pushing on a stale base is rejected, which is how the lock is arbitrated.
    await writeJson(path.join(alice, 'workspaces', 'web', 'flows.json'), { items: [] });
    await git.commitTeam(alice, 'Updated flows', AUTHOR);
    let rejected: unknown = null;
    try {
      await git.push(alice, 'main', 'ssh', PREFS, null);
    } catch (error) {
      rejected = error;
    }
    expect(isCollabRejectedPush(rejected)).toBe(true);

    // After fetching, Alice sees Bob holds the pack in api, and web has no lock.
    const second = await git.fetchFiles(alice, 'main', 'ssh', PREFS, null);
    await shared.mergeRemote(alice, second?.files ?? {}, 'device-alice');
    const lock = await shared.readLock(aliceApi, 'pack_smoke');
    expect(lock?.owner).toBe('Bob');
    expect(arbitrateCollabLock(lock, 'device-alice')).toBe('held');
    expect(arbitrateCollabLock(lock, 'device-bob')).toBe('mine');
    expect(await shared.readLock(path.join(alice, 'workspaces', 'web'), 'pack_smoke')).toBeNull();

    // Bob removes the web workspace from the repository; the deletion is committed.
    await rm(path.join(bob, 'workspaces', 'web'), { recursive: true, force: true });
    await writeJson(path.join(bob, COLLAB_MANIFEST_FILE), { schemaVersion: 1, workspaces: [MANIFEST.workspaces[0]] });
    expect(await shared.releaseOwnLocksEverywhere(bob, 'device-bob')).toEqual(['pack_smoke']);
    expect(await git.commitTeam(bob, 'Removed Web from the repository', BOB)).toBeTruthy();
    await git.push(bob, 'main', 'ssh', PREFS, null);

    const third = await git.fetchFiles(alice, 'main', 'ssh', PREFS, null);
    expect(third?.files[collabWorkspacePath('web', 'flows.json')]).toBeUndefined();
    expect(parseCollabManifest(JSON.parse(third?.files[COLLAB_MANIFEST_FILE] ?? '{}')).workspaces).toHaveLength(1);
    await shared.mergeRemote(alice, third?.files ?? {}, 'device-alice');
    expect(await shared.readLock(aliceApi, 'pack_smoke')).toBeNull();

    // Local-only files never enter a commit, in any workspace folder.
    const ignore = await readFile(path.join(alice, '.gitignore'), 'utf8');
    expect(ignore).toContain('**/secrets.local.json');
    expect(ignore).toContain('**/.collab/local/');
  }, 60_000);

  it('reorganizes a single-workspace clone into the multi-workspace layout', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'testrix-collab-legacy-'));
    await writeJson(path.join(repo, 'collections.json'), { collections: [] });
    await writeJson(path.join(repo, 'secrets.local.json'), {});
    await writeJson(path.join(repo, '.collab', 'local', 'base', 'collections.json'), { collections: [] });
    await writeJson(path.join(repo, '.collab', 'shared', 'locks', 'pack_smoke.json'), lockFor('Sam', 'device-alice'));
    await writeJson(path.join(repo, '.collab', 'shared', 'presence', 'device-alice.json'), {});

    await migrateLegacyRepoLayout(repo, 'Team API');

    const { folder, id } = COLLAB_LEGACY_WORKSPACE;
    const workspaceDir = path.join(repo, 'workspaces', folder);
    expect(existsSync(path.join(repo, 'collections.json'))).toBe(false);
    expect(existsSync(path.join(workspaceDir, 'collections.json'))).toBe(true);
    expect(existsSync(path.join(workspaceDir, 'secrets.local.json'))).toBe(true);
    expect(existsSync(path.join(repo, '.collab', 'local', 'base', 'workspaces', folder, 'collections.json'))).toBe(true);
    expect(existsSync(path.join(workspaceDir, '.collab', 'shared', 'locks', 'pack_smoke.json'))).toBe(true);
    expect(existsSync(path.join(repo, '.collab', 'shared', 'presence', 'device-alice.json'))).toBe(true);
    const manifest = parseCollabManifest(JSON.parse(await readFile(path.join(repo, COLLAB_MANIFEST_FILE), 'utf8')));
    expect(manifest.workspaces).toEqual([{ id, name: 'Team API', folder }]);
  });
});
