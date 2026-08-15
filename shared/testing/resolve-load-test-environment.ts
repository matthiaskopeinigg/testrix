import type { LoadTestTargetSource } from './load-test-target.schema';

/**
 * Resolves the environment profile a load test should send with.
 *
 * - Non-empty `environmentId` — explicit override.
 * - Empty string — forced no environment.
 * - `null` / `undefined` — inherit from the collection request, or none for a manual target.
 */
export function resolveLoadTestEffectiveEnvironmentId(
  loadTestEnvironmentId: string | null | undefined,
  inheritedCollectionEnvironmentId: string | null,
): string | null {
  if (loadTestEnvironmentId === '') {
    return null;
  }

  const explicit = loadTestEnvironmentId?.trim() || null;
  if (explicit) {
    return explicit;
  }

  return inheritedCollectionEnvironmentId;
}

/**
 * Returns a start-options override for {@link buildOutgoingRequest}.
 * `undefined` means do not override (inherit). Empty string forces none.
 */
export function loadTestEnvironmentIdOverride(
  loadTestEnvironmentId: string | null | undefined,
): string | undefined {
  if (loadTestEnvironmentId === undefined || loadTestEnvironmentId === null) {
    return undefined;
  }
  return loadTestEnvironmentId;
}

/**
 * Environment id applied to a manual load-test target (inherit means none).
 */
export function loadTestManualEnvironmentId(
  loadTestEnvironmentId: string | null | undefined,
): string | null {
  if (loadTestEnvironmentId === '' || loadTestEnvironmentId == null) {
    return null;
  }
  return loadTestEnvironmentId.trim() || null;
}

/**
 * Human-readable environment label for overview and run records.
 */
export function loadTestEnvironmentSummary(params: {
  readonly environmentId: string | null | undefined;
  readonly targetSource: LoadTestTargetSource;
  readonly environmentName?: string | null;
}): string {
  if (params.environmentId === '') {
    return 'No environment';
  }
  const explicit = params.environmentId?.trim() || null;
  if (explicit) {
    return params.environmentName?.trim() || explicit;
  }
  return params.targetSource === 'manual' ? 'No environment' : 'Inherit from request';
}
