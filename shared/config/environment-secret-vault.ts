import type {
  EnvironmentDefinition,
  EnvironmentScopeNode,
  EnvironmentScopeVariable,
  EnvironmentsFile,
} from '../config/environments.schema';

export const VAULT_FILE_NAME = 'vault.bin';

export interface SecretVaultMap {
  readonly [vaultRef: string]: string;
}

function mapScopeNodes(
  nodes: readonly EnvironmentScopeNode[],
  mapVariable: (node: EnvironmentScopeVariable) => EnvironmentScopeVariable,
): EnvironmentScopeNode[] {
  return nodes.map((node) => {
    if (node.kind === 'folder') {
      return { ...node, children: mapScopeNodes(node.children, mapVariable) };
    }
    return mapVariable(node);
  });
}

function newVaultRef(variableId: string): string {
  return `env:${variableId}`;
}

/**
 * Moves secret variable values into a vault map and blanks them on the JSON file.
 */
export function extractEnvironmentSecrets(file: EnvironmentsFile): {
  readonly file: EnvironmentsFile;
  readonly secrets: SecretVaultMap;
} {
  const secrets: Record<string, string> = {};
  const environments: EnvironmentDefinition[] = file.environments.map((environment) => ({
    ...environment,
    nodes: mapScopeNodes(environment.nodes, (variable) => {
      if (!variable.secret) {
        return { ...variable, vaultRef: undefined };
      }
      const vaultRef = variable.vaultRef?.trim() || newVaultRef(variable.id);
      if (variable.value) {
        secrets[vaultRef] = variable.value;
      }
      return { ...variable, secret: true, vaultRef, value: '' };
    }),
  }));
  return {
    file: { ...file, environments },
    secrets,
  };
}

/**
 * Restores secret values from the local vault for runtime use.
 */
export function hydrateEnvironmentSecrets(
  file: EnvironmentsFile,
  secrets: SecretVaultMap,
): EnvironmentsFile {
  return {
    ...file,
    environments: file.environments.map((environment) => ({
      ...environment,
      nodes: mapScopeNodes(environment.nodes, (variable) => {
        if (!variable.secret) {
          return variable;
        }
        const vaultRef = variable.vaultRef?.trim();
        if (!vaultRef) {
          return variable;
        }
        const value = secrets[vaultRef];
        return value === undefined ? variable : { ...variable, value };
      }),
    })),
  };
}

/**
 * True when any secret variable still has an inline value (unsafe to Git-share).
 */
export function environmentsHaveInlineSecrets(file: EnvironmentsFile): boolean {
  const walk = (nodes: readonly EnvironmentScopeNode[]): boolean => {
    for (const node of nodes) {
      if (node.kind === 'folder' && walk(node.children)) {
        return true;
      }
      if (node.kind === 'variable' && node.secret && node.value.trim().length > 0) {
        return true;
      }
    }
    return false;
  };
  return file.environments.some((environment) => walk(environment.nodes));
}
