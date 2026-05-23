/**
 * Dropdown sentinel when a collection entity inherits its environment from ancestor folders.
 * Not persisted in collections.json — stored as `null`.
 */
export const COLLECTION_ENVIRONMENT_INHERIT = '__inherit__' as const;

/**
 * Dropdown sentinel when no environment profile is used.
 * Persisted as an empty string on `settings.environmentId`.
 */
export const COLLECTION_ENVIRONMENT_NONE = '__none__' as const;

export interface CollectionEnvironmentDropdownOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Maps persisted `environmentId` to a dropdown value.
 */
export function toEnvironmentDropdownValue(environmentId: string | null | undefined): string {
  if (environmentId === null || environmentId === undefined) {
    return COLLECTION_ENVIRONMENT_INHERIT;
  }
  if (environmentId.trim() === '') {
    return COLLECTION_ENVIRONMENT_NONE;
  }
  return environmentId.trim();
}

/**
 * Maps a dropdown selection to persisted `environmentId`.
 */
export function environmentIdFromDropdownValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === COLLECTION_ENVIRONMENT_INHERIT) {
    return null;
  }
  if (trimmed === COLLECTION_ENVIRONMENT_NONE) {
    return '';
  }
  return trimmed;
}

/**
 * Builds environment dropdown options for collection requests (and similar entities).
 */
export function buildCollectionEnvironmentDropdownOptions(
  environments: readonly { readonly id: string; readonly name: string }[],
  options?: { readonly includeInherit?: boolean },
): readonly CollectionEnvironmentDropdownOption[] {
  const out: CollectionEnvironmentDropdownOption[] = [];
  if (options?.includeInherit !== false) {
    out.push({ value: COLLECTION_ENVIRONMENT_INHERIT, label: 'Inherit from folder' });
  }
  out.push({ value: COLLECTION_ENVIRONMENT_NONE, label: 'No environment' });
  for (const environment of environments) {
    out.push({ value: environment.id, label: environment.name });
  }
  return out;
}
