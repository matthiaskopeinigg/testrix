import type { PlantumlDiagramKind, PlantumlNode } from '@testrix/contracts';

export const PLANTUML_FILTER_KINDS = ['folder', 'sequence', 'class', 'activity'] as const;

export type PlantumlFilterKind = (typeof PLANTUML_FILTER_KINDS)[number];

export const PLANTUML_SORT_MODES = ['name-asc', 'name-desc', 'type', 'modified-desc'] as const;

export type PlantumlSortMode = (typeof PLANTUML_SORT_MODES)[number];

const KIND_RANK: Readonly<Record<PlantumlDiagramKind, number>> = {
  sequence: 1,
  class: 2,
  activity: 3,
  usecase: 4,
  component: 5,
  state: 6,
  freeform: 7,
};

/** Folder ids in tree order. */
export function collectPlantumlFolderIds(nodes: readonly PlantumlNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.kind !== 'folder')
      continue;
    ids.push(node.id);
    ids.push(...collectPlantumlFolderIds(node.children as PlantumlNode[]));
  }
  return ids;
}

/**
 * Keep folders that match the query or still have visible children.
 * An empty kind list shows every type.
 */
export function filterPlantumlTree(
  nodes: readonly PlantumlNode[],
  kinds: readonly PlantumlFilterKind[],
  query: string,
): PlantumlNode[] {
  const needle = query.trim().toLowerCase();
  const next: PlantumlNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder') {
      const children = filterPlantumlTree(node.children as PlantumlNode[], kinds, query);
      const nameHit = !needle || node.name.toLowerCase().includes(needle);
      const kindHit = kinds.length === 0 || kinds.includes('folder');
      if (children.length > 0)
        next.push({ ...node, children });
      else if (nameHit && kindHit)
        next.push({ ...node, children: [] });
      continue;
    }
    if (!artifactPasses(node, kinds, needle))
      continue;
    next.push(node);
  }
  return next;
}

/** Sort each level. Folders stay above diagrams. */
export function sortPlantumlTree(nodes: readonly PlantumlNode[], mode: PlantumlSortMode): PlantumlNode[] {
  const sorted = [...nodes].sort((left, right) => comparePlantuml(left, right, mode));
  return sorted.map((node) => {
    if (node.kind !== 'folder')
      return node;
    return { ...node, children: sortPlantumlTree(node.children as PlantumlNode[], mode) };
  });
}

function artifactPasses(
  node: Extract<PlantumlNode, { kind: 'artifact' }>,
  kinds: readonly PlantumlFilterKind[],
  needle: string,
): boolean {
  if (needle && !node.name.toLowerCase().includes(needle))
    return false;
  if (kinds.length === 0)
    return true;
  return kinds.some((kind) => kind !== 'folder' && kind === node.diagramKind);
}

function comparePlantuml(left: PlantumlNode, right: PlantumlNode, mode: PlantumlSortMode): number {
  if (left.kind === 'folder' && right.kind !== 'folder')
    return -1;
  if (right.kind === 'folder' && left.kind !== 'folder')
    return 1;
  if (mode === 'name-desc')
    return right.name.localeCompare(left.name, undefined, { sensitivity: 'base' });
  if (mode === 'type') {
    const rank = kindRank(left) - kindRank(right);
    if (rank !== 0)
      return rank;
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  }
  if (mode === 'modified-desc')
    return right.updatedAt.localeCompare(left.updatedAt);
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
}

function kindRank(node: PlantumlNode): number {
  if (node.kind === 'folder')
    return 0;
  return KIND_RANK[node.diagramKind] ?? 20;
}
