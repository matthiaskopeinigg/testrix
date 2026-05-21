import type { EnvironmentDefinition, EnvironmentScopeNode } from '@shared/config';

function newScopeNodeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `env-node-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Deep-clones scope nodes with fresh ids (folders and variables). */
export function cloneEnvironmentScopeNodes(nodes: readonly EnvironmentScopeNode[]): EnvironmentScopeNode[] {
  return nodes.map(cloneEnvironmentScopeNode);
}

function cloneEnvironmentScopeNode(node: EnvironmentScopeNode): EnvironmentScopeNode {
  if (node.kind === 'variable') {
    return {
      ...node,
      id: newScopeNodeId(),
    };
  }

  return {
    ...node,
    id: newScopeNodeId(),
    children: node.children.map(cloneEnvironmentScopeNode),
  };
}

/** Picks a unique environment name for a clone of `sourceName`. */
export function resolveClonedEnvironmentName(
  sourceName: string,
  existingNames: readonly string[],
): string {
  const taken = new Set(existingNames);
  const primary = `${sourceName} (copy)`;
  if (!taken.has(primary)) {
    return primary;
  }

  for (let index = 2; index < 100; index++) {
    const candidate = `${sourceName} (copy ${index})`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }

  return `${sourceName} (copy ${Date.now()})`;
}

/** Builds a new environment definition cloned from `source`. */
export function cloneEnvironmentDefinition(
  source: EnvironmentDefinition,
  existingNames: readonly string[],
  newEnvironmentId: string,
  order: number,
): EnvironmentDefinition {
  return {
    id: newEnvironmentId,
    name: resolveClonedEnvironmentName(source.name, existingNames),
    description: source.description,
    order,
    nodes: cloneEnvironmentScopeNodes(source.nodes),
  };
}
