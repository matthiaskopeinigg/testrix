import {
  catalogForEnvironment,
  catalogFromEnvironmentKeys,
  DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
  type EnvironmentDefinition,
  type EnvironmentVariableKeyOptions,
} from '@shared/config';
import {
  DYNAMIC_VARIABLES,
  type DynamicVariableCatalogItem,
} from '@shared/dynamic-variables';

/**
 * Merges `$` builtins, environment `{{key}}` placeholders, collection folder keys, and script session keys.
 *
 * Folder keys win over session keys when the same name exists in both.
 */
export function buildCollectionVariableCatalog(
  environment: EnvironmentDefinition | null | undefined,
  keyOptions: EnvironmentVariableKeyOptions = DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
  sessionKeys: readonly string[] = [],
  folderKeys: readonly string[] = [],
): readonly DynamicVariableCatalogItem[] {
  const envCatalog = catalogForEnvironment(environment ?? null, keyOptions);
  const usedKeys = new Set(
    envCatalog.map((item) => item.insert.slice(2, -2).toLowerCase()),
  );
  const unused = (keys: readonly string[]): string[] =>
    keys.filter((key) => {
      const normalized = key.trim().toLowerCase();
      return normalized.length > 0 && !usedKeys.has(normalized);
    });

  const folderCatalog = catalogFromEnvironmentKeys(unused(folderKeys), 'Folder variable');
  for (const item of folderCatalog) {
    usedKeys.add(item.insert.slice(2, -2).toLowerCase());
  }
  const sessionCatalog = catalogFromEnvironmentKeys(
    unused(sessionKeys),
    'Session (from scripts)',
  );
  return [...DYNAMIC_VARIABLES, ...envCatalog, ...folderCatalog, ...sessionCatalog];
}

/** @deprecated Prefer {@link buildCollectionVariableCatalog}. */
export const buildRequestVariableCatalog = buildCollectionVariableCatalog;
