import { catalogForEnvironment, type EnvironmentDefinition } from '@shared/config';
import {
  DYNAMIC_VARIABLES,
  type DynamicVariableCatalogItem,
} from '@shared/dynamic-variables';

/** Merges built-in `$` variables with the active environment's `{{key}}` placeholders. */
export function buildRequestVariableCatalog(
  environment: EnvironmentDefinition | null | undefined,
): readonly DynamicVariableCatalogItem[] {
  const envCatalog = catalogForEnvironment(environment ?? null);
  return envCatalog.length > 0 ? [...DYNAMIC_VARIABLES, ...envCatalog] : [...DYNAMIC_VARIABLES];
}
