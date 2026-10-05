import type { CollectionNode } from '@testrix/contracts';

export type LtTargetTreeRow =
  | {
      readonly kind: 'folder';
      readonly id: string;
      readonly name: string;
      readonly depth: number;
    }
  | {
      readonly kind: 'http';
      readonly id: string;
      readonly name: string;
      readonly method: string;
      readonly depth: number;
    };

export function filterCollectionHttpTree(
  nodes: readonly CollectionNode[],
  query: string,
): CollectionNode[] {
  const needle = query.trim().toLowerCase();
  const out: CollectionNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'http') {
      if (!needle || node.name.toLowerCase().includes(needle) || node.method.toLowerCase().includes(needle))
        out.push(node);
      continue;
    }
    if (node.kind === 'websocket')
      continue;
    const children = filterCollectionHttpTree(node.children, needle);
    if (children.length > 0 || (!needle ? false : node.name.toLowerCase().includes(needle)))
      out.push({ ...node, children });
    else if (!needle)
      out.push({ ...node, children });
  }
  return out;
}

export function collectFolderIds(nodes: readonly CollectionNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.kind !== 'folder')
      continue;
    ids.push(node.id);
    ids.push(...collectFolderIds(node.children));
  }
  return ids;
}

export function buildTargetTreeRows(params: {
  readonly nodes: readonly CollectionNode[];
  readonly expandedIds: ReadonlySet<string>;
  readonly depth?: number;
}): readonly LtTargetTreeRow[] {
  const depth = params.depth ?? 0;
  const out: LtTargetTreeRow[] = [];
  for (const node of params.nodes) {
    if (node.kind === 'websocket')
      continue;
    if (node.kind === 'folder') {
      out.push({ kind: 'folder', id: node.id, name: node.name, depth });
      if (params.expandedIds.has(node.id))
        out.push(...buildTargetTreeRows({ nodes: node.children, expandedIds: params.expandedIds, depth: depth + 1 }));
      continue;
    }
    out.push({ kind: 'http', id: node.id, name: node.name, method: node.method, depth });
  }
  return out;
}

export function findHttpRequest(
  nodes: readonly CollectionNode[],
  id: string,
): Extract<CollectionNode, { kind: 'http' }> | null {
  for (const node of nodes) {
    if (node.kind === 'http' && node.id === id)
      return node;
    if (node.kind === 'folder') {
      const found = findHttpRequest(node.children, id);
      if (found)
        return found;
    }
  }
  return null;
}
