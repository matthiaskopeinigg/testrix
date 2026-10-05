import { Injectable, computed, inject, signal } from '@angular/core';
import {
  createDefaultEnvironments,
  environmentVariableCount,
  environmentVariableMap,
  persistEnvironmentNodes,
  collectEnvironmentNodeIds,
  insertEnvironmentNode,
  isEnvironmentFolder,
  newEntityId,
  nextEnvironmentId,
  parseEnvironmentsFile,
  sanitizeSelectionEntry,
  type Environment,
  type EnvironmentList,
  type EnvironmentNode,
  type EnvironmentsFile,
  type SessionEnvironmentNodeSelection,
  type SessionFile,
  type SessionSelectionEntry,
} from '@testrix/contracts';

import { DesktopApiService } from '../../core/desktop-api.service';
import { applyPointerSelect, emptySelection, type SelectionEntry } from '../../core/range-select';
import { moveByInsertIndex, moveManyByInsertIndex, type EnvDropSlot } from './environments-drop-model';

function flattenNodeIds(nodes: readonly EnvironmentNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    out.push(node.id);
    if (isEnvironmentFolder(node)) {
      flattenNodeIds(node.children, out);
    }
  }
  return out;
}

function applyOrder(items: readonly Environment[], orderIds: readonly string[]): Environment[] {
  if (orderIds.length === 0) {
    return [...items];
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  const next: Environment[] = [];
  for (const id of orderIds) {
    const item = byId.get(id);
    if (!item) {
      continue;
    }
    next.push(item);
    byId.delete(id);
  }
  for (const item of items) {
    if (byId.has(item.id)) {
      next.push(item);
    }
  }
  return next;
}

@Injectable({ providedIn: 'root' })
export class EnvironmentsStore {
  private readonly desktop = inject(DesktopApiService);

  readonly items = signal<EnvironmentList>(createDefaultEnvironments());
  readonly searchQuery = signal('');
  readonly activeId = signal<string | null>('env-local');
  readonly dragItem = signal<Environment | null>(null);
  readonly dragIds = signal<readonly string[]>([]);
  readonly dropTarget = signal<EnvDropSlot | null>(null);
  readonly lastMovedId = signal<string | null>(null);
  readonly selectedIds = signal<readonly string[]>([]);
  readonly selectionAnchorId = signal<string | null>(null);
  readonly nodeSelection = signal<Readonly<Record<string, SessionEnvironmentNodeSelection>>>({});

  private moveAnimTimer: ReturnType<typeof setTimeout> | null = null;
  private persistEnabled = false;

  readonly visibleEnvironments = computed(() => {
    const needle = this.searchQuery().trim().toLowerCase();
    const items = this.items();
    if (!needle) {
      return items;
    }
    return items.filter((item) => item.name.toLowerCase().includes(needle));
  });

  readonly hasVisibleEnvironments = computed(() => this.visibleEnvironments().length > 0);

  hydrate(file: EnvironmentsFile): void {
    this.persistEnabled = false;
    const parsed = parseEnvironmentsFile(file);
    const items = applyOrder(parsed.items, parsed.orderIds);
    const didStripLegacy = file.items.some((item) => {
      const next = items.find((entry) => entry.id === item.id);
      return Boolean(next) && JSON.stringify(item.variables) !== JSON.stringify(next?.variables);
    });
    this.items.set(items);
    const activeId =
      parsed.activeId && items.some((item) => item.id === parsed.activeId) ? parsed.activeId : null;
    this.activeId.set(activeId);
    this.persistEnabled = true;
    if (didStripLegacy)
      this.persist();
  }

  restoreSelection(session: SessionFile): void {
    const valid = new Set(this.items().map((item) => item.id));
    const next = sanitizeSelectionEntry(session.selection.environments, valid);
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);

    const nodes: Record<string, SessionEnvironmentNodeSelection> = {};
    for (const [envId, entry] of Object.entries(session.selection.environmentNodes)) {
      const env = this.items().find((item) => item.id === envId);
      if (!env) {
        continue;
      }
      const allowed = collectEnvironmentNodeIds(env.variables);
      const cleaned = sanitizeSelectionEntry(entry, allowed);
      const paneId = entry.paneId && allowed.has(entry.paneId) ? entry.paneId : null;
      nodes[envId] = { ids: cleaned.ids, anchorId: cleaned.anchorId, paneId };
    }
    this.nodeSelection.set(nodes);
  }

  toSessionPatch(): {
    environments: SessionSelectionEntry;
    environmentNodes: Record<string, SessionEnvironmentNodeSelection>;
  } {
    return {
      environments: {
        ids: [...this.selectedIds()],
        anchorId: this.selectionAnchorId(),
      },
      environmentNodes: { ...this.nodeSelection() },
    };
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  applyListPointerSelect(
    targetId: string,
    event: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean },
  ): SelectionEntry {
    const next = applyPointerSelect({
      event,
      visibleIds: this.visibleEnvironments().map((item) => item.id),
      selectedIds: this.selectedIds(),
      anchorId: this.selectionAnchorId(),
      targetId,
    });
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);
    return next;
  }

  clearListSelection(): void {
    const next = emptySelection();
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);
  }

  dragIdsFor(sourceId: string): readonly string[] {
    const selected = this.selectedIds();
    if (selected.includes(sourceId)) {
      return this.visibleEnvironments()
        .map((item) => item.id)
        .filter((id) => selected.includes(id));
    }
    this.selectedIds.set([sourceId]);
    this.selectionAnchorId.set(sourceId);
    return [sourceId];
  }

  nodeSelectionFor(envId: string): SessionEnvironmentNodeSelection {
    return this.nodeSelection()[envId] ?? { ids: [], anchorId: null, paneId: null };
  }

  setNodeSelection(envId: string, patch: SessionEnvironmentNodeSelection): void {
    this.nodeSelection.update((current) => ({ ...current, [envId]: patch }));
  }

  applyNodePointerSelect(
    envId: string,
    targetId: string,
    visibleIds: readonly string[],
    event: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean },
  ): SelectionEntry {
    const current = this.nodeSelectionFor(envId);
    const next = applyPointerSelect({
      event,
      visibleIds,
      selectedIds: current.ids,
      anchorId: current.anchorId,
      targetId,
    });
    this.setNodeSelection(envId, { ids: [...next.ids], anchorId: next.anchorId, paneId: current.paneId });
    return next;
  }

  setNodePane(envId: string, paneId: string | null): void {
    const current = this.nodeSelectionFor(envId);
    this.setNodeSelection(envId, { ...current, paneId });
  }

  clearNodeSelection(envId: string): void {
    const current = this.nodeSelectionFor(envId);
    this.setNodeSelection(envId, { ids: [], anchorId: null, paneId: current.paneId });
  }

  dragNodeIdsFor(envId: string, sourceId: string): readonly string[] {
    const current = this.nodeSelectionFor(envId);
    const env = this.environmentById(envId);
    if (current.ids.includes(sourceId) && env) {
      return flattenNodeIds(env.variables).filter((id) => current.ids.includes(id));
    }
    this.setNodeSelection(envId, { ...current, ids: [sourceId], anchorId: sourceId });
    return [sourceId];
  }

  environmentById(id: string): Environment | null {
    return this.items().find((item) => item.id === id) ?? null;
  }

  variableCount(env: Environment): number {
    return environmentVariableCount(env);
  }

  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
  }

  setActive(id: string | null): void {
    if (id && !this.items().some((item) => item.id === id)) {
      return;
    }
    this.activeId.set(id);
    this.persist();
  }

  isActive(id: string): boolean {
    return this.activeId() === id;
  }

  rename(id: string, name: string): void {
    const nextName = name.trim() || 'Environment';
    this.patchItem(id, (item) => ({
      ...item,
      name: nextName,
      modifiedAt: new Date().toISOString(),
    }));
  }

  create(): Environment {
    const id = nextEnvironmentId(this.items().map((item) => item.id));
    const item: Environment = {
      id,
      name: 'New environment',
      modifiedAt: new Date().toISOString(),
      variables: [],
    };
    this.items.update((list) => [...list, item]);
    this.selectedIds.set([id]);
    this.selectionAnchorId.set(id);
    this.persist();
    return item;
  }

  duplicate(id: string): Environment | null {
    const source = this.environmentById(id);
    if (!source) {
      return null;
    }
    const nextId = nextEnvironmentId(this.items().map((item) => item.id));
    const names = this.items().map((item) => item.name);
    const item: Environment = {
      id: nextId,
      name: nextCopyName(source.name, names),
      modifiedAt: new Date().toISOString(),
      variables: cloneEnvironmentNodes(source.variables),
    };
    const index = this.items().findIndex((entry) => entry.id === id);
    this.items.update((list) => {
      const next = [...list];
      next.splice(index < 0 ? list.length : index + 1, 0, item);
      return next;
    });
    this.selectedIds.set([nextId]);
    this.selectionAnchorId.set(nextId);
    this.persist();
    return item;
  }

  /**
   * Removes environments. An empty list is allowed.
   * Returns the ids that were actually removed.
   */
  remove(ids: readonly string[], options?: { readonly persist?: boolean }): readonly string[] {
    const removing = new Set(ids);
    const items = this.items();
    const remaining = items.filter((item) => !removing.has(item.id));
    if (remaining.length === items.length)
      return [];

    const removed = items.filter((item) => removing.has(item.id)).map((item) => item.id);
    this.items.set(remaining);
    const activeId = this.activeId();
    if (activeId && removing.has(activeId))
      this.activeId.set(null);
    this.selectedIds.set(this.selectedIds().filter((id) => !removing.has(id)));
    if (this.selectionAnchorId() && removing.has(this.selectionAnchorId() ?? ''))
      this.selectionAnchorId.set(this.selectedIds()[0] ?? null);
    this.nodeSelection.update((current) => {
      const next = { ...current };
      for (const id of removed)
        delete next[id];
      return next;
    });
    if (options?.persist !== false)
      this.persist();
    return removed;
  }

  removeDeferred(ids: readonly string[]): {
    readonly removedIds: readonly string[];
    readonly restore: () => void;
    readonly commit: () => void;
  } | null {
    const items = this.items();
    const snapshots = ids
      .map((id) => {
        const index = items.findIndex((item) => item.id === id);
        if (index < 0)
          return null;
        return { item: structuredClone(items[index]!), index };
      })
      .filter((entry): entry is { readonly item: Environment; readonly index: number } => entry !== null);
    if (snapshots.length === 0)
      return null;

    const removedIds = this.remove(ids, { persist: false });
    if (removedIds.length === 0)
      return null;

    return {
      removedIds,
      restore: () => {
        this.items.update((list) => {
          const next = [...list];
          for (const snapshot of [...snapshots].sort((a, b) => a.index - b.index))
            next.splice(Math.min(snapshot.index, next.length), 0, snapshot.item);
          return next;
        });
        this.persist();
      },
      commit: () => this.persist(),
    };
  }

  setVariables(id: string, rows: readonly EnvironmentNode[]): void {
    this.patchItem(id, (item) => ({
      ...item,
      variables: persistEnvironmentNodes(rows),
      modifiedAt: new Date().toISOString(),
    }));
    const allowed = collectEnvironmentNodeIds(rows);
    const current = this.nodeSelectionFor(id);
    const cleaned = sanitizeSelectionEntry(current, allowed);
    const paneId = current.paneId && allowed.has(current.paneId) ? current.paneId : null;
    this.setNodeSelection(id, { ids: cleaned.ids, anchorId: cleaned.anchorId, paneId });
  }

  beginDrag(item: Environment, ids: readonly string[] = [item.id]): void {
    this.dragItem.set(item);
    this.dragIds.set(ids.length > 0 ? ids : [item.id]);
    this.dropTarget.set(null);
  }

  setDropTarget(target: EnvDropSlot | null): void {
    this.dropTarget.set(target);
  }

  endDrag(): void {
    this.dragItem.set(null);
    this.dragIds.set([]);
    this.dropTarget.set(null);
  }

  /**
   * Applies the current drop target, then clears drag state.
   *
   * @returns Moved id when order changed; otherwise null.
   */
  commitDrop(): string | null {
    const dragged = this.dragItem();
    const target = this.dropTarget();
    const ids = this.dragIds().length > 0 ? this.dragIds() : dragged ? [dragged.id] : [];
    this.endDrag();
    if (!dragged || !target || ids.length === 0) {
      return null;
    }
    if (ids.length > 1) {
      const next = moveManyByInsertIndex(this.items(), ids, target.index);
      if (!next) {
        return null;
      }
      this.items.set(next);
      this.markMoved(dragged.id);
      this.persist();
      return dragged.id;
    }
    return this.moveToInsertIndex(dragged.id, target.index);
  }

  /**
   * Keyboard equivalent of a one-slot drag. Moves the whole list selection when
   * `id` is part of it.
   *
   * @returns Spoken confirmation, or null when the item cannot move further.
   */
  moveByDirection(id: string, direction: -1 | 1): string | null {
    const ids = this.dragIdsFor(id);
    const items = this.items();
    const ordered = items.filter((item) => ids.includes(item.id));
    if (ordered.length === 0) {
      return null;
    }
    const first = items.findIndex((item) => item.id === ordered[0].id);
    const last = items.findIndex((item) => item.id === ordered[ordered.length - 1].id);
    if (first < 0 || last < 0) {
      return null;
    }
    const insertIndex = direction < 0 ? first - 1 : last + 2;
    if (insertIndex < 0 || insertIndex > items.length) {
      return null;
    }
    if (ids.length === 1) {
      const moved = this.moveToInsertIndex(ids[0], insertIndex);
      if (!moved) {
        return null;
      }
      const name = ordered[0]?.name ?? 'Environment';
      return direction < 0 ? `Moved ${name} up` : `Moved ${name} down`;
    }
    const next = moveManyByInsertIndex(items, ids, insertIndex);
    if (!next) {
      return null;
    }
    this.items.set(next);
    this.markMoved(id);
    this.persist();
    const count = ordered.length;
    return direction < 0 ? `Moved ${count} environments up` : `Moved ${count} environments down`;
  }

  private patchItem(id: string, update: (item: Environment) => Environment): void {
    const items = this.items();
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) {
      return;
    }
    const next = [...items];
    next[index] = update(items[index]);
    this.items.set(next);
    this.persist();
  }

  private moveToInsertIndex(id: string, insertIndex: number): string | null {
    const next = moveByInsertIndex(this.items(), id, insertIndex);
    if (!next) {
      return null;
    }
    this.items.set(next);
    this.markMoved(id);
    this.persist();
    return id;
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
          if (this.lastMovedId() === id) {
            this.lastMovedId.set(null);
          }
          this.moveAnimTimer = null;
        }, 320);
      });
    });
  }

  /**
   * Adds empty variables for keys not already defined on the environment.
   * Returns how many rows were created.
   */
  addMissingVariableKeys(envId: string, keys: readonly string[]): number {
    const env = this.environmentById(envId);
    if (!env || keys.length === 0)
      return 0;
    const existing = new Set(
      Object.keys(environmentVariableMap(env.variables)).map((key) => key.toLowerCase()),
    );
    let variables = env.variables;
    let added = 0;
    for (const raw of keys) {
      const key = raw.trim();
      if (!key || existing.has(key.toLowerCase()))
        continue;
      existing.add(key.toLowerCase());
      const id = newEntityId();
      variables = insertEnvironmentNode(variables, null, {
        kind: 'variable',
        id,
        key,
        value: '',
        description: '',
        enabled: true,
        secret: false,
      });
      added += 1;
    }
    if (added === 0)
      return 0;
    this.setVariables(envId, variables);
    return added;
  }

  private persist(): void {
    if (!this.persistEnabled) {
      return;
    }
    const items = this.items();
    void this.desktop.saveEnvironments({
      items,
      activeId: this.activeId(),
      orderIds: items.map((item) => item.id),
    });
  }
}

function cloneEnvironmentNodes(nodes: readonly EnvironmentNode[]): EnvironmentNode[] {
  return nodes.map((node) => {
    const id = globalThis.crypto.randomUUID();
    if (isEnvironmentFolder(node)) {
      return { ...node, id, children: cloneEnvironmentNodes(node.children) };
    }
    return { ...node, id };
  });
}

function nextCopyName(name: string, existing: readonly string[]): string {
  const used = new Set(existing);
  const base = `${name.trim() || 'Environment'} copy`;
  if (!used.has(base)) {
    return base;
  }
  let n = 2;
  while (used.has(`${base} ${n}`)) {
    n += 1;
  }
  return `${base} ${n}`;
}
