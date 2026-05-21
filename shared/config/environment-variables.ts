import type { EnvironmentDefinition, EnvironmentScopeNode } from './environments.schema';
import type { DynamicVariableCatalogItem } from '../dynamic-variables/dynamic-variables';

export interface EnvironmentVariableEntry {
  readonly key: string;
  readonly value: string;
}

/** Flattens all variables in an environment scope tree (folder order preserved). */
export function collectEnvironmentVariables(
  nodes: readonly EnvironmentScopeNode[],
): EnvironmentVariableEntry[] {
  const out: EnvironmentVariableEntry[] = [];

  const walk = (list: readonly EnvironmentScopeNode[]): void => {
    for (const node of list) {
      if (node.kind === 'variable') {
        const key = node.key.trim();
        if (key) {
          out.push({ key, value: node.value });
        }
        continue;
      }
      walk(node.children);
    }
  };

  walk(nodes);
  return out;
}

/** Autocomplete / highlight catalog entries for `{{name}}` environment placeholders. */
export function environmentVariablesToCatalog(
  variables: readonly EnvironmentVariableEntry[],
  environmentName?: string,
): DynamicVariableCatalogItem[] {
  const prefix = environmentName ? `${environmentName} · ` : 'Environment · ';
  return variables.map((entry) => ({
    id: `env:${entry.key}`,
    label: `{{${entry.key}}}`,
    insert: `{{${entry.key}}}`,
    detail: `${prefix}${entry.value || '(empty)'}`,
  }));
}

/** Variables from the active environment profile, if any. */
export function catalogForEnvironment(
  environment: EnvironmentDefinition | null | undefined,
): DynamicVariableCatalogItem[] {
  if (!environment) {
    return [];
  }
  return environmentVariablesToCatalog(
    collectEnvironmentVariables(environment.nodes),
    environment.name,
  );
}

/** Returns an environment profile by id, or null when missing. */
export function getEnvironmentDefinition(
  environments: readonly EnvironmentDefinition[],
  environmentId: string | null | undefined,
): EnvironmentDefinition | null {
  if (!environmentId) {
    return null;
  }
  return environments.find((e) => e.id === environmentId) ?? null;
}

/** Map of environment variable keys to values (first wins on duplicates). */
export function environmentVariablesToMap(
  variables: readonly EnvironmentVariableEntry[],
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of variables) {
    if (!(entry.key in result)) {
      result[entry.key] = entry.value;
    }
  }
  return result;
}

/**
 * Resolves a variable key (from `{{key}}`) to the scope node id in one environment profile.
 */
export function findEnvironmentVariableNodeId(
  environment: EnvironmentDefinition | null | undefined,
  key: string,
): string | null {
  const trimmed = key.trim();
  if (!environment || trimmed.length === 0) {
    return null;
  }

  const walk = (nodes: readonly EnvironmentScopeNode[]): string | null => {
    for (const node of nodes) {
      if (node.kind === 'variable' && node.key.trim() === trimmed) {
        return node.id;
      }
      if (node.kind === 'folder') {
        const nested = walk(node.children);
        if (nested) {
          return nested;
        }
      }
    }
    return null;
  };

  return walk(environment.nodes);
}

/** Merges `{{key}}` catalog entries from every environment profile (first wins per key). */
export function catalogForAllEnvironments(
  environments: readonly EnvironmentDefinition[],
): DynamicVariableCatalogItem[] {
  const byId = new Map<string, DynamicVariableCatalogItem>();
  for (const environment of environments) {
    for (const item of catalogForEnvironment(environment)) {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
      }
    }
  }
  return [...byId.values()];
}

/** Finds the first matching variable node across all environment profiles. */
export function findEnvironmentVariableNodeIdInProfiles(
  environments: readonly EnvironmentDefinition[],
  key: string,
): string | null {
  for (const environment of environments) {
    const nodeId = findEnvironmentVariableNodeId(environment, key);
    if (nodeId) {
      return nodeId;
    }
  }
  return null;
}
