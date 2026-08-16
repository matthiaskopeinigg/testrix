/**
 * Candidate names for a repository's primary branch.
 * `master` is preferred when both exist so new feature branches match classic remotes.
 */
export const PRIMARY_GIT_BRANCH_CANDIDATES = ['master', 'main'] as const;

export interface FeatureBranchStartPointInput {
  readonly originHead: string | null;
  readonly remoteBranches: readonly string[];
  readonly localBranches: readonly string[];
}

/**
 * Resolves the Git start point for a new feature branch (repository-relative ref).
 *
 * Prefers the remote default (`origin/HEAD`), then `origin/master`, `origin/main`,
 * then the same names locally. Returns null when no primary branch exists yet.
 */
export function resolveFeatureBranchStartPoint(input: FeatureBranchStartPointInput): string | null {
  const remotes = new Set(input.remoteBranches);
  const locals = new Set(input.localBranches);
  const originHead = normalizeBranchName(input.originHead);

  const ordered: string[] = [];
  if (originHead && (PRIMARY_GIT_BRANCH_CANDIDATES as readonly string[]).includes(originHead)) {
    ordered.push(originHead);
  }
  for (const name of PRIMARY_GIT_BRANCH_CANDIDATES) {
    if (!ordered.includes(name)) {
      ordered.push(name);
    }
  }

  for (const name of ordered) {
    if (remotes.has(name)) {
      return `origin/${name}`;
    }
  }
  for (const name of ordered) {
    if (locals.has(name)) {
      return name;
    }
  }

  if (originHead && remotes.has(originHead)) {
    return `origin/${originHead}`;
  }
  if (originHead && locals.has(originHead)) {
    return originHead;
  }

  return null;
}

/**
 * Strips `origin/` from a remote branch name when present.
 */
export function normalizeBranchName(name: string | null | undefined): string | null {
  if (!name) {
    return null;
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.replace(/^origin\//, '');
}
