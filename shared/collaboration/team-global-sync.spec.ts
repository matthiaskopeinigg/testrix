import { describe, expect, it } from 'vitest';

import {
  resolveDefaultTeamRepoDir,
  resolveTeamRepoFilePath,
  resolveTeamRepoRelativePath,
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

  it('resolves absolute mirrored file paths', () => {
    expect(resolveTeamRepoFilePath('C:/repo', 'profile-a', 'collections.json')).toBe(
      'C:/repo/profiles/profile-a/collections.json',
    );
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
