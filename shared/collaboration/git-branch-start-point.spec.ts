import { describe, expect, it } from 'vitest';

import { normalizeBranchName, resolveFeatureBranchStartPoint } from './git-branch-start-point';

describe('resolveFeatureBranchStartPoint', () => {
  it('prefers origin/master over origin/main', () => {
    expect(
      resolveFeatureBranchStartPoint({
        originHead: null,
        remoteBranches: ['main', 'master', 'develop'],
        localBranches: ['main'],
      }),
    ).toBe('origin/master');
  });

  it('uses origin/HEAD when it is master or main', () => {
    expect(
      resolveFeatureBranchStartPoint({
        originHead: 'origin/main',
        remoteBranches: ['main', 'master'],
        localBranches: [],
      }),
    ).toBe('origin/main');
  });

  it('falls back to origin/main when master is absent', () => {
    expect(
      resolveFeatureBranchStartPoint({
        originHead: null,
        remoteBranches: ['main'],
        localBranches: ['main'],
      }),
    ).toBe('origin/main');
  });

  it('uses local master when the remote has no primary branch yet', () => {
    expect(
      resolveFeatureBranchStartPoint({
        originHead: null,
        remoteBranches: [],
        localBranches: ['master', 'feature/old'],
      }),
    ).toBe('master');
  });

  it('returns null when no primary branch exists', () => {
    expect(
      resolveFeatureBranchStartPoint({
        originHead: null,
        remoteBranches: ['feature/old'],
        localBranches: ['feature/old'],
      }),
    ).toBeNull();
  });
});

describe('normalizeBranchName', () => {
  it('strips origin prefix', () => {
    expect(normalizeBranchName('origin/master')).toBe('master');
    expect(normalizeBranchName('master')).toBe('master');
  });
});
