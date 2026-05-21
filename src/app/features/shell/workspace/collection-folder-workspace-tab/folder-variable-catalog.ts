import { catalogForAllEnvironments, type EnvironmentDefinition } from '@shared/config';
import {
  DYNAMIC_VARIABLES,
  type DynamicVariableCatalogItem,
} from '@shared/dynamic-variables';

/** Merges built-in `$` variables with `{{key}}` placeholders from all environment profiles. */
export function buildFolderVariableCatalog(
  environments: readonly EnvironmentDefinition[],
): readonly DynamicVariableCatalogItem[] {
  const envCatalog = catalogForAllEnvironments(environments);
  return envCatalog.length > 0 ? [...DYNAMIC_VARIABLES, ...envCatalog] : [...DYNAMIC_VARIABLES];
}
