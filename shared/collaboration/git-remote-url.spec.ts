import { describe, expect, it } from 'vitest';

import { isHttpsGitRemoteUrl, isSshGitRemoteUrl } from './git-remote-url';

describe('git-remote-url', () => {
  it('detects SSH remotes', () => {
    expect(isSshGitRemoteUrl('git@github.com:org/repo.git')).toBe(true);
    expect(isSshGitRemoteUrl('ssh://git@github.com/org/repo.git')).toBe(true);
    expect(isSshGitRemoteUrl('https://github.com/org/repo.git')).toBe(false);
  });

  it('detects HTTPS remotes', () => {
    expect(isHttpsGitRemoteUrl('https://github.com/org/repo.git')).toBe(true);
    expect(isHttpsGitRemoteUrl('git@github.com:org/repo.git')).toBe(false);
  });
});
