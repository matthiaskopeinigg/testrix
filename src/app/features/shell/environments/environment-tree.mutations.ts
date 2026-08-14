import type { EnvironmentTreeKind, EnvironmentTreeNode } from './environment-tree.types';

export interface EnvironmentNodeLocation {
  readonly node: EnvironmentTreeNode;
  readonly parent: EnvironmentTreeNode | null;
  readonly siblings: EnvironmentTreeNode[];
  readonly index: number;
}

/** Finds a node by id in the environment scope tree. */
export function findEnvironmentNode(
  nodes: readonly EnvironmentTreeNode[],
  id: string,
  parent: EnvironmentTreeNode | null = null,
): EnvironmentNodeLocation | null {
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.id === id) {
      return { node, parent, siblings: [...nodes], index };
    }
    if (node.children?.length) {
      const found = findEnvironmentNode(node.children, id, node);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `env-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nextSiblingOrder(siblings: readonly EnvironmentTreeNode[]): number {
  if (siblings.length === 0) {
    return 0;
  }
  return Math.max(...siblings.map((s) => s.order ?? 0)) + 10;
}

function cloneNodes(nodes: readonly EnvironmentTreeNode[]): EnvironmentTreeNode[] {
  return nodes.map((node) => ({
    ...node,
    data: node.data ? { ...node.data } : undefined,
    children: node.children ? cloneNodes(node.children) : undefined,
  }));
}

function resolveKind(node: EnvironmentTreeNode): EnvironmentTreeKind {
  return node.data?.kind ?? (node.kind === 'folder' ? 'folder' : 'variable');
}

function createFolderNode(order: number, label?: string): EnvironmentTreeNode {
  return {
    id: newId(),
    label: label ?? 'New folder',
    kind: 'folder',
    icon: 'folder',
    order,
    data: { kind: 'folder' },
    children: [],
  };
}

function createVariableNode(order: number, key?: string): EnvironmentTreeNode {
  const resolvedKey = key?.trim() || 'newVariable';
  return {
    id: newId(),
    label: resolvedKey,
    kind: 'leaf',
    icon: 'hash',
    order,
    data: {
      kind: 'variable',
      key: resolvedKey,
      value: '',
    },
  };
}

function insertIntoParent(
  nodes: EnvironmentTreeNode[],
  parentId: string | null,
  child: EnvironmentTreeNode,
): EnvironmentTreeNode[] {
  if (parentId === null) {
    return [...nodes, child];
  }

  return nodes.map((node) => {
    if (node.id === parentId) {
      const children = [...(node.children ?? []), child];
      return { ...node, children };
    }
    if (node.children?.length) {
      return { ...node, children: insertIntoParent([...node.children], parentId, child) };
    }
    return node;
  });
}

/** Creates a folder at scope root or inside another folder. */
export function createEnvironmentFolder(
  nodes: readonly EnvironmentTreeNode[],
  parentId: string | null = null,
  label?: string,
): { nodes: EnvironmentTreeNode[]; nodeId: string } | null {
  let siblings: EnvironmentTreeNode[];

  if (parentId === null) {
    siblings = [...nodes];
  } else {
    const parent = findEnvironmentNode(nodes, parentId);
    if (!parent || resolveKind(parent.node) !== 'folder') {
      return null;
    }
    siblings = [...(parent.node.children ?? [])];
  }

  const node = createFolderNode(nextSiblingOrder(siblings), label);
  return {
    nodes: insertIntoParent(cloneNodes(nodes), parentId, node),
    nodeId: node.id,
  };
}

/** Creates a variable at root (`parentId` null) or inside a folder. */
export function createEnvironmentVariable(
  nodes: readonly EnvironmentTreeNode[],
  parentId: string | null,
  key?: string,
): { nodes: EnvironmentTreeNode[]; nodeId: string } | null {
  let siblings: EnvironmentTreeNode[];

  if (parentId === null) {
    siblings = [...nodes];
  } else {
    const parent = findEnvironmentNode(nodes, parentId);
    if (!parent || resolveKind(parent.node) !== 'folder') {
      return null;
    }
    siblings = [...(parent.node.children ?? [])];
  }

  const node = createVariableNode(nextSiblingOrder(siblings), key);
  return {
    nodes: insertIntoParent(cloneNodes(nodes), parentId, node),
    nodeId: node.id,
  };
}

/** Renames a folder label or variable key. */
export function renameEnvironmentNode(
  nodes: readonly EnvironmentTreeNode[],
  id: string,
  labelOrKey: string,
): EnvironmentTreeNode[] | null {
  const trimmed = labelOrKey.trim();
  if (!trimmed) {
    return null;
  }

  let found = false;
  const mapNodes = (list: readonly EnvironmentTreeNode[]): EnvironmentTreeNode[] =>
    list.map((node) => {
      if (node.id === id) {
        found = true;
        const kind = resolveKind(node);
        if (kind === 'variable') {
          return {
            ...node,
            label: trimmed,
            data: { ...node.data!, kind: 'variable', key: trimmed },
          };
        }
        return { ...node, label: trimmed };
      }
      if (node.children?.length) {
        return { ...node, children: mapNodes(node.children) };
      }
      return node;
    });

  const next = mapNodes(nodes);
  return found ? next : null;
}

/** Updates variable fields by id. */
export function updateEnvironmentVariable(
  nodes: readonly EnvironmentTreeNode[],
  id: string,
  patch: { readonly key?: string; readonly value?: string; readonly description?: string },
): EnvironmentTreeNode[] | null {
  let found = false;

  const mapNodes = (list: readonly EnvironmentTreeNode[]): EnvironmentTreeNode[] =>
    list.map((node) => {
      if (node.id === id && resolveKind(node) === 'variable') {
        found = true;
        const key = patch.key !== undefined ? patch.key.trim() : (node.data?.key ?? node.label);
        if (!key) {
          return node;
        }
        return {
          ...node,
          label: key,
          data: {
            kind: 'variable',
            key,
            value: patch.value !== undefined ? patch.value : (node.data?.value ?? ''),
            description:
              patch.description !== undefined ? patch.description : node.data?.description,
          },
        };
      }
      if (node.children?.length) {
        return { ...node, children: mapNodes(node.children) };
      }
      return node;
    });

  const next = mapNodes(nodes);
  return found ? next : null;
}

/** Sets folder description (empty string clears). */
export function setEnvironmentFolderDescription(
  nodes: readonly EnvironmentTreeNode[],
  id: string,
  description: string,
): EnvironmentTreeNode[] | null {
  let found = false;

  const mapNodes = (list: readonly EnvironmentTreeNode[]): EnvironmentTreeNode[] =>
    list.map((node) => {
      if (node.id === id && resolveKind(node) === 'folder') {
        found = true;
        const trimmed = description.trim();
        return {
          ...node,
          data: {
            kind: 'folder',
            description: trimmed || undefined,
          },
        };
      }
      if (node.children?.length) {
        return { ...node, children: mapNodes(node.children) };
      }
      return node;
    });

  const next = mapNodes(nodes);
  return found ? next : null;
}

/** Deletes a node (folder removes its variables). */
export function deleteEnvironmentNode(
  nodes: readonly EnvironmentTreeNode[],
  id: string,
): EnvironmentTreeNode[] | null {
  let found = false;

  const filterNodes = (list: readonly EnvironmentTreeNode[]): EnvironmentTreeNode[] =>
    list
      .filter((node) => {
        if (node.id === id) {
          found = true;
          return false;
        }
        return true;
      })
      .map((node) =>
        node.children?.length ? { ...node, children: filterNodes(node.children) } : node,
      );

  const next = filterNodes(nodes);
  return found ? next : null;
}

/** Duplicates a variable with a new id adjacent to the source. */
export function duplicateEnvironmentVariable(
  nodes: readonly EnvironmentTreeNode[],
  id: string,
): { nodes: EnvironmentTreeNode[]; nodeId: string } | null {
  const loc = findEnvironmentNode(nodes, id);
  if (!loc || resolveKind(loc.node) !== 'variable') {
    return null;
  }

  const copy: EnvironmentTreeNode = {
    ...structuredClone(loc.node),
    id: newId(),
    label: `${loc.node.data?.key ?? loc.node.label}_copy`,
    order: nextSiblingOrder(loc.siblings),
    data: {
      kind: 'variable',
      key: `${loc.node.data?.key ?? loc.node.label}_copy`,
      value: loc.node.data?.value ?? '',
      description: loc.node.data?.description,
    },
  };

  const parentId = loc.parent?.id ?? null;
  const next = insertIntoParent(cloneNodes(nodes), parentId, copy);
  return { nodes: next, nodeId: copy.id };
}

/** Collects folder ids in a scope tree for session expand persistence. */
export function collectEnvironmentFolderIds(nodes: readonly EnvironmentTreeNode[]): string[] {
  const ids: string[] = [];

  const walk = (list: readonly EnvironmentTreeNode[]): void => {
    for (const node of list) {
      if (resolveKind(node) === 'folder') {
        ids.push(node.id);
        if (node.children?.length) {
          walk(node.children);
        }
      }
    }
  };

  walk(nodes);
  return ids;
}

/** Collects ids of the target node and all descendants (for scoped export). */
export function collectEnvironmentScopeNodeIdsInSubtree(
  nodes: readonly EnvironmentTreeNode[],
  rootId: string,
): readonly string[] {
  const loc = findEnvironmentNode(nodes, rootId);
  if (!loc) {
    return [rootId];
  }

  const ids: string[] = [];
  const walkNode = (node: EnvironmentTreeNode): void => {
    ids.push(node.id);
    for (const child of node.children ?? []) {
      walkNode(child);
    }
  };
  walkNode(loc.node);
  return ids;
}
