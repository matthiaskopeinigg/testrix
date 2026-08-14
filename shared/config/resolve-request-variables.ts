import type { EnvironmentDefinition } from './environments.schema';
import {
  collectEnvironmentVariables,
  DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
  environmentVariablesToMap,
  type EnvironmentVariableKeyOptions,
} from './environment-variables';
import type { AncestorFolderRef } from './collect-collection-ancestors';
import { resolveTemplateVariables } from '../dynamic-variables/template-variables';
import { resolveDynamicVariables } from '../dynamic-variables/dynamic-variables';

const VARIABLE_MAP_MAX_PASSES = 8;

/**
 * Resolves `{{key}}` and `$` placeholders in a variable map (supports chained references).
 */
export function resolveVariableMapValues(
  raw: Readonly<Record<string, string>>,
  maxPasses = VARIABLE_MAP_MAX_PASSES,
): Readonly<Record<string, string>> {
  let current: Record<string, string> = { ...raw };

  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    const next: Record<string, string> = {};

    for (const [key, value] of Object.entries(current)) {
      const resolved = resolveDynamicVariables(
        resolveTemplateVariables(value, { environment: current }),
      );
      next[key] = resolved;
      if (resolved !== current[key]) {
        changed = true;
      }
    }

    current = next;
    if (!changed) {
      break;
    }
  }

  return current;
}

/**
 * Builds variable map for template resolution: environment, then folder chain (deeper wins),
 * then optional script/run shared variables (highest priority). Values are fully resolved for send.
 */
export function resolveRequestVariables(
  ancestorFolders: readonly AncestorFolderRef[],
  environment: EnvironmentDefinition | null | undefined,
  sharedVariables: Readonly<Record<string, string>> = {},
  environmentKeyOptions: EnvironmentVariableKeyOptions = DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};

  if (environment) {
    for (const [key, value] of Object.entries(
      environmentVariablesToMap(
        collectEnvironmentVariables(environment.nodes, environmentKeyOptions),
      ),
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

  for (const [key, value] of Object.entries(sharedVariables)) {
    if (key.trim()) {
      out[key] = value;
    }
  }

  return resolveVariableMapValues(out);
}
