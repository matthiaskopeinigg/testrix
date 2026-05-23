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

/** Merges built-in `$` variables, environment `{{key}}` placeholders, and script session keys. */
export function buildCollectionVariableCatalog(
  environment: EnvironmentDefinition | null | undefined,
  keyOptions: EnvironmentVariableKeyOptions = DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
  sessionKeys: readonly string[] = [],
): readonly DynamicVariableCatalogItem[] {
  const envCatalog = catalogForEnvironment(environment ?? null, keyOptions);
  const envKeySet = new Set(
    envCatalog.map((item) => item.insert.slice(2, -2).toLowerCase()),
  );
  const sessionCatalog = catalogFromEnvironmentKeys(
    sessionKeys.filter((key) => !envKeySet.has(key.trim().toLowerCase())),
    'Session (from scripts)',
  );
  const merged = [...DYNAMIC_VARIABLES, ...envCatalog, ...sessionCatalog];
  return merged;
}

/** @deprecated Prefer {@link buildCollectionVariableCatalog}. */
export const buildRequestVariableCatalog = buildCollectionVariableCatalog;
