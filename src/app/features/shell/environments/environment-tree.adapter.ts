import type { EnvironmentScopeNode, EnvironmentScopeVariable } from '@shared/config';

import type { EnvironmentTreeKind, EnvironmentTreeNode } from './environment-tree.types';

/** Maps persisted environment scope nodes to tx-tree nodes. */
export function toTreeNodes(fileNodes: readonly EnvironmentScopeNode[]): EnvironmentTreeNode[] {
  return fileNodes.map(toTreeNode);
}

function toTreeNode(node: EnvironmentScopeNode): EnvironmentTreeNode {
  if (node.kind === 'folder') {
    const description = node.description?.trim();
    return {
      id: node.id,
      label: node.label,
      subtitle: description || undefined,
      kind: 'folder',
      icon: 'folder',
      order: node.order,
      data: {
        kind: 'folder',
        description: node.description,
      },
      children: node.children.map(toTreeNode),
    };
  }

  return toVariableTreeNode(node);
}

function toVariableTreeNode(node: EnvironmentScopeVariable): EnvironmentTreeNode {
  const key = node.key.trim() || 'New variable';
  const description = node.description?.trim();
  return {
    id: node.id,
    label: key,
    subtitle: description || undefined,
    kind: 'leaf',
    icon: 'hash',
    order: node.order,
    data: {
      kind: 'variable',
      key: node.key,
      value: node.value,
      description: node.description,
      secret: node.secret,
      vaultRef: node.vaultRef,
    },
  };
}

/** Strips presentation fields before persisting to environments.json. */
export function fromTreeNodes(treeNodes: readonly EnvironmentTreeNode[]): EnvironmentScopeNode[] {
  return treeNodes.map(fromTreeNode);
}

function fromTreeNode(node: EnvironmentTreeNode): EnvironmentScopeNode {
  const kind = resolveKind(node);

  if (kind === 'folder') {
    return {
      id: node.id,
      kind: 'folder',
      label: node.label,
      order: node.order,
      ...(node.data?.description !== undefined ? { description: node.data.description } : {}),
      children: (node.children ?? []).map(fromTreeNode),
    };
  }

  return {
    id: node.id,
    kind: 'variable',
    key: node.data?.key ?? node.label,
    value: node.data?.value ?? '',
    order: node.order,
    ...(node.data?.description !== undefined ? { description: node.data.description } : {}),
    ...(node.data?.secret ? { secret: true } : {}),
    ...(node.data?.vaultRef ? { vaultRef: node.data.vaultRef } : {}),
  };
}

function resolveKind(node: EnvironmentTreeNode): EnvironmentTreeKind {
  if (node.data?.kind === 'folder' || node.data?.kind === 'variable') {
    return node.data.kind;
  }
  if (node.kind === 'folder') {
    return 'folder';
  }
  return 'variable';
}
