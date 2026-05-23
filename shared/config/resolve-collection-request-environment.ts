import type { AncestorFolderRef } from './collect-collection-ancestors';

/**
 * Resolves the environment profile for a collection request.
 *
 * - Non-empty `environmentId` — explicit environment on the request.
 * - Empty string — forced no environment (skip folder inheritance).
 * - `null` / `undefined` — inherit from the nearest ancestor folder (leaf → root).
 */
export function resolveCollectionRequestEnvironmentId(
  requestEnvironmentId: string | null | undefined,
  ancestorFolders: readonly Pick<AncestorFolderRef, 'settings'>[],
): string | null {
  if (requestEnvironmentId === '') {
    return null;
  }

  const requestId = requestEnvironmentId?.trim() || null;
  if (requestId) {
    return requestId;
  }

  for (let i = ancestorFolders.length - 1; i >= 0; i--) {
    const folderId = ancestorFolders[i].settings.environmentId?.trim() || null;
    if (folderId) {
      return folderId;
    }
  }

  return null;
}
