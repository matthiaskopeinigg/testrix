import {
  emptyRegressionPackEntry,
  filterServiceTree,
  findServiceNode,
  type FlowArtifactFields,
  type FlowScenario,
  type RegressionPackEntry,
  type ServiceTreeNode,
} from '@testrix/contracts';

export type RgFlowTreeNode = ServiceTreeNode<FlowArtifactFields>;

export type RgPickerCheckState = 'checked' | 'partial' | 'unchecked';

export type RgPickerRow =
  | {
      readonly kind: 'folder';
      readonly id: string;
      readonly name: string;
      readonly depth: number;
      readonly node: Extract<RgFlowTreeNode, { kind: 'folder' }>;
    }
  | {
      readonly kind: 'flow';
      readonly id: string;
      readonly name: string;
      readonly depth: number;
      readonly node: Extract<RgFlowTreeNode, { kind: 'artifact' }>;
    }
  | {
      readonly kind: 'scenario';
      readonly id: string;
      readonly name: string;
      readonly depth: number;
      readonly flowId: string;
      readonly scenarioId: string;
      readonly enabled: boolean;
    };

export function collectFlowIdsInSubtree(node: RgFlowTreeNode): readonly string[] {
  if (node.kind === 'artifact')
    return [node.id];
  const ids: string[] = [];
  for (const child of node.children)
    ids.push(...collectFlowIdsInSubtree(child));
  return ids;
}

export function collectFlowIdsFromTree(nodes: readonly RgFlowTreeNode[]): readonly string[] {
  const ids: string[] = [];
  for (const node of nodes)
    ids.push(...collectFlowIdsInSubtree(node));
  return ids;
}

export function collectFolderIds(nodes: readonly RgFlowTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.kind !== 'folder')
      continue;
    ids.push(node.id);
    ids.push(...collectFolderIds(node.children));
  }
  return ids;
}

/** Flat folder options for linked-folder sync select. */
export function collectFolderOptions(
  nodes: readonly RgFlowTreeNode[],
  depth = 0,
): readonly { readonly value: string; readonly label: string }[] {
  const out: { readonly value: string; readonly label: string }[] = [];
  for (const node of nodes) {
    if (node.kind !== 'folder')
      continue;
    const prefix = depth > 0 ? `${'—'.repeat(depth)} ` : '';
    out.push({ value: node.id, label: `${prefix}${node.name}` });
    out.push(...collectFolderOptions(node.children, depth + 1));
  }
  return out;
}

export function filterFlowTree(
  nodes: readonly RgFlowTreeNode[],
  query: string,
  tags: readonly string[] = [],
): RgFlowTreeNode[] {
  return filterServiceTree(nodes, query, { tags }) as RgFlowTreeNode[];
}

export type RgFlowSort = 'manual' | 'name' | 'updated';

function ensureFoldersFirst(nodes: readonly RgFlowTreeNode[]): RgFlowTreeNode[] {
  const folders: RgFlowTreeNode[] = [];
  const leaves: RgFlowTreeNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder')
      folders.push(node);
    else
      leaves.push(node);
  }
  return [...folders, ...leaves];
}

/** Sorts a flow picker tree (folders first). Manual keeps authoring order. */
export function sortFlowTree(
  nodes: readonly RgFlowTreeNode[],
  sort: RgFlowSort,
): RgFlowTreeNode[] {
  if (sort === 'manual')
    return ensureFoldersFirst(nodes);
  const copy = nodes.map((node) =>
    node.kind === 'folder' ? { ...node, children: sortFlowTree(node.children, sort) } : node,
  );
  copy.sort((a, b) => {
    if (a.kind !== b.kind)
      return a.kind === 'folder' ? -1 : 1;
    if (sort === 'updated')
      return b.updatedAt.localeCompare(a.updatedAt);
    return a.name.localeCompare(b.name);
  });
  return copy;
}

export function entriesForFlow(
  entries: readonly RegressionPackEntry[],
  flowId: string,
): readonly RegressionPackEntry[] {
  return entries.filter((entry) => entry.flowId === flowId);
}

export function flowHasAllEntry(
  entries: readonly RegressionPackEntry[],
  flowId: string,
): boolean {
  return entries.some((entry) => entry.flowId === flowId && entry.scenarioId === null);
}

export function isFlowLinked(
  entries: readonly RegressionPackEntry[],
  flowId: string,
): boolean {
  return entries.some((entry) => entry.flowId === flowId);
}

export function flowCheckState(
  entries: readonly RegressionPackEntry[],
  flow: Extract<RgFlowTreeNode, { kind: 'artifact' }>,
): RgPickerCheckState {
  const flowEntries = entriesForFlow(entries, flow.id);
  if (flowEntries.length === 0)
    return 'unchecked';
  if (flowEntries.some((entry) => entry.scenarioId === null))
    return 'checked';
  const enabledScenarios = flow.scenarios.filter((scenario) => scenario.enabled);
  if (enabledScenarios.length === 0)
    return 'checked';
  const selected = new Set(
    flowEntries.map((entry) => entry.scenarioId).filter((id): id is string => !!id),
  );
  const selectedEnabled = enabledScenarios.filter((scenario) => selected.has(scenario.id)).length;
  if (selectedEnabled === 0)
    return 'partial';
  if (selectedEnabled >= enabledScenarios.length)
    return 'checked';
  return 'partial';
}

export function scenarioCheckState(
  entries: readonly RegressionPackEntry[],
  flowId: string,
  scenarioId: string,
): RgPickerCheckState {
  if (flowHasAllEntry(entries, flowId))
    return 'checked';
  return entries.some((entry) => entry.flowId === flowId && entry.scenarioId === scenarioId)
    ? 'checked'
    : 'unchecked';
}

export function folderCheckStateFromEntries(
  folder: Extract<RgFlowTreeNode, { kind: 'folder' }>,
  entries: readonly RegressionPackEntry[],
): RgPickerCheckState {
  const flowIds = collectFlowIdsInSubtree(folder);
  if (flowIds.length === 0)
    return 'unchecked';
  const linked = flowIds.filter((id) => isFlowLinked(entries, id)).length;
  if (linked === 0)
    return 'unchecked';
  if (linked === flowIds.length)
    return 'checked';
  return 'partial';
}

/** @deprecated Prefer folderCheckStateFromEntries for pack entries. */
export function folderCheckState(
  folder: Extract<RgFlowTreeNode, { kind: 'folder' }>,
  selected: ReadonlySet<string>,
): RgPickerCheckState {
  const flowIds = collectFlowIdsInSubtree(folder);
  if (flowIds.length === 0)
    return 'unchecked';
  const count = flowIds.filter((id) => selected.has(id)).length;
  if (count === 0)
    return 'unchecked';
  if (count === flowIds.length)
    return 'checked';
  return 'partial';
}

export function toggleFlowInSelection(
  selected: readonly string[],
  flowId: string,
): readonly string[] {
  const set = new Set(selected);
  if (set.has(flowId))
    set.delete(flowId);
  else
    set.add(flowId);
  return [...set];
}

export function toggleFolderInSelection(
  selected: readonly string[],
  folder: Extract<RgFlowTreeNode, { kind: 'folder' }>,
): readonly string[] {
  const flowIds = collectFlowIdsInSubtree(folder);
  if (flowIds.length === 0)
    return selected;
  const set = new Set(selected);
  const allSelected = flowIds.every((id) => set.has(id));
  if (allSelected) {
    for (const id of flowIds)
      set.delete(id);
  } else {
    for (const id of flowIds)
      set.add(id);
  }
  return [...set];
}

export function orderRegressionFlowIds(
  treeNodes: readonly RgFlowTreeNode[],
  selectedIds: readonly string[],
): readonly string[] {
  const selected = new Set(selectedIds);
  const ordered: string[] = [];
  const walk = (nodes: readonly RgFlowTreeNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'artifact') {
        if (selected.has(node.id))
          ordered.push(node.id);
        continue;
      }
      walk(node.children);
    }
  };
  walk(treeNodes);
  for (const id of selectedIds) {
    if (!ordered.includes(id))
      ordered.push(id);
  }
  return ordered;
}

/** Remove every entry for a flow, then optionally append replacements. */
function replaceFlowEntries(
  entries: readonly RegressionPackEntry[],
  flowId: string,
  nextForFlow: readonly RegressionPackEntry[],
): readonly RegressionPackEntry[] {
  return [...entries.filter((entry) => entry.flowId !== flowId), ...nextForFlow];
}

/**
 * Flow check links the flow as “all enabled scenarios”.
 * Uncheck clears every entry for that flow.
 */
export function toggleFlowEntry(
  entries: readonly RegressionPackEntry[],
  flowId: string,
): readonly RegressionPackEntry[] {
  if (isFlowLinked(entries, flowId))
    return entries.filter((entry) => entry.flowId !== flowId);
  return [...entries, emptyRegressionPackEntry(flowId, null)];
}

/**
 * Folder check links every descendant flow as all-scenarios, or clears them all.
 */
export function toggleFolderEntries(
  entries: readonly RegressionPackEntry[],
  folder: Extract<RgFlowTreeNode, { kind: 'folder' }>,
): readonly RegressionPackEntry[] {
  const flowIds = collectFlowIdsInSubtree(folder);
  if (flowIds.length === 0)
    return entries;
  const allLinked = flowIds.every((id) => isFlowLinked(entries, id));
  if (allLinked) {
    const clear = new Set(flowIds);
    return entries.filter((entry) => !clear.has(entry.flowId));
  }
  let next = entries.filter((entry) => !flowIds.includes(entry.flowId));
  for (const flowId of flowIds)
    next = [...next, emptyRegressionPackEntry(flowId, null)];
  return next;
}

/**
 * Scenario check adds/removes a specific scenario entry.
 * If the flow currently has an “all” entry, selecting a scenario replaces it
 * with that scenario only; unchecking one scenario expands to every other enabled scenario.
 */
export function toggleScenarioEntry(
  entries: readonly RegressionPackEntry[],
  flow: Extract<RgFlowTreeNode, { kind: 'artifact' }>,
  scenarioId: string,
): readonly RegressionPackEntry[] {
  const flowId = flow.id;
  const enabledScenarios = flow.scenarios.filter((scenario) => scenario.enabled);

  if (flowHasAllEntry(entries, flowId)) {
    const others = enabledScenarios
      .filter((scenario) => scenario.id !== scenarioId)
      .map((scenario) => emptyRegressionPackEntry(flowId, scenario.id));
    return replaceFlowEntries(entries, flowId, others);
  }

  const hasScenario = entries.some(
    (entry) => entry.flowId === flowId && entry.scenarioId === scenarioId,
  );
  if (hasScenario) {
    const remaining = entries.filter(
      (entry) => !(entry.flowId === flowId && entry.scenarioId === scenarioId),
    );
    return remaining;
  }

  const withoutAll = entries.filter(
    (entry) => !(entry.flowId === flowId && entry.scenarioId === null),
  );
  return [...withoutAll, emptyRegressionPackEntry(flowId, scenarioId)];
}

/**
 * Orders pack entries by services-tree DFS: each flow, then its scenarios.
 * Orphan entries (missing from tree) keep relative order at the end.
 */
export function orderRegressionEntries(
  treeNodes: readonly RgFlowTreeNode[],
  entries: readonly RegressionPackEntry[],
): readonly RegressionPackEntry[] {
  const byFlow = new Map<string, RegressionPackEntry[]>();
  for (const entry of entries) {
    const list = byFlow.get(entry.flowId) ?? [];
    list.push(entry);
    byFlow.set(entry.flowId, list);
  }

  const ordered: RegressionPackEntry[] = [];
  const seen = new Set<string>();

  const pushFlow = (flow: Extract<RgFlowTreeNode, { kind: 'artifact' }>): void => {
    const list = byFlow.get(flow.id);
    if (!list?.length)
      return;
    seen.add(flow.id);
    const allEntry = list.find((entry) => entry.scenarioId === null);
    if (allEntry) {
      ordered.push(allEntry);
      return;
    }
    const scenarioOrder = new Map(flow.scenarios.map((scenario, index) => [scenario.id, index]));
    const specifics = list
      .filter((entry) => entry.scenarioId !== null)
      .sort((a, b) => {
        const ai = scenarioOrder.get(a.scenarioId!) ?? Number.MAX_SAFE_INTEGER;
        const bi = scenarioOrder.get(b.scenarioId!) ?? Number.MAX_SAFE_INTEGER;
        return ai - bi;
      });
    ordered.push(...specifics);
  };

  const walk = (nodes: readonly RgFlowTreeNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'artifact') {
        pushFlow(node);
        continue;
      }
      walk(node.children);
    }
  };
  walk(treeNodes);

  for (const entry of entries) {
    if (seen.has(entry.flowId))
      continue;
    ordered.push(entry);
  }
  return ordered;
}

/**
 * Ensures every descendant flow of `linkedFolderId` is linked (as all-scenarios).
 * Extra linked flows outside the folder are kept when they still exist in the tree.
 */
export function syncEntriesFromLinkedFolder(
  entries: readonly RegressionPackEntry[],
  linkedFolderId: string | null | undefined,
  treeNodes: readonly RgFlowTreeNode[],
): readonly RegressionPackEntry[] {
  const folderId = linkedFolderId?.trim() ?? '';
  if (!folderId)
    return entries;

  const folder = findServiceNode(treeNodes, folderId);
  if (!folder || folder.kind !== 'folder')
    return entries;

  const descendantIds = collectFlowIdsInSubtree(folder);
  const inFolder = new Set(descendantIds);
  const knownFlows = new Set(collectFlowIdsFromTree(treeNodes));

  const extras = entries.filter(
    (entry) => !inFolder.has(entry.flowId) && knownFlows.has(entry.flowId),
  );

  let next: RegressionPackEntry[] = [];
  for (const flowId of descendantIds) {
    const existing = entriesForFlow(entries, flowId);
    if (existing.length > 0)
      next = [...next, ...existing];
    else
      next = [...next, emptyRegressionPackEntry(flowId, null)];
  }
  next = [...next, ...extras];
  return orderRegressionEntries(treeNodes, next);
}

export function buildPickerRows(params: {
  readonly nodes: readonly RgFlowTreeNode[];
  readonly expandedIds: ReadonlySet<string>;
  readonly depth?: number;
}): readonly RgPickerRow[] {
  const depth = params.depth ?? 0;
  const out: RgPickerRow[] = [];
  for (const node of params.nodes) {
    if (node.kind === 'folder') {
      out.push({
        kind: 'folder',
        id: node.id,
        name: node.name,
        depth,
        node,
      });
      if (params.expandedIds.has(node.id))
        out.push(...buildPickerRows({ nodes: node.children, expandedIds: params.expandedIds, depth: depth + 1 }));
      continue;
    }

    out.push({
      kind: 'flow',
      id: node.id,
      name: node.name,
      depth,
      node,
    });
    if (params.expandedIds.has(node.id)) {
      for (const scenario of node.scenarios)
        out.push(scenarioRow(node.id, scenario, depth + 1));
    }
  }
  return out;
}

function scenarioRow(flowId: string, scenario: FlowScenario, depth: number): RgPickerRow {
  return {
    kind: 'scenario',
    id: `${flowId}::${scenario.id}`,
    name: scenario.enabled ? scenario.name : `${scenario.name} (disabled)`,
    depth,
    flowId,
    scenarioId: scenario.id,
    enabled: scenario.enabled,
  };
}
