import type { TestSuiteAncestorFolderRef } from './collect-test-suite-ancestor-folders';

/**
 * Resolves the environment profile for a test suite flow.
 *
 * - Non-empty `environmentId` — explicit environment on the flow.
 * - Empty string — forced no environment (skip folder inheritance).
 * - `null` / `undefined` — inherit from the nearest ancestor folder (leaf → root).
 */
export function resolveTestSuiteFlowEnvironmentId(
  flowEnvironmentId: string | null | undefined,
  ancestorFolders: readonly Pick<TestSuiteAncestorFolderRef, 'environmentId'>[],
): string | null {
  if (flowEnvironmentId === '') {
    return null;
  }

  const flowId = flowEnvironmentId?.trim() || null;
  if (flowId) {
    return flowId;
  }

  for (let i = ancestorFolders.length - 1; i >= 0; i--) {
    const folderId = ancestorFolders[i].environmentId?.trim() || null;
    if (folderId) {
      return folderId;
    }
  }

  return null;
}
