import {
  findEnvironmentLocation,
  insertEnvironmentNodeAt,
  isEnvironmentDescendant,
  isEnvironmentFolder,
  newEntityId,
  type EnvironmentNode,
} from '@testrix/contracts';

/**
 * Selected variables and folders, skipping a node whose ancestor is also selected.
 * The copies keep their ids; paste assigns new ones.
 */
export function copyEnvironmentSelection(
  nodes: readonly EnvironmentNode[],
  selectedIds: readonly string[],
): EnvironmentNode[] {
  const unique = [...new Set(selectedIds)];
  const top = unique.filter(
    (id) => !unique.some((other) => other !== id && isEnvironmentDescendant(nodes, other, id)),
  );
  const copied: EnvironmentNode[] = [];
  for (const id of top) {
    const found = findEnvironmentLocation(nodes, id);
    if (found)
      copied.push(structuredClone(found.node));
  }
  return copied;
}

/** Inserts clones at the end of `parentId` (null = root) and expands that folder. */
export function pasteEnvironmentNodes(
  nodes: readonly EnvironmentNode[],
  incoming: readonly EnvironmentNode[],
  parentId: string | null,
): { readonly nodes: EnvironmentNode[]; readonly ids: readonly string[] } {
  if (incoming.length === 0)
    return { nodes: [...nodes], ids: [] };
  const clones = incoming.map((node) => cloneEnvironmentNode(node));
  let next: readonly EnvironmentNode[] = nodes;
  for (const clone of clones) {
    const located = parentId ? findEnvironmentLocation(next, parentId) : null;
    const folder = located && isEnvironmentFolder(located.node) ? located.node : null;
    const index = folder ? folder.children.length : next.length;
    next = insertEnvironmentNodeAt(next, folder ? parentId : null, index, clone);
  }
  return { nodes: [...next], ids: clones.map((node) => node.id) };
}

function cloneEnvironmentNode(node: EnvironmentNode): EnvironmentNode {
  const id = newEntityId();
  if (isEnvironmentFolder(node))
    return { ...node, id, children: node.children.map((child) => cloneEnvironmentNode(child)) };
  return { ...node, id };
}
