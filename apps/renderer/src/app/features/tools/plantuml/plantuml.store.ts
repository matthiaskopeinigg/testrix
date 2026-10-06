import { Injectable, computed, effect, inject, signal } from '@angular/core';
import {
  collectPlantumlArtifactIds,
  cloneServiceSubtree,
  duplicateServiceNode,
  emptyPlantumlArtifact,
  emptyServiceFolder,
  extractServiceNode,
  findServiceNode,
  insertServiceChild,
  insertServiceChildAt,
  mapServiceTree,
  moveServiceNode,
  removeServiceNode,
  renameServiceNode,
  type PlantumlArtifactFields,
  type PlantumlDiagramKind,
  type PlantumlFile,
  type PlantumlNode,
} from '@testrix/contracts';

import { DesktopApiService } from '../../../core/desktop-api.service';
import { uniquePasteName } from '../../../core/unique-paste-name';
import {
  applyPointerSelect,
  emptySelection,
  type SelectionEntry,
} from '../../../core/range-select';
import { WorkbenchStore } from '../../workbench/workbench.store';
import { emptyModel, generatePlantuml } from '../../workbench/plantuml/plantuml-generator';
import {
  collectPlantumlFolderIds,
  filterPlantumlTree,
  sortPlantumlTree,
  type PlantumlFilterKind,
  type PlantumlSortMode,
} from './plantuml-tree';
import {
  PLANTUML_ROOT_ID,
  flattenPlantumlTreeRows,
  type DropSlot,
} from './plantuml-drop-model';

export interface PlantumlTreeRow {
  readonly node: PlantumlNode;
  readonly depth: number;
  readonly parentId: string | null;
}

function isPlantumlDescendant(
  nodes: readonly PlantumlNode[],
  ancestorId: string,
  candidateId: string,
): boolean {
  const ancestor = findServiceNode(nodes, ancestorId);
  if (!ancestor || ancestor.kind !== 'folder')
    return false;
  return findServiceNode(ancestor.children as PlantumlNode[], candidateId) !== null;
}

function insertPlantumlChildrenAt(
  nodes: readonly PlantumlNode[],
  parentId: string | null,
  index: number,
  children: readonly PlantumlNode[],
): PlantumlNode[] {
  if (children.length === 0)
    return [...nodes];
  if (!parentId) {
    const next = [...nodes];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, ...children);
    return next;
  }
  let next: PlantumlNode[] = [...nodes];
  for (let offset = 0; offset < children.length; offset += 1)
    next = insertServiceChildAt(next, parentId, index + offset, children[offset]!) as PlantumlNode[];
  return next;
}

function ensureFoldersFirst(nodes: readonly PlantumlNode[]): PlantumlNode[] {
  const folders: PlantumlNode[] = [];
  const leaves: PlantumlNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'folder')
      folders.push({ ...node, children: ensureFoldersFirst(node.children as PlantumlNode[]) });
    else
      leaves.push(node);
  }
  return [...folders, ...leaves];
}

function flattenRows(
  nodes: readonly PlantumlNode[],
  isExpanded: (id: string) => boolean,
  depth = 0,
  parentId: string | null = null,
): PlantumlTreeRow[] {
  const rows: PlantumlTreeRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth, parentId });
    if (node.kind === 'folder' && isExpanded(node.id))
      rows.push(...flattenRows(node.children as PlantumlNode[], isExpanded, depth + 1, node.id));
  }
  return rows;
}

@Injectable({ providedIn: 'root' })
export class PlantumlStore {
  private readonly desktop = inject(DesktopApiService);
  private readonly workbench = inject(WorkbenchStore);

  readonly items = computed(() => this.desktop.plantuml().items as PlantumlNode[]);
  readonly search = signal('');
  readonly filters = signal<readonly PlantumlFilterKind[]>([]);
  readonly sortMode = signal<PlantumlSortMode>('name-asc');
  readonly expandedIds = signal<readonly string[]>([]);
  readonly selectedIds = signal<readonly string[]>([]);
  readonly selectionAnchorId = signal<string | null>(null);
  readonly activeId = signal<string | null>(null);
  readonly dragNode = signal<PlantumlNode | null>(null);
  readonly dragIds = signal<readonly string[]>([]);
  readonly dropTarget = signal<DropSlot | null>(null);
  readonly lastMovedId = signal<string | null>(null);

  private moveAnimTimer: ReturnType<typeof setTimeout> | null = null;

  readonly visibleRows = computed(() => {
    const query = this.search().trim();
    const kinds = this.filters();
    const reveal = query.length > 0 || kinds.length > 0;
    const expanded = new Set(this.expandedIds());
    return flattenRows(
      filterPlantumlTree(this.items(), kinds, query),
      (id) => reveal || expanded.has(id),
    );
  });

  readonly hasItems = computed(() => this.items().length > 0);
  readonly hasVisible = computed(() => this.visibleRows().length > 0);
  readonly isFilterActive = computed(() => this.filters().length > 0);
  readonly allFoldersExpanded = computed(() => {
    const folderIds = collectPlantumlFolderIds(this.items());
    if (folderIds.length === 0)
      return false;
    const expanded = this.expandedIds();
    return folderIds.every((id) => expanded.includes(id));
  });

  constructor() {
    effect(() => {
      this.hydrateActiveFromWorkbench();
    });
  }

  hydrateActiveFromWorkbench(): void {
    const group = this.workbench.focusedGroup();
    const tab = group?.tabs.find((item) => item.id === group.activeTabId);
    this.activeId.set(tab?.kind === 'plantuml' ? tab.nodeId : null);
  }

  artifactIds(): ReadonlySet<string> {
    return collectPlantumlArtifactIds(this.items());
  }

  findArtifact(id: string): Extract<PlantumlNode, { kind: 'artifact' }> | null {
    const node = findServiceNode(this.items(), id);
    return node?.kind === 'artifact' ? node : null;
  }

  setSearch(value: string): void {
    this.search.set(value);
  }

  setSortMode(mode: PlantumlSortMode): void {
    this.sortMode.set(mode);
    void this.writeTree(sortPlantumlTree(this.items(), mode));
  }

  toggleKindFilter(kind: PlantumlFilterKind): void {
    const current = this.filters();
    this.filters.set(
      current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind],
    );
  }

  clearFilters(): void {
    this.filters.set([]);
  }

  toggleExpandAll(): void {
    if (this.allFoldersExpanded()) {
      this.expandedIds.set([]);
      return;
    }
    this.expandedIds.set(collectPlantumlFolderIds(this.items()));
  }

  toggleExpanded(id: string): void {
    const current = this.expandedIds();
    this.expandedIds.set(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  ensureExpanded(id: string): void {
    if (!this.expandedIds().includes(id))
      this.expandedIds.set([...this.expandedIds(), id]);
  }

  select(id: string): void {
    this.selectedIds.set([id]);
    this.selectionAnchorId.set(id);
  }

  visibleIds(): readonly string[] {
    return this.visibleRows().map((row) => row.node.id);
  }

  applyPointerSelect(
    targetId: string,
    event: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean },
  ): SelectionEntry {
    const next = applyPointerSelect({
      event,
      visibleIds: this.visibleIds(),
      selectedIds: this.selectedIds(),
      anchorId: this.selectionAnchorId(),
      targetId,
    });
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);
    return next;
  }

  selectAllVisible(): void {
    const ids = this.visibleIds();
    this.selectedIds.set(ids);
    this.selectionAnchorId.set(ids[0] ?? null);
  }

  clearSelection(): void {
    const next = emptySelection();
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);
  }

  /** Prefer the multi-set; otherwise the active diagram. */
  selectionOrActive(): readonly string[] {
    const selected = this.selectedIds();
    if (selected.length > 0)
      return selected;
    const active = this.activeId();
    return active ? [active] : [];
  }

  dragIdsFor(sourceId: string): readonly string[] {
    const selected = this.selectedIds();
    if (selected.includes(sourceId)) {
      return flattenPlantumlTreeRows(this.items(), () => true)
        .map((row) => row.id)
        .filter((id) => selected.includes(id));
    }
    this.selectedIds.set([sourceId]);
    this.selectionAnchorId.set(sourceId);
    return [sourceId];
  }

  beginDrag(node: PlantumlNode, ids: readonly string[] = [node.id]): void {
    this.dragNode.set(node);
    this.dragIds.set(ids.length > 0 ? ids : [node.id]);
    this.dropTarget.set(null);
  }

  setDropTarget(target: DropSlot | null): void {
    this.dropTarget.set(target);
  }

  endDrag(): void {
    this.dragNode.set(null);
    this.dragIds.set([]);
    this.dropTarget.set(null);
  }

  isDropFolder(id: string): boolean {
    const target = this.dropTarget();
    return target?.mode === 'into' && target.folderId === id && !target.denied;
  }

  isJustMoved(id: string): boolean {
    return this.lastMovedId() === id;
  }

  openDiagram(id: string, name?: string): void {
    const node = this.findArtifact(id);
    const title = name ?? node?.name ?? 'Diagram';
    this.activeId.set(id);
    this.select(id);
    this.workbench.openFromPlantuml(id, title);
  }

  async createFolder(parentId: string | null = null): Promise<string> {
    this.search.set('');
    this.filters.set([]);
    const folder = emptyServiceFolder('New folder') as PlantumlNode;
    await this.writeTree(ensureFoldersFirst(insertServiceChild(this.items(), parentId, folder)));
    if (parentId)
      this.ensureExpanded(parentId);
    this.toggleExpanded(folder.id);
    return folder.id;
  }

  async createDiagram(
    parentId: string | null = null,
    diagramKind: Exclude<PlantumlDiagramKind, 'freeform'> = 'sequence',
  ): Promise<string> {
    this.search.set('');
    this.filters.set([]);
    const label = diagramKind === 'usecase' ? 'Use case' : diagramKind.charAt(0).toUpperCase() + diagramKind.slice(1);
    const model = emptyModel(diagramKind, label);
    const node = emptyPlantumlArtifact(`New ${label.toLowerCase()}`, diagramKind);
    const seeded: PlantumlNode = {
      ...node,
      source: generatePlantuml(model),
      builderJson: JSON.stringify(model),
    };
    await this.writeTree(ensureFoldersFirst(insertServiceChild(this.items(), parentId, seeded)));
    if (parentId)
      this.ensureExpanded(parentId);
    this.openDiagram(seeded.id, seeded.name);
    return seeded.id;
  }

  async rename(nodeId: string, name: string): Promise<void> {
    const now = new Date().toISOString();
    await this.writeTree(renameServiceNode(this.items(), nodeId, name, now));
    this.workbench.renamePlantumlTabs(nodeId, name);
  }

  copySelection(): PlantumlNode[] {
    const ids = this.topLevelSelection(this.selectionOrActive());
    const nodes: PlantumlNode[] = [];
    for (const id of ids) {
      const node = findServiceNode(this.items(), id);
      if (node)
        nodes.push(structuredClone(node) as PlantumlNode);
    }
    return nodes;
  }

  async pasteCopied(nodes: readonly PlantumlNode[]): Promise<readonly string[]> {
    if (nodes.length === 0)
      return [];
    const now = new Date().toISOString();
    let tree = [...this.items()];
    const names = tree.map((node) => node.name);
    const pasted: PlantumlNode[] = [];
    for (const node of nodes) {
      const clone = cloneServiceSubtree(node, now) as PlantumlNode;
      const name = uniquePasteName(node.name, names, 'Diagram');
      names.push(name);
      const named = { ...clone, name } as PlantumlNode;
      tree = insertServiceChild(tree, null, named);
      pasted.push(named);
    }
    await this.writeTree(ensureFoldersFirst(tree));
    const ids = pasted.map((node) => node.id);
    this.selectedIds.set(ids);
    this.selectionAnchorId.set(ids[0] ?? null);
    return ids;
  }

  async duplicate(nodeId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.writeTree(ensureFoldersFirst(duplicateServiceNode(this.items(), nodeId, now)));
  }

  async remove(nodeId: string): Promise<void> {
    const removed = findServiceNode(this.items(), nodeId);
    const ids = removed
      ? [...collectPlantumlArtifactIds(removed.kind === 'folder' ? [removed] : [removed])]
      : [nodeId];
    await this.writeTree(removeServiceNode(this.items(), nodeId) as PlantumlNode[]);
    this.workbench.closePlantumlTabs(ids);
    if (ids.includes(this.activeId() ?? '') || this.activeId() === nodeId)
      this.activeId.set(null);
    this.selectedIds.set(this.selectedIds().filter((id) => id !== nodeId && !ids.includes(id)));
    if (!this.selectedIds().includes(this.selectionAnchorId() ?? ''))
      this.selectionAnchorId.set(this.selectedIds()[0] ?? null);
  }

  /** Deletes selected roots (skips ids nested under another selected folder). */
  async removeMany(nodeIds: readonly string[]): Promise<void> {
    const roots = this.topLevelSelection(nodeIds);
    for (const nodeId of roots)
      await this.remove(nodeId);
    this.clearSelection();
  }

  async move(nodeId: string, targetParentId: string | null, targetIndex: number): Promise<void> {
    const next = moveServiceNode(this.items(), nodeId, targetParentId, targetIndex);
    await this.writeTree(ensureFoldersFirst(next as PlantumlNode[]));
    this.markMoved(nodeId);
    if (targetParentId)
      this.ensureExpanded(targetParentId);
  }

  /**
   * Moves `ids` under `targetParentId` at `targetIndex` as one block.
   * Selected descendants of other selected folders are skipped.
   */
  async moveNodes(
    ids: readonly string[],
    targetParentId: string | null,
    targetIndex: number,
  ): Promise<boolean> {
    const unique = [...new Set(ids)];
    if (unique.length === 0)
      return false;
    if (unique.length === 1) {
      await this.move(unique[0], targetParentId, targetIndex);
      return true;
    }

    const parentId =
      targetParentId === null || targetParentId === PLANTUML_ROOT_ID ? null : targetParentId;
    const tree = this.items();
    const rows = flattenPlantumlTreeRows(tree, () => true);
    const ordered = rows.map((row) => row.id).filter((id) => unique.includes(id));
    const movingIds = ordered.filter(
      (id) => !unique.some((other) => other !== id && isPlantumlDescendant(tree, other, id)),
    );
    if (movingIds.length === 0)
      return false;

    for (const id of movingIds) {
      if (parentId === id || (parentId && isPlantumlDescendant(tree, id, parentId)))
        return false;
    }

    const rowById = new Map(rows.map((row) => [row.id, row]));
    const effectiveParent = parentId ?? PLANTUML_ROOT_ID;
    const removedBefore = movingIds.filter((id) => {
      const current = rowById.get(id);
      return current?.parentId === effectiveParent && current.index < targetIndex;
    }).length;
    const insertIndex = Math.max(0, targetIndex - removedBefore);

    let next: PlantumlNode[] = [...tree];
    const extracted: PlantumlNode[] = [];
    for (const id of movingIds) {
      const removed = extractServiceNode(next, id);
      if (!removed.node)
        continue;
      extracted.push(removed.node as PlantumlNode);
      next = removed.tree as PlantumlNode[];
    }
    if (extracted.length === 0)
      return false;

    next = ensureFoldersFirst(insertPlantumlChildrenAt(next, parentId, insertIndex, extracted));
    await this.writeTree(next);
    this.markMoved(extracted[0].id);
    if (parentId)
      this.ensureExpanded(parentId);
    return true;
  }

  /** Applies the current drop target, then clears drag state. */
  async commitDrop(): Promise<string | null> {
    const dragged = this.dragNode();
    const target = this.dropTarget();
    const ids = this.dragIds().length > 0 ? this.dragIds() : dragged ? [dragged.id] : [];
    this.endDrag();

    if (!dragged || !target || target.denied || ids.length === 0)
      return null;

    if (target.mode === 'into') {
      if (
        ids.some(
          (id) => id === target.parentId || isPlantumlDescendant(this.items(), id, target.parentId),
        )
      ) {
        return null;
      }
      const folder = findServiceNode(this.items(), target.parentId);
      const index = folder?.kind === 'folder' ? folder.children.length : 0;
      await this.moveNodes(ids, target.parentId, index);
      return dragged.id;
    }

    const parentId = target.parentId === PLANTUML_ROOT_ID ? null : target.parentId;
    if (
      parentId &&
      ids.some((id) => parentId === id || isPlantumlDescendant(this.items(), id, parentId))
    ) {
      return null;
    }

    if (ids.length === 1) {
      const only = ids[0];
      const rows = flattenPlantumlTreeRows(this.items(), () => true);
      const current = rows.find((row) => row.id === only);
      if (
        current
        && current.parentId === (parentId ?? PLANTUML_ROOT_ID)
        && (current.index === target.index || current.index + 1 === target.index)
      ) {
        return null;
      }
    }

    await this.moveNodes(ids, parentId, target.index);
    return dragged.id;
  }

  /** Drop `nodeId` onto `targetId` (into folder, or before sibling). */
  async moveOnto(nodeId: string, targetId: string): Promise<void> {
    if (nodeId === targetId)
      return;
    const target = findServiceNode(this.items(), targetId);
    if (!target)
      return;
    if (target.kind === 'folder') {
      await this.move(nodeId, targetId, 0);
      this.ensureExpanded(targetId);
      return;
    }
    const parentId = this.parentOf(targetId);
    const parent = parentId ? findServiceNode(this.items(), parentId) : null;
    const siblings = parent?.kind === 'folder'
      ? (parent.children as PlantumlNode[])
      : this.items();
    const index = siblings.findIndex((item) => item.id === targetId);
    await this.move(nodeId, parentId, Math.max(0, index));
  }

  private topLevelSelection(nodeIds: readonly string[]): readonly string[] {
    const set = new Set(nodeIds);
    return nodeIds.filter((id) => {
      const row = flattenPlantumlTreeRows(this.items(), () => true).find((item) => item.id === id);
      if (!row)
        return true;
      return !row.ancestors.some((ancestor) => set.has(ancestor));
    });
  }

  private markMoved(id: string): void {
    if (this.moveAnimTimer) {
      clearTimeout(this.moveAnimTimer);
      this.moveAnimTimer = null;
    }
    this.lastMovedId.set(null);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.lastMovedId.set(id);
        this.moveAnimTimer = setTimeout(() => {
          if (this.lastMovedId() === id)
            this.lastMovedId.set(null);
          this.moveAnimTimer = null;
        }, 320);
      });
    });
  }

  private parentOf(nodeId: string): string | null {
    const findParent = (
      nodes: readonly PlantumlNode[],
      parentId: string | null,
    ): string | null | undefined => {
      for (const node of nodes) {
        if (node.id === nodeId)
          return parentId;
        if (node.kind === 'folder') {
          const found = findParent(node.children as PlantumlNode[], node.id);
          if (found !== undefined)
            return found;
        }
      }
      return undefined;
    };
    return findParent(this.items(), null) ?? null;
  }

  async patchDiagram(
    id: string,
    patch: Partial<PlantumlArtifactFields> & { readonly name?: string },
  ): Promise<void> {
    const now = new Date().toISOString();
    const items = mapServiceTree(this.items(), (node) => {
      if (node.id !== id || node.kind !== 'artifact')
        return node;
      return {
        ...node,
        ...patch,
        updatedAt: now,
        name: patch.name ?? node.name,
      };
    }) as PlantumlFile['items'];
    await this.desktop.savePlantuml({ items });
    if (patch.name)
      this.workbench.renamePlantumlTabs(id, patch.name);
  }

  private async writeTree(items: readonly PlantumlNode[]): Promise<void> {
    await this.desktop.savePlantuml({ items: items as PlantumlFile['items'] });
  }
}
