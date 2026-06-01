import { describe, expect, it } from 'vitest';

import {
  formatRepoDataDirLabel,
  resolveDefaultTeamRepoDir,
  resolveTeamProfilesManifestRelativePath,
  resolveTeamRepoFilePath,
  resolveTeamRepoRelativePath,
  tryNormalizeRepoDataDir,
} from './team-repo-paths';
import { summarizeShareScope } from './team-profile-sync.helpers';
import { createDefaultTeamShareScope } from './team-workspace.schema';

describe('team-repo-paths', () => {
  it('resolves default team repo under shared config', () => {
    expect(resolveDefaultTeamRepoDir('C:/Testrix/config')).toBe('C:/Testrix/config/team-workspace');
  });

  it('resolves git-relative profile file paths', () => {
    expect(resolveTeamRepoRelativePath('profile-a', 'collections.json')).toBe(
      'profiles/profile-a/collections.json',
    );
  });

  it('resolves git-relative profile file paths for custom repo data dir', () => {
    expect(resolveTeamRepoRelativePath('profile-a', 'collections.json', 'data/team')).toBe(
      'data/team/profile-a/collections.json',
    );
  });

  it('resolves absolute mirrored file paths', () => {
    expect(resolveTeamRepoFilePath('C:/repo', 'profile-a', 'collections.json')).toBe(
      'C:/repo/profiles/profile-a/collections.json',
    );
  });

  it('resolves manifest path relative to repo data dir', () => {
    expect(resolveTeamProfilesManifestRelativePath('data/team')).toBe('data/team/team-profiles.json');
  });

  it('formats repository root label', () => {
    expect(formatRepoDataDirLabel('')).toBe('(repository root)');
    expect(formatRepoDataDirLabel('profiles')).toBe('profiles');
  });

  it('validates new repository folder input', () => {
    expect(tryNormalizeRepoDataDir('data/team')).toEqual({ ok: true, value: 'data/team' });
    expect(tryNormalizeRepoDataDir('../escape')).toEqual({
      ok: false,
      error: 'Use letters, numbers, slashes, and hyphens only (no ..)',
    });
  });
});

describe('summarizeShareScope', () => {
  it('describes collections-only scope', () => {
    const scope = { ...createDefaultTeamShareScope(), collections: true, environments: false };
    for (const key of Object.keys(scope) as (keyof typeof scope)[]) {
      if (key !== 'collections') {
        scope[key] = false;
      }
    }
    expect(summarizeShareScope(scope)).toBe('collections.json only');
  });

  it('describes full default workspace scope', () => {
    expect(summarizeShareScope(createDefaultTeamShareScope())).toBe('All shared workspace files');
  });
});
