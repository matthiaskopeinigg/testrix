import { describe, expect, it } from 'vitest';

import {
  COLLAB_LEGACY_WORKSPACE,
  COLLAB_MANIFEST_FILE,
  collabCommitBody,
  collabFolderSlug,
  collabWorkspacePath,
  isCollabTeamPath,
  mergeCollabManifest,
  parseCollabManifest,
  parseCollabWorkspacePath,
  readCollabCommitWorkspaces,
  upgradeLegacyCollabFiles,
  type CollabManifest,
} from './collab';
import { collabLinkedFolder, normalizeRemote, parseCollabReposFile } from './collab-repos-file';
import { parseWorkspacesFile } from './workspace';

const MODIFIED = '2026-01-01T00:00:00.000Z';

function manifest(...entries: Array<[id: string, name: string, folder: string]>): CollabManifest {
  return { schemaVersion: 1, workspaces: entries.map(([id, name, folder]) => ({ id, name, folder })) };
}

describe('collab repository paths', () => {
  it('round-trips workspace paths', () => {
    const repoPath = collabWorkspacePath('client-api', 'collections.json');
    expect(repoPath).toBe('workspaces/client-api/collections.json');
    expect(parseCollabWorkspacePath(repoPath)).toEqual({ folder: 'client-api', file: 'collections.json' });
    expect(parseCollabWorkspacePath('workspaces/client-api/.collab/shared/locks/p.json')).toEqual({
      folder: 'client-api',
      file: '.collab/shared/locks/p.json',
    });
    expect(parseCollabWorkspacePath('collections.json')).toBeNull();
    expect(parseCollabWorkspacePath('workspaces/Bad Folder/collections.json')).toBeNull();
  });

  it('recognizes team files only inside a workspace folder', () => {
    expect(isCollabTeamPath('workspaces/a/flows.json')).toBe(true);
    expect(isCollabTeamPath('workspaces/a/history.json')).toBe(false);
    expect(isCollabTeamPath('flows.json')).toBe(false);
  });

  it('slugs folder names and avoids taken ones', () => {
    expect(collabFolderSlug('Client API (v2)')).toBe('client-api-v2');
    expect(collabFolderSlug('Client API', ['client-api'])).toBe('client-api-2');
    expect(collabFolderSlug('Client API', ['client-api', 'client-api-2'])).toBe('client-api-3');
    expect(collabFolderSlug('!!!')).toBe('workspace');
  });

  it('points linked catalog folders into the repository clone', () => {
    expect(collabLinkedFolder('repo_1', 'client-api')).toBe('repos/repo_1/workspaces/client-api');
  });
});

describe('collab manifest', () => {
  it('parses leniently and drops duplicate ids and folders', () => {
    expect(parseCollabManifest(null)).toEqual({ schemaVersion: 1, workspaces: [] });
    expect(parseCollabManifest({ workspaces: [{ id: 'a', name: 'A', folder: 'Not Valid' }] })).toEqual({
      schemaVersion: 1,
      workspaces: [],
    });
    const parsed = parseCollabManifest({
      workspaces: [
        { id: 'a', name: 'A', folder: 'a' },
        { id: 'a', name: 'A again', folder: 'a-2' },
        { id: 'b', name: 'B', folder: 'a' },
        { id: 'c', name: 'C', folder: 'c' },
      ],
    });
    expect(parsed.workspaces.map((entry) => entry.id)).toEqual(['a', 'c']);
  });

  it('keeps additions from both sides', () => {
    const base = manifest(['a', 'A', 'a']);
    const ours = manifest(['a', 'A', 'a'], ['b', 'B', 'b']);
    const theirs = manifest(['a', 'A', 'a'], ['c', 'C', 'c']);
    expect(mergeCollabManifest(base, ours, theirs).workspaces.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('applies a removal only when the other side left the entry alone', () => {
    const base = manifest(['a', 'A', 'a'], ['b', 'B', 'b']);
    const removedByThem = mergeCollabManifest(base, base, manifest(['a', 'A', 'a']));
    expect(removedByThem.workspaces.map((entry) => entry.id)).toEqual(['a']);

    const renamedByUs = manifest(['a', 'A', 'a'], ['b', 'B renamed', 'b']);
    const kept = mergeCollabManifest(base, renamedByUs, manifest(['a', 'A', 'a']));
    expect(kept.workspaces.map((entry) => entry.name)).toEqual(['A', 'B renamed']);
  });

  it('takes the side that changed an entry, preferring ours when both did', () => {
    const base = manifest(['a', 'A', 'a']);
    expect(mergeCollabManifest(base, base, manifest(['a', 'Theirs', 'a'])).workspaces[0]?.name).toBe('Theirs');
    expect(
      mergeCollabManifest(base, manifest(['a', 'Ours', 'a']), manifest(['a', 'Theirs', 'a'])).workspaces[0]?.name,
    ).toBe('Ours');
  });

  it('never lets two workspaces share a folder', () => {
    const merged = mergeCollabManifest(null, manifest(['a', 'A', 'shared']), manifest(['b', 'B', 'shared']));
    expect(merged.workspaces.map((entry) => entry.id)).toEqual(['a']);
  });
});

describe('legacy repository upgrade', () => {
  it('moves root team files, locks, and runs under the legacy workspace folder', () => {
    const { files, isLegacy } = upgradeLegacyCollabFiles(
      {
        '.gitignore': 'x',
        'collections.json': '{"c":1}',
        '.collab/shared/locks/pack.json': '{}',
        '.collab/shared/runs/r1.json': '{}',
        '.collab/shared/presence/device.json': '{}',
      },
      'Team API',
    );
    const folder = COLLAB_LEGACY_WORKSPACE.folder;
    expect(isLegacy).toBe(true);
    expect(files[`workspaces/${folder}/collections.json`]).toBe('{"c":1}');
    expect(files[`workspaces/${folder}/.collab/shared/locks/pack.json`]).toBe('{}');
    expect(files[`workspaces/${folder}/.collab/shared/runs/r1.json`]).toBe('{}');
    expect(files['.collab/shared/presence/device.json']).toBe('{}');
    expect(files['collections.json']).toBeUndefined();
    expect(parseCollabManifest(JSON.parse(files[COLLAB_MANIFEST_FILE] ?? '{}'))).toEqual({
      schemaVersion: 1,
      workspaces: [{ id: COLLAB_LEGACY_WORKSPACE.id, name: 'Team API', folder }],
    });
  });

  it('leaves organized and empty repositories alone', () => {
    const organized = { [COLLAB_MANIFEST_FILE]: '{}', 'collections.json': '{}' };
    expect(upgradeLegacyCollabFiles(organized, 'X')).toEqual({ files: organized, isLegacy: false });
    expect(upgradeLegacyCollabFiles({ '.gitignore': 'x' }, 'X').isLegacy).toBe(false);
  });
});

describe('commit workspace trailer', () => {
  it('writes and reads workspace ids', () => {
    const message = `Updated collections\n\n${collabCommitBody(['ws-a', 'ws-b'])}`;
    expect(readCollabCommitWorkspaces(message)).toEqual(['ws-a', 'ws-b']);
    expect(readCollabCommitWorkspaces('Updated flows')).toEqual([]);
  });
});

describe('collab repositories file', () => {
  it('drops unreadable entries and duplicate ids or addresses', () => {
    const parsed = parseCollabReposFile({
      items: [
        { id: 'r1', remoteUrl: 'https://github.com/acme/api.git', transport: 'https' },
        { id: 'r1', remoteUrl: 'https://github.com/acme/other', transport: 'https' },
        { id: 'r2', remoteUrl: 'https://GitHub.com/acme/api/', transport: 'https' },
        { id: 'r3', transport: 'https' },
        { id: 'r4', remoteUrl: 'git@github.com:acme/web.git', transport: 'ssh', branch: 'dev', sync: 'paused' },
      ],
    });
    expect(parsed.items.map((item) => item.id)).toEqual(['r1', 'r4']);
    expect(parsed.items[0]?.branch).toBe('main');
    expect(parsed.items[1]).toMatchObject({ branch: 'dev', sync: 'paused' });
    expect(parseCollabReposFile('nope').items).toEqual([]);
  });

  it('normalizes remotes for comparison', () => {
    expect(normalizeRemote(' https://GitHub.com/acme/api.git/ ')).toBe('https://github.com/acme/api');
  });
});

describe('workspace collab link parsing', () => {
  it('keeps a repository link on a shared workspace', () => {
    const parsed = parseWorkspacesFile({
      items: [
        { id: 'ws_1', name: 'Default', folder: 'workspace-1', modifiedAt: MODIFIED },
        {
          id: 'ws_2',
          name: 'Team',
          folder: 'repos/r1/workspaces/team',
          modifiedAt: MODIFIED,
          kind: 'shared',
          collab: { repoId: 'r1', remoteId: 'ws-team' },
        },
      ],
      activeId: 'ws_1',
    });
    const team = parsed.items.find((item) => item.id === 'ws_2');
    expect(team?.kind).toBe('shared');
    expect(team?.collab).toEqual({ repoId: 'r1', remoteId: 'ws-team' });
    expect(team?.legacyCollab).toBeUndefined();
  });

  it('reads per-workspace repository metadata as legacyCollab awaiting migration', () => {
    const parsed = parseWorkspacesFile({
      items: [
        { id: 'ws_1', name: 'Default', folder: 'workspace-1', modifiedAt: MODIFIED },
        {
          id: 'ws_2',
          name: 'Team',
          folder: 'workspace-2',
          modifiedAt: MODIFIED,
          kind: 'shared',
          collab: { remoteUrl: 'https://github.com/acme/api.git', transport: 'https', branch: 'main' },
        },
      ],
      activeId: 'ws_1',
    });
    const team = parsed.items.find((item) => item.id === 'ws_2');
    expect(team?.kind).toBe('shared');
    expect(team?.collab).toBeUndefined();
    expect(team?.legacyCollab?.remoteUrl).toBe('https://github.com/acme/api.git');
  });

  it('falls back to local when a shared workspace has no readable link', () => {
    const parsed = parseWorkspacesFile({
      items: [
        { id: 'ws_1', name: 'Default', folder: 'workspace-1', modifiedAt: MODIFIED },
        { id: 'ws_2', name: 'Team', folder: 'workspace-2', modifiedAt: MODIFIED, kind: 'shared', collab: {} },
      ],
      activeId: 'ws_1',
    });
    expect(parsed.items.find((item) => item.id === 'ws_2')?.kind).toBe('local');
  });
});
