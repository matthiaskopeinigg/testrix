import { z } from 'zod';

import { newEntityId } from './entity-id';

export const serviceTreeKindSchema = z.enum(['folder', 'artifact']);

export type ServiceTreeKind = z.infer<typeof serviceTreeKindSchema>;

export interface ServiceFolderNode<T> {
  readonly kind: 'folder';
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
  readonly children: readonly ServiceTreeNode<T>[];
}

export type ServiceArtifactNode<T> = {
  readonly kind: 'artifact';
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
} & T;

export type ServiceTreeNode<T> = ServiceFolderNode<T> | ServiceArtifactNode<T>;

export function newServiceNodeId(): string {
  return newEntityId();
}

export function emptyServiceFolder<T>(name = 'New folder'): ServiceFolderNode<T> {
  return {
    kind: 'folder',
    id: newServiceNodeId(),
    name,
    updatedAt: new Date().toISOString(),
    children: [],
  };
}

export function flattenServiceTree<T>(nodes: readonly ServiceTreeNode<T>[]): ServiceTreeNode<T>[] {
  const out: ServiceTreeNode<T>[] = [];
  const walk = (list: readonly ServiceTreeNode<T>[]): void => {
    for (const node of list) {
      out.push(node);
      if (node.kind === 'folder')
        walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export function collectServiceArtifactIds<T>(nodes: readonly ServiceTreeNode<T>[]): string[] {
  return flattenServiceTree(nodes)
    .filter((node) => node.kind === 'artifact')
    .map((node) => node.id);
}

export function findServiceNode<T>(
  nodes: readonly ServiceTreeNode<T>[],
  id: string,
): ServiceTreeNode<T> | null {
  for (const node of nodes) {
    if (node.id === id)
      return node;
    if (node.kind === 'folder') {
      const found = findServiceNode(node.children, id);
      if (found)
        return found;
    }
  }
  return null;
}

export function mapServiceTree<T>(
  nodes: readonly ServiceTreeNode<T>[],
  mapper: (node: ServiceTreeNode<T>) => ServiceTreeNode<T>,
): ServiceTreeNode<T>[] {
  return nodes.map((node) => {
    const next = mapper(node);
    if (next.kind !== 'folder')
      return next;
    return { ...next, children: mapServiceTree(next.children, mapper) };
  });
}

export function insertServiceChild<T>(
  nodes: readonly ServiceTreeNode<T>[],
  parentId: string | null,
  child: ServiceTreeNode<T>,
): ServiceTreeNode<T>[] {
  if (!parentId)
    return [...nodes, child];
  return mapServiceTree(nodes, (node) => {
    if (node.kind !== 'folder' || node.id !== parentId)
      return node;
    return { ...node, children: [...node.children, child], updatedAt: child.updatedAt };
  });
}

export function removeServiceNode<T>(
  nodes: readonly ServiceTreeNode<T>[],
  id: string,
): ServiceTreeNode<T>[] {
  return extractServiceNode(nodes, id).tree;
}

/** Pulls a node out of the tree and returns both the node and the remainder. */
export function extractServiceNode<T>(
  nodes: readonly ServiceTreeNode<T>[],
  id: string,
): { readonly tree: ServiceTreeNode<T>[]; readonly node: ServiceTreeNode<T> | null } {
  const next: ServiceTreeNode<T>[] = [];
  let extracted: ServiceTreeNode<T> | null = null;
  for (const node of nodes) {
    if (node.id === id) {
      extracted = node;
      continue;
    }
    if (node.kind === 'folder') {
      const child = extractServiceNode(node.children, id);
      if (child.node)
        extracted = child.node;
      next.push({ ...node, children: child.tree });
      continue;
    }
    next.push(node);
  }
  return { tree: next, node: extracted };
}

/** Inserts a node under `parentId` (null = root) at `index`. */
export function insertServiceChildAt<T>(
  nodes: readonly ServiceTreeNode<T>[],
  parentId: string | null,
  index: number,
  child: ServiceTreeNode<T>,
): ServiceTreeNode<T>[] {
  if (!parentId) {
    const next = [...nodes];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, child);
    return next;
  }
  return mapServiceTree(nodes, (node) => {
    if (node.kind !== 'folder' || node.id !== parentId)
      return node;
    const children = [...node.children];
    children.splice(Math.max(0, Math.min(index, children.length)), 0, child);
    return { ...node, children, updatedAt: child.updatedAt };
  });
}

/**
 * Moves a node under `targetParentId` (null = root) at `targetIndex`.
 * Rejects dropping a folder into itself or a descendant.
 */
export function moveServiceNode<T>(
  nodes: readonly ServiceTreeNode<T>[],
  nodeId: string,
  targetParentId: string | null,
  targetIndex: number,
): ServiceTreeNode<T>[] {
  if (targetParentId === nodeId)
    return [...nodes];
  if (targetParentId) {
    const parent = findServiceNode(nodes, targetParentId);
    if (!parent || parent.kind !== 'folder')
      return [...nodes];
    if (isServiceDescendant(nodes, nodeId, targetParentId))
      return [...nodes];
  }

  const extracted = extractServiceNode(nodes, nodeId);
  if (!extracted.node)
    return [...nodes];

  let index = targetIndex;
  const prior = findServiceParentIndex(nodes, nodeId);
  if (prior && prior.parentId === targetParentId && prior.index < targetIndex)
    index = targetIndex - 1;

  return insertServiceChildAt(extracted.tree, targetParentId, index, extracted.node);
}

/** Locates a node’s parent id (null = root) and sibling index. */
export function findServiceParentIndex<T>(
  nodes: readonly ServiceTreeNode<T>[],
  id: string,
  parentId: string | null = null,
): { readonly parentId: string | null; readonly index: number } | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === id)
      return { parentId, index };
    if (node.kind === 'folder') {
      const found = findServiceParentIndex(node.children, id, node.id);
      if (found)
        return found;
    }
  }
  return null;
}

function isServiceDescendant<T>(
  nodes: readonly ServiceTreeNode<T>[],
  ancestorId: string,
  candidateId: string,
): boolean {
  const ancestor = findServiceNode(nodes, ancestorId);
  if (!ancestor || ancestor.kind !== 'folder')
    return false;
  return findServiceNode(ancestor.children, candidateId) !== null;
}

export function renameServiceNode<T>(
  nodes: readonly ServiceTreeNode<T>[],
  id: string,
  name: string,
  now: string,
): ServiceTreeNode<T>[] {
  return mapServiceTree(nodes, (node) =>
    node.id === id ? { ...node, name, updatedAt: now } : node,
  );
}

export function patchServiceArtifact<T>(
  nodes: readonly ServiceTreeNode<T>[],
  id: string,
  patch: Partial<T> & { readonly name?: string },
  now: string,
): ServiceTreeNode<T>[] {
  return mapServiceTree(nodes, (node) => {
    if (node.kind !== 'artifact' || node.id !== id)
      return node;
    return { ...node, ...patch, updatedAt: now };
  });
}

export function duplicateServiceNode<T>(
  nodes: readonly ServiceTreeNode<T>[],
  id: string,
  now: string,
): ServiceTreeNode<T>[] {
  const source = findServiceNode(nodes, id);
  if (!source)
    return [...nodes];
  const clone = cloneServiceNode(source, now);
  return insertAfter(nodes, id, clone);
}

function cloneServiceNode<T>(node: ServiceTreeNode<T>, now: string): ServiceTreeNode<T> {
  if (node.kind === 'folder') {
    return {
      ...node,
      id: newServiceNodeId(),
      name: `${node.name} copy`,
      updatedAt: now,
      children: node.children.map((child) => cloneServiceNode(child, now)),
    };
  }
  return {
    ...node,
    id: newServiceNodeId(),
    name: `${node.name} copy`,
    updatedAt: now,
  };
}

function insertAfter<T>(
  nodes: readonly ServiceTreeNode<T>[],
  afterId: string,
  child: ServiceTreeNode<T>,
): ServiceTreeNode<T>[] {
  const index = nodes.findIndex((node) => node.id === afterId);
  if (index >= 0) {
    const next = [...nodes];
    next.splice(index + 1, 0, child);
    return next;
  }
  return nodes.map((node) => {
    if (node.kind !== 'folder')
      return node;
    return { ...node, children: insertAfter(node.children, afterId, child) };
  });
}

export interface FilterServiceTreeOptions {
  /** When non-empty, artifacts must include at least one of these tags (case-insensitive). */
  readonly tags?: readonly string[];
  /** Read tags from an artifact node. Defaults to `node.tags` when present. */
  readonly getTags?: (node: ServiceArtifactNode<unknown>) => readonly string[];
}

function artifactTags<T>(
  node: ServiceArtifactNode<T>,
  getTags?: (node: ServiceArtifactNode<unknown>) => readonly string[],
): readonly string[] {
  if (getTags)
    return getTags(node as ServiceArtifactNode<unknown>);
  const tags = (node as { readonly tags?: unknown }).tags;
  return Array.isArray(tags) ? tags.filter((item): item is string => typeof item === 'string') : [];
}

function artifactMatchesQuery<T>(
  node: ServiceArtifactNode<T>,
  needle: string,
  getTags?: (node: ServiceArtifactNode<unknown>) => readonly string[],
): boolean {
  if (!needle)
    return true;
  if (node.name.toLowerCase().includes(needle))
    return true;
  return artifactTags(node, getTags).some((tag) => tag.toLowerCase().includes(needle));
}

function artifactMatchesTags<T>(
  node: ServiceArtifactNode<T>,
  tags: readonly string[],
  getTags?: (node: ServiceArtifactNode<unknown>) => readonly string[],
): boolean {
  if (tags.length === 0)
    return true;
  const wanted = new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean));
  if (wanted.size === 0)
    return true;
  return artifactTags(node, getTags).some((tag) => wanted.has(tag.toLowerCase()));
}

/** Collect unique tags across a service tree (sorted). */
export function collectServiceTreeTags<T>(
  nodes: readonly ServiceTreeNode<T>[],
  getTags?: (node: ServiceArtifactNode<unknown>) => readonly string[],
): string[] {
  const found = new Set<string>();
  const walk = (list: readonly ServiceTreeNode<T>[]): void => {
    for (const node of list) {
      if (node.kind === 'folder') {
        walk(node.children);
        continue;
      }
      for (const tag of artifactTags(node, getTags)) {
        const trimmed = tag.trim();
        if (trimmed)
          found.add(trimmed);
      }
    }
  };
  walk(nodes);
  return [...found].sort((left, right) => left.localeCompare(right));
}

export function filterServiceTree<T>(
  nodes: readonly ServiceTreeNode<T>[],
  query: string,
  options: FilterServiceTreeOptions = {},
): ServiceTreeNode<T>[] {
  const needle = query.trim().toLowerCase();
  const tags = options.tags ?? [];
  if (!needle && tags.length === 0)
    return [...nodes];
  const next: ServiceTreeNode<T>[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder') {
      const children = filterServiceTree(node.children, query, options);
      const nameHit = !!needle && node.name.toLowerCase().includes(needle);
      if (children.length > 0 || (nameHit && tags.length === 0))
        next.push({ ...node, children });
      continue;
    }
    if (
      artifactMatchesQuery(node, needle, options.getTags) &&
      artifactMatchesTags(node, tags, options.getTags)
    )
      next.push(node);
  }
  return next;
}

export function parseUnknownTree<T>(
  raw: unknown,
  parseArtifact: (value: Record<string, unknown>) => T,
): ServiceTreeNode<T>[] {
  if (!Array.isArray(raw))
    return [];
  const nodes: ServiceTreeNode<T>[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      continue;
    const source = item as Record<string, unknown>;
    const id = typeof source['id'] === 'string' && source['id'] ? source['id'] : newServiceNodeId();
    const name = typeof source['name'] === 'string' && source['name'] ? source['name'] : 'Untitled';
    const updatedAt =
      typeof source['updatedAt'] === 'string' && source['updatedAt']
        ? source['updatedAt']
        : new Date().toISOString();
    if (source['kind'] === 'folder') {
      nodes.push({
        kind: 'folder',
        id,
        name,
        updatedAt,
        children: parseUnknownTree(source['children'], parseArtifact),
      });
      continue;
    }
    nodes.push({
      kind: 'artifact',
      id,
      name,
      updatedAt,
      ...parseArtifact(source),
    });
  }
  return nodes;
}
