import type { EnvironmentDefinition } from './environments.schema';
import {
  collectEnvironmentVariables,
  environmentVariablesToMap,
} from './environment-variables';
import type { AncestorFolderRef } from './collect-collection-ancestors';

/**
 * Builds variable map for template resolution: environment, then folder chain (deeper wins),
 * then optional script/run shared variables.
 */
export function resolveRequestVariables(
  ancestorFolders: readonly AncestorFolderRef[],
  environment: EnvironmentDefinition | null | undefined,
  sharedVariables: Readonly<Record<string, string>> = {},
): Readonly<Record<string, string>> {
  const out: Record<string, string> = { ...sharedVariables };

  if (environment) {
    for (const [key, value] of Object.entries(
      environmentVariablesToMap(collectEnvironmentVariables(environment.nodes)),
    )) {
      out[key] = value;
    }
  }

  for (const folder of ancestorFolders) {
    for (const row of folder.settings.variables) {
      const key = row.key.trim();
      if (key) {
        out[key] = row.value;
      }
    }
  }

  return out;
}
