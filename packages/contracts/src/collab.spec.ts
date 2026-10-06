import { describe, expect, it } from 'vitest';

import { applyCollabReviewChoice, mergeCollabDocument } from './collab-merge';
import { applyCollabSecrets, peelWorkspaceSecrets } from './collab-secrets';
import {
  collabActivitySummary,
  collabChangeKindFromFile,
  collabChangeSummary,
  collabCommitMessage,
  collabRepoSchema,
  collabStatusSchema,
  localCollabStatus,
  parseCollabStatus,
  parseGitRemote,
} from './collab';
import { DEFAULT_COLLECTIONS_FILE } from './config-files';
import { DEFAULT_DATABASES_FILE } from './database';
import { createDefaultEnvironmentsFile } from './environment';

describe('collab remotes and activity', () => {
  it('reads https and ssh repository addresses', () => {
    expect(parseGitRemote('https://github.com/team/workspace.git')).toEqual({
      url: 'https://github.com/team/workspace.git',
      transport: 'https',
      host: 'github.com',
      provider: 'GitHub',
      repo: 'workspace',
    });
    expect(parseGitRemote('git@gitlab.example.com:team/workspace.git')).toEqual({
      url: 'git@gitlab.example.com:team/workspace.git',
      transport: 'ssh',
      host: 'gitlab.example.com',
      provider: 'GitLab',
      repo: 'workspace',
    });
    expect(parseGitRemote('ssh://git@git.internal:2222/team/workspace.git')?.transport).toBe('ssh');
    expect(parseGitRemote('not a repository')).toBeNull();
  });

  it('parses the local status DTO and rejects a bad branch on a stored repo', () => {
    expect(collabStatusSchema.parse(localCollabStatus()).kind).toBe('local');
    expect(parseCollabStatus(localCollabStatus()).repos).toEqual([]);
    expect(collabRepoSchema.safeParse({
      id: 'repo-1',
      remoteUrl: 'https://github.com/acme/api.git',
      transport: 'https',
      branch: '--upload-pack=evil',
    }).success).toBe(false);
  });

  it('names changed items instead of file paths', () => {
    const base = { items: [{ id: 'req_1', name: 'Login request', kind: 'http', url: '/login' }] };
    const next = {
      items: [
        { id: 'req_1', name: 'Login request', kind: 'http', url: '/signin' },
        { id: 'req_2', name: 'Logout request', kind: 'http', url: '/logout' },
      ],
    };
    expect(collabChangeSummary('collections.json', base, next)).toEqual([
      { id: 'collections.json:req_1', file: 'collections.json', kind: 'request', label: 'Login request', detail: 'Updated' },
      { id: 'collections.json:req_2', file: 'collections.json', kind: 'request', label: 'Logout request', detail: 'Added' },
    ]);
    expect(collabChangeSummary('collections.json', base, base)).toEqual([]);
  });

  it('reports the child, not the folder that contains it', () => {
    const base = {
      items: [{ id: 'f1', name: 'Auth', kind: 'folder', children: [{ id: 'r1', name: 'Login', kind: 'http', url: '/a' }] }],
    };
    const next = {
      items: [{ id: 'f1', name: 'Auth', kind: 'folder', children: [{ id: 'r1', name: 'Login', kind: 'http', url: '/b' }] }],
    };
    expect(collabChangeSummary('collections.json', base, next).map((change) => change.label)).toEqual(['Login']);
  });

  it('maps a workspace file path to a change kind', () => {
    expect(collabChangeKindFromFile('workspaces/api/collections.json')).toBe('request');
    expect(collabChangeKindFromFile('workspaces/api/regressions.json')).toBe('regression');
    expect(collabChangeKindFromFile('testrix.json')).toBe('workspace');
  });

  it('writes human commit and activity lines', () => {
    expect(collabCommitMessage(['collections.json'])).toBe('Updated collections');
    expect(collabCommitMessage(['collections.json', 'flows.json'])).toBe('Updated collections and flows');
    expect(collabActivitySummary('Alex', 'Updated collections', 'Alex')).toBe('You updated collections');
    expect(collabActivitySummary('Alex', 'Updated collections', 'Sam')).toBe('Alex updated collections');
  });
});

describe('collab secrets overlay', () => {
  it('peels a secret variable and applies it back', () => {
    const withSecret = {
      ...createDefaultEnvironmentsFile(),
      items: [
        {
          id: 'env-shop',
          name: 'Shop',
          modifiedAt: '2026-01-01T00:00:00.000Z',
          variables: [
            {
              kind: 'variable' as const,
              id: 'var_secret',
              key: 'token',
              value: 's3cret',
              description: '',
              enabled: true,
              secret: true,
            },
          ],
        },
      ],
      activeId: 'env-shop',
      orderIds: ['env-shop'],
    };
    const peeled = peelWorkspaceSecrets({
      environments: withSecret,
      collections: DEFAULT_COLLECTIONS_FILE,
      databases: DEFAULT_DATABASES_FILE,
    });
    expect(peeled.secrets.environments['var_secret']).toBe('s3cret');
    expect(peeled.environments.items[0]?.variables[0]).toMatchObject({ value: '' });
    const applied = applyCollabSecrets({
      environments: peeled.environments,
      collections: peeled.collections,
      databases: peeled.databases,
      secrets: peeled.secrets,
    });
    expect(applied.environments.items[0]?.variables[0]).toMatchObject({ value: 's3cret', secret: true });
  });
});

describe('collab merge', () => {
  it('combines additions from both sides', () => {
    const base = { items: [{ id: 'a', name: 'A' }] };
    const ours = { items: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] };
    const theirs = { items: [{ id: 'a', name: 'A' }, { id: 'c', name: 'C' }] };
    const merged = mergeCollabDocument('collections.json', base, ours, theirs);
    expect(merged.conflicts).toEqual([]);
    expect(merged.value).toEqual({
      items: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
    });
  });

  it('asks for a review when the same item changes on both sides', () => {
    const base = { items: [{ id: 'a', name: 'A', url: 'https://one.test' }] };
    const ours = { items: [{ id: 'a', name: 'A', url: 'https://mine.test' }] };
    const theirs = { items: [{ id: 'a', name: 'Login', url: 'https://theirs.test' }] };
    const merged = mergeCollabDocument('collections.json', base, ours, theirs, { author: 'Alex' });
    expect(merged.conflicts).toHaveLength(1);
    expect(merged.conflicts[0]).toMatchObject({
      itemId: 'a',
      label: 'A',
      summary: 'URL changed',
      author: 'Alex',
    });
    const kept = applyCollabReviewChoice(merged.value, 'a', theirs.items[0]);
    expect(kept).toEqual({ items: [theirs.items[0]] });
  });
});
