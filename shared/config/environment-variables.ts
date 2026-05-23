import type { EnvironmentDefinition, EnvironmentScopeNode } from './environments.schema';
import type { DynamicVariableCatalogItem } from '../dynamic-variables/dynamic-variables';

export interface EnvironmentVariableEntry {
  readonly key: string;
  readonly value: string;
}

/** Controls how environment variables are exposed in `{{key}}` placeholders. */
export interface EnvironmentVariableKeyOptions {
  readonly useFolderPathInKeys: boolean;
}

export const DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS: EnvironmentVariableKeyOptions = {
  useFolderPathInKeys: false,
};

/** Sanitizes a folder label for use in dotted placeholder keys (`[\w.-]+`). */
export function sanitizeEnvironmentFolderPathSegment(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) {
    return 'folder';
  }
  return trimmed.replace(/[^\w.-]+/g, '_');
}

function joinFolderPath(prefix: string, segment: string): string {
  return prefix ? `${prefix}.${segment}` : segment;
}

/** Flattens all variables in an environment scope tree (folder order preserved). */
export function collectEnvironmentVariables(
  nodes: readonly EnvironmentScopeNode[],
  options: EnvironmentVariableKeyOptions = DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
): EnvironmentVariableEntry[] {
  const out: EnvironmentVariableEntry[] = [];

  const walk = (list: readonly EnvironmentScopeNode[], folderPrefix: string): void => {
    for (const node of list) {
      if (node.kind === 'variable') {
        const leafKey = node.key.trim();
        if (!leafKey) {
          continue;
        }
        const key =
          options.useFolderPathInKeys && folderPrefix
            ? `${folderPrefix}.${leafKey}`
            : leafKey;
        out.push({ key, value: node.value });
        continue;
      }
      const segment = sanitizeEnvironmentFolderPathSegment(node.label);
      const nextPrefix = options.useFolderPathInKeys ? joinFolderPath(folderPrefix, segment) : '';
      walk(node.children, nextPrefix);
    }
  };

  walk(nodes, '');
  return out;
}

/** Autocomplete entries for additional `{{key}}` placeholders (e.g. script session cache). */
export function catalogFromEnvironmentKeys(
  keys: readonly string[],
  detail = 'Session',
): DynamicVariableCatalogItem[] {
  const seen = new Set<string>();
  const out: DynamicVariableCatalogItem[] = [];
  for (const raw of keys) {
    const key = raw.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      id: `session:${key}`,
      label: `{{${key}}}`,
      insert: `{{${key}}}`,
      detail,
    });
  }
  return out;
}

/** Autocomplete / highlight catalog entries for `{{name}}` environment placeholders. */
export function environmentVariablesToCatalog(
  variables: readonly EnvironmentVariableEntry[],
  environmentName?: string,
): DynamicVariableCatalogItem[] {
  const profileLabel = environmentName?.trim() || 'Environment';
  return variables.map((entry) => ({
    id: `env:${entry.key}`,
    label: `{{${entry.key}}}`,
    insert: `{{${entry.key}}}`,
    detail: profileLabel,
  }));
}

/** Variables from the active environment profile, if any. */
export function catalogForEnvironment(
  environment: EnvironmentDefinition | null | undefined,
  options: EnvironmentVariableKeyOptions = DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
): DynamicVariableCatalogItem[] {
  if (!environment) {
    return [];
  }
  return environmentVariablesToCatalog(
    collectEnvironmentVariables(environment.nodes, options),
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

function findVariableByLeafKey(nodes: readonly EnvironmentScopeNode[], leafKey: string): string | null {
  for (const node of nodes) {
    if (node.kind === 'variable' && node.key.trim() === leafKey) {
      return node.id;
    }
    if (node.kind === 'folder') {
      const nested = findVariableByLeafKey(node.children, leafKey);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function folderChildByLabel(
  nodes: readonly EnvironmentScopeNode[],
  label: string,
): EnvironmentScopeNode | null {
  const target = sanitizeEnvironmentFolderPathSegment(label);
  for (const node of nodes) {
    if (node.kind === 'folder' && sanitizeEnvironmentFolderPathSegment(node.label) === target) {
      return node;
    }
  }
  return null;
}

function findVariableByFolderPath(
  nodes: readonly EnvironmentScopeNode[],
  folderSegments: readonly string[],
  leafKey: string,
): string | null {
  if (folderSegments.length === 0) {
    return findVariableByLeafKey(nodes, leafKey);
  }

  const [head, ...rest] = folderSegments;
  const folder = folderChildByLabel(nodes, head ?? '');
  if (!folder || folder.kind !== 'folder') {
    return null;
  }
  return findVariableByFolderPath(folder.children, rest, leafKey);
}

/**
 * Resolves a variable key (from `{{key}}`) to the scope node id in one environment profile.
 */
export function findEnvironmentVariableNodeId(
  environment: EnvironmentDefinition | null | undefined,
  key: string,
  options: EnvironmentVariableKeyOptions = DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
): string | null {
  const trimmed = key.trim();
  if (!environment || trimmed.length === 0) {
    return null;
  }

  if (options.useFolderPathInKeys && trimmed.includes('.')) {
    const segments = trimmed.split('.');
    const leafKey = segments[segments.length - 1]?.trim() ?? '';
    const folderSegments = segments.slice(0, -1).map((s) => s.trim()).filter(Boolean);
    if (leafKey) {
      const byPath = findVariableByFolderPath(environment.nodes, folderSegments, leafKey);
      if (byPath) {
        return byPath;
      }
    }
  }

  return findVariableByLeafKey(environment.nodes, trimmed);
}

/** Merges `{{key}}` catalog entries from every environment profile (first wins per key). */
export function catalogForAllEnvironments(
  environments: readonly EnvironmentDefinition[],
  options: EnvironmentVariableKeyOptions = DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
): DynamicVariableCatalogItem[] {
  const byId = new Map<string, DynamicVariableCatalogItem>();
  for (const environment of environments) {
    for (const item of catalogForEnvironment(environment, options)) {
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
  options: EnvironmentVariableKeyOptions = DEFAULT_ENVIRONMENT_VARIABLE_KEY_OPTIONS,
): string | null {
  for (const environment of environments) {
    const nodeId = findEnvironmentVariableNodeId(environment, key, options);
    if (nodeId) {
      return nodeId;
    }
  }
  return null;
}
