import type { EnvironmentDefinition } from '@shared/config';

import { toTreeNodes } from './environment-tree.adapter';
import { findEnvironmentNode } from './environment-tree.mutations';
import type { EnvironmentTreeKind, EnvironmentTreeNode } from './environment-tree.types';

/** Sidebar row for a named environment. */
export interface EnvironmentListItem {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

function resolveKind(node: EnvironmentTreeNode): EnvironmentTreeKind {
  if (node.data?.kind === 'folder' || node.data?.kind === 'variable') {
    return node.data.kind;
  }
  return node.kind === 'folder' ? 'folder' : 'variable';
}

/** Lists environments for the sidebar. */
export function listEnvironmentDefinitions(
  environments: readonly EnvironmentDefinition[],
): EnvironmentListItem[] {
  return environments.map((environment) => ({
    id: environment.id,
    name: environment.name,
    description: environment.description,
  }));
}

/** Returns an environment definition by id. */
export function getEnvironmentDefinition(
  environments: readonly EnvironmentDefinition[],
  environmentId: string,
): EnvironmentDefinition | null {
  return environments.find((environment) => environment.id === environmentId) ?? null;
}

/** Scope tree nodes for an environment tab. */
export function getEnvironmentScopeNodes(
  environments: readonly EnvironmentDefinition[],
  environmentId: string,
): readonly EnvironmentTreeNode[] {
  const environment = getEnvironmentDefinition(environments, environmentId);
  return environment ? toTreeNodes(environment.nodes) : [];
}

/** Finds which environment contains a scope node id. */
export function findEnvironmentIdForScopeNode(
  environments: readonly EnvironmentDefinition[],
  nodeId: string,
): string | null {
  return findScopeNodeLocation(environments, nodeId)?.environmentId ?? null;
}

/** Locates a scope node within any environment. */
export function findScopeNodeLocation(
  environments: readonly EnvironmentDefinition[],
  nodeId: string,
): { readonly environmentId: string; readonly node: EnvironmentTreeNode } | null {
  for (const environment of environments) {
    const scope = toTreeNodes(environment.nodes);
    const loc = findEnvironmentNode(scope, nodeId);
    if (loc) {
      return { environmentId: environment.id, node: loc.node };
    }
  }
  return null;
}

/** @deprecated Use {@link listEnvironmentDefinitions}. */
export function listEnvironmentProfiles(environments: readonly EnvironmentDefinition[]): EnvironmentListItem[] {
  return listEnvironmentDefinitions(environments);
}

/** @deprecated Use {@link getEnvironmentDefinition}. */
export function getEnvironmentProfile(
  environments: readonly EnvironmentDefinition[],
  environmentId: string,
): EnvironmentListItem | null {
  const environment = getEnvironmentDefinition(environments, environmentId);
  if (!environment) {
    return null;
  }
  return { id: environment.id, name: environment.name, description: environment.description };
}

/** @deprecated Use {@link findEnvironmentIdForScopeNode}. */
export function findEnvironmentProfileIdForNode(
  environments: readonly EnvironmentDefinition[],
  nodeId: string,
): string | null {
  return findEnvironmentIdForScopeNode(environments, nodeId);
}
