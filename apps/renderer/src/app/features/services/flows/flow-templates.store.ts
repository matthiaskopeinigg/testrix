import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DEFAULT_FLOW_TEMPLATES_SIDEBAR,
  FLOW_TEMPLATE_UNTAGGED,
  emptyFlowGraphTemplate,
  flowTemplateGroupNodeId,
  groupFlowTemplatesByPrimaryTag,
  normalizeFlowTemplateTags,
  newFlowTemplateId,
  parseFlowTemplateGroupNodeId,
  type FlowGraphTemplate,
  type SessionFlowTemplatesSidebar,
} from '@testrix/contracts';

import { DesktopApiService } from '../../../core/desktop-api.service';
import {
  applyPointerSelect,
  emptySelection,
  type SelectionEntry,
} from '../../../core/range-select';
import { WorkbenchStore } from '../../workbench/workbench.store';
import { FLOW_GRAPH_TEMPLATES } from './flow-templates';
import {
  FLOW_TEMPLATES_ROOT_ID,
  buildFlowTemplateTree,
  flattenFlowTemplateTreeRows,
  ungroupedIndexFromRootSlot,
  type DropSlot,
  type FlowTemplateTree,
  type FlowTemplateTreeNode,
} from './flow-templates-drop-model';

export type FlowTemplateSort = 'manual' | 'name';

/**
 * User + built-in flow graph templates for the Flows sidebar and insert menus.
 */
@Injectable({ providedIn: 'root' })
export class FlowTemplatesStore {
  private readonly desktop = inject(DesktopApiService);
  private readonly workbench = inject(WorkbenchStore);

  readonly panelOpen = signal(false);
  readonly search = signal('');
  readonly sort = signal<FlowTemplateSort>('manual');
  readonly tagFilters = signal<readonly string[]>([]);
  readonly renamingId = signal<string | null>(null);
  readonly renamingGroup = signal<string | null>(null);
  readonly selectedIds = signal<readonly string[]>([]);
  readonly selectionAnchorId = signal<string | null>(null);
  /** Collapsed group ids — missing means expanded (default open). */
  readonly collapsedGroupIds = signal<ReadonlySet<string>>(new Set());
  readonly dragNode = signal<FlowTemplateTreeNode | null>(null);
  /** Ids moving with the active drag (multi-select aware). */
  readonly dragIds = signal<readonly string[]>([]);
  readonly dropTarget = signal<DropSlot | null>(null);

  readonly userTemplates = computed(() => this.desktop.flowTemplates().templates);

  readonly hiddenBuiltinIds = computed(
    () => this.desktop.flowTemplates().hiddenBuiltinIds ?? [],
  );

  readonly savedGroups = computed(() => this.desktop.flowTemplates().groups ?? []);

  /** Shipped builtins still visible (not hidden, not overridden by a user copy with the same id). */
  readonly builtins = computed(() => {
    const hidden = new Set(this.hiddenBuiltinIds());
    const overridden = new Set(this.userTemplates().map((item) => item.id));
    return FLOW_GRAPH_TEMPLATES.filter(
      (item) => !hidden.has(item.id) && !overridden.has(item.id),
    );
  });

  /** Builtins ∪ user — for canvas insert menus and the sidebar catalog. */
  readonly allTemplates = computed(() => [...this.builtins(), ...this.userTemplates()]);

  readonly availableTags = computed(() => {
    const seen = new Set<string>();
    const tags: string[] = [];
    for (const item of this.allTemplates()) {
      for (const tag of item.tags) {
        const key = tag.toLowerCase();
        if (seen.has(key))
          continue;
        seen.add(key);
        tags.push(tag);
      }
    }
    return tags.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  });

  readonly isFilterActive = computed(() => this.tagFilters().length > 0);

  readonly isDragDisabled = computed(
    () =>
      !!this.search().trim() ||
      this.isFilterActive() ||
      this.sort() !== 'manual',
  );

  readonly filteredTemplates = computed(() => {
    const query = this.search().trim().toLowerCase();
    const filters = this.tagFilters().map((tag) => tag.toLowerCase());
    return this.allTemplates().filter((item) => {
      if (filters.length > 0) {
        const itemTags = item.tags.map((tag) => tag.toLowerCase());
        if (!filters.some((tag) => itemTags.includes(tag)))
          return false;
      }
      if (!query)
        return true;
      return (
        item.name.toLowerCase().includes(query) ||
        item.hint.toLowerCase().includes(query) ||
        item.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    });
  });

  readonly catalogGroups = computed(() => {
    const query = this.search().trim().toLowerCase();
    const filtersActive = this.isFilterActive();
    const extras = this.savedGroups().filter((tag) => {
      if (filtersActive)
        return false;
      return !query || tag.toLowerCase().includes(query);
    });
    const groups = groupFlowTemplatesByPrimaryTag(this.filteredTemplates(), extras);
    if (this.sort() !== 'name')
      return groups;
    const byName = (a: FlowGraphTemplate, b: FlowGraphTemplate) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    return [...groups]
      .map((group) => ({
        ...group,
        items: [...group.items].sort(byName),
      }))
      .sort((a, b) => {
        if (a.tag === FLOW_TEMPLATE_UNTAGGED)
          return 1;
        if (b.tag === FLOW_TEMPLATE_UNTAGGED)
          return -1;
        return a.tag.localeCompare(b.tag, undefined, { sensitivity: 'base' });
      });
  });

  /** Groups always at the root; ungrouped templates follow at the bottom. */
  readonly tree = computed((): FlowTemplateTree => buildFlowTemplateTree(this.catalogGroups()));

  readonly allGroupsExpanded = computed(() => {
    const groups = this.tree().groups;
    if (groups.length === 0)
      return false;
    const collapsed = this.collapsedGroupIds();
    return groups.every((group) => !collapsed.has(group.id));
  });

  readonly visibleIds = computed(() => {
    const ids: string[] = [];
    const tree = this.tree();
    for (const group of tree.groups) {
      ids.push(group.id);
      if (this.isGroupExpanded(group.id)) {
        for (const child of group.children)
          ids.push(child.id);
      }
    }
    for (const leaf of tree.ungrouped)
      ids.push(leaf.id);
    return ids;
  });

  openPanel(): void {
    this.panelOpen.set(true);
  }

  closePanel(): void {
    this.panelOpen.set(false);
    this.renamingId.set(null);
    this.renamingGroup.set(null);
    this.clearSelection();
    this.endDrag();
  }

  setSearch(value: string): void {
    this.search.set(value);
  }

  setSort(value: FlowTemplateSort): void {
    this.sort.set(value);
  }

  cycleSort(): void {
    this.sort.update((current) => (current === 'manual' ? 'name' : 'manual'));
  }

  toggleTagFilter(tag: string): void {
    const key = tag.trim();
    if (!key)
      return;
    this.tagFilters.update((current) => {
      const next = new Set(current);
      if (next.has(key))
        next.delete(key);
      else
        next.add(key);
      return [...next];
    });
  }

  clearTagFilters(): void {
    this.tagFilters.set([]);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  isGroupExpanded(id: string): boolean {
    return !this.collapsedGroupIds().has(id);
  }

  toggleGroupExpanded(id: string): void {
    this.collapsedGroupIds.update((set) => {
      const next = new Set(set);
      if (next.has(id))
        next.delete(id);
      else
        next.add(id);
      return next;
    });
  }

  setGroupExpanded(id: string, expanded: boolean): void {
    this.collapsedGroupIds.update((set) => {
      const next = new Set(set);
      if (expanded)
        next.delete(id);
      else
        next.add(id);
      return next;
    });
  }

  expandAll(): void {
    this.collapsedGroupIds.set(new Set());
  }

  collapseAll(): void {
    this.collapsedGroupIds.set(new Set(this.tree().groups.map((group) => group.id)));
  }

  toggleExpandAll(): void {
    if (this.allGroupsExpanded()) {
      this.collapseAll();
      return;
    }
    this.expandAll();
  }

  hydrateFromSession(sidebar: SessionFlowTemplatesSidebar | null | undefined): void {
    const next = sidebar ?? DEFAULT_FLOW_TEMPLATES_SIDEBAR;
    this.panelOpen.set(next.panelOpen);
    this.search.set(next.search);
    this.sort.set(next.sort === 'name' ? 'name' : 'manual');
    this.tagFilters.set([...next.tags]);
    this.collapsedGroupIds.set(new Set(next.collapsedGroupIds));
    this.renamingId.set(null);
    this.renamingGroup.set(null);
    this.clearSelection();
    this.endDrag();
  }

  sessionPatch(): SessionFlowTemplatesSidebar {
    return {
      panelOpen: this.panelOpen(),
      search: this.search(),
      sort: this.sort(),
      tags: [...this.tagFilters()],
      collapsedGroupIds: [...this.collapsedGroupIds()],
    };
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
    const ids = this.visibleIds().filter((id) => !parseFlowTemplateGroupNodeId(id));
    this.selectedIds.set(ids);
    this.selectionAnchorId.set(ids[0] ?? null);
  }

  clearSelection(): void {
    const next = emptySelection();
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);
  }

  /**
   * Ids that should move with a drag starting on `sourceId`.
   * Keeps multi-selection when the source is already selected; otherwise selects only it.
   */
  dragIdsFor(sourceId: string): readonly string[] {
    const selected = this.selectedIds();
    if (selected.includes(sourceId)) {
      return flattenFlowTemplateTreeRows(this.tree(), () => true)
        .map((row) => row.id)
        .filter((id) => selected.includes(id));
    }
    this.selectedIds.set([sourceId]);
    this.selectionAnchorId.set(sourceId);
    return [sourceId];
  }

  beginDrag(node: FlowTemplateTreeNode, ids: readonly string[] = [node.id]): void {
    this.dragNode.set(node);
    this.dragIds.set(ids.length > 0 ? ids : [node.id]);
    this.dropTarget.set(null);
  }

  setDropTarget(slot: DropSlot | null): void {
    this.dropTarget.set(slot);
  }

  endDrag(): void {
    this.dragNode.set(null);
    this.dragIds.set([]);
    this.dropTarget.set(null);
  }

  async commitDrop(): Promise<string | null> {
    const dragged = this.dragNode();
    const slot = this.dropTarget();
    const ids = this.dragIds().length > 0 ? this.dragIds() : dragged ? [dragged.id] : [];
    this.endDrag();
    if (!dragged || !slot || slot.denied || ids.length === 0)
      return null;

    const groupIds = ids.filter((id) => !!parseFlowTemplateGroupNodeId(id));
    const templateIds = ids.filter((id) => !parseFlowTemplateGroupNodeId(id));

    // Mixed group + template selection is never a valid drop.
    if (groupIds.length > 0 && templateIds.length > 0)
      return null;

    if (groupIds.length > 0) {
      if (slot.parentId !== FLOW_TEMPLATES_ROOT_ID)
        return null;
      const maxGroupIndex = this.tree().groups.length;
      await this.reorderGroups(groupIds, Math.min(slot.index, maxGroupIndex));
      return dragged.id;
    }

    if (slot.mode === 'into') {
      const tag = parseFlowTemplateGroupNodeId(slot.folderId ?? '') ?? '';
      await this.moveTemplates(templateIds, tag, Number.MAX_SAFE_INTEGER);
      return dragged.id;
    }

    if (slot.parentId === FLOW_TEMPLATES_ROOT_ID) {
      const leafIndex = ungroupedIndexFromRootSlot(slot.index, this.tree().groups.length);
      await this.moveTemplates(templateIds, '', leafIndex);
      return dragged.id;
    }

    const tag = parseFlowTemplateGroupNodeId(slot.parentId) ?? '';
    await this.moveTemplates(templateIds, tag, slot.index);
    return dragged.id;
  }

  /** Resolve a template by id from user list, then remaining builtins. */
  findTemplate(id: string): FlowGraphTemplate | null {
    const user = this.userTemplates().find((item) => item.id === id);
    if (user)
      return user;
    if (this.hiddenBuiltinIds().includes(id))
      return null;
    return FLOW_GRAPH_TEMPLATES.find((item) => item.id === id) ?? null;
  }

  openTemplate(id: string): void {
    const template = this.findTemplate(id);
    if (!template)
      return;
    this.workbench.openFromFlowTemplate(template.id, template.name);
  }

  private async persist(patch: {
    readonly templates?: readonly FlowGraphTemplate[];
    readonly hiddenBuiltinIds?: readonly string[];
    readonly groups?: readonly string[];
  }): Promise<void> {
    await this.desktop.saveFlowTemplates({
      templates: patch.templates ?? this.userTemplates(),
      hiddenBuiltinIds: patch.hiddenBuiltinIds ?? this.hiddenBuiltinIds(),
      groups: patch.groups ?? this.savedGroups(),
    });
  }

  async save(template: FlowGraphTemplate): Promise<string> {
    const next: FlowGraphTemplate = {
      ...template,
      id: template.id || newFlowTemplateId(),
      tags: normalizeFlowTemplateTags(template.tags),
      builtin: undefined,
    };
    const current = this.userTemplates();
    const index = current.findIndex((item) => item.id === next.id);
    const templates =
      index >= 0
        ? current.map((item, i) => (i === index ? next : item))
        : [...current, next];
    const groups = normalizeFlowTemplateTags([
      ...this.savedGroups(),
      ...(next.tags[0] ? [next.tags[0]] : []),
    ]);
    await this.persist({ templates, groups });
    this.workbench.renameFlowTemplateTabs(next.id, next.name);
    return next.id;
  }

  async createShell(name = 'New template', group?: string | null): Promise<string> {
    const tags = group && group !== FLOW_TEMPLATE_UNTAGGED ? [group] : [];
    const template = { ...emptyFlowGraphTemplate(name), tags };
    await this.save(template);
    this.openPanel();
    if (group)
      this.setGroupExpanded(flowTemplateGroupNodeId(group), true);
    this.selectedIds.set([template.id]);
    this.selectionAnchorId.set(template.id);
    this.renamingId.set(template.id);
    this.openTemplate(template.id);
    return template.id;
  }

  async createGroup(name = 'New group'): Promise<string> {
    const tag = name.trim() || 'New group';
    const groups = normalizeFlowTemplateTags([...this.savedGroups(), tag]);
    await this.persist({ groups });
    this.setGroupExpanded(flowTemplateGroupNodeId(tag), true);
    this.renamingGroup.set(tag);
    return tag;
  }

  async reorderGroup(tag: string, index: number): Promise<void> {
    const named = this.tree().groups.map((group) => group.tag);
    const from = named.findIndex((item) => item.toLowerCase() === tag.toLowerCase());
    if (from < 0)
      return;
    const next = [...named];
    const [moved] = next.splice(from, 1);
    if (!moved)
      return;
    let insert = index;
    if (from < insert)
      insert -= 1;
    // Keep groups ahead of ungrouped root leaves.
    insert = Math.max(0, Math.min(next.length, insert));
    next.splice(insert, 0, moved);
    await this.persist({ groups: normalizeFlowTemplateTags(next) });
  }

  /**
   * Reorders multiple groups. Prefers inserting them as one contiguous block;
   * falls back to sequential single-group moves when that is not possible.
   */
  async reorderGroups(groupIds: readonly string[], targetIndex: number): Promise<void> {
    const unique = [...new Set(groupIds)];
    if (unique.length === 0)
      return;
    if (unique.length === 1) {
      const tag = parseFlowTemplateGroupNodeId(unique[0]!);
      if (tag)
        await this.reorderGroup(tag, targetIndex);
      return;
    }

    const named = this.tree().groups.map((group) => group.tag);
    const moving: string[] = [];
    const movingKeys = new Set<string>();
    for (const id of unique) {
      const parsed = parseFlowTemplateGroupNodeId(id);
      if (!parsed)
        continue;
      const key = parsed.toLowerCase();
      if (movingKeys.has(key))
        continue;
      const found = named.find((item) => item.toLowerCase() === key);
      if (!found)
        continue;
      movingKeys.add(key);
      moving.push(found);
    }
    if (moving.length === 0)
      return;
    if (moving.length === 1) {
      await this.reorderGroup(moving[0]!, targetIndex);
      return;
    }

    const indices = moving
      .map((tag) => named.findIndex((item) => item.toLowerCase() === tag.toLowerCase()))
      .filter((index) => index >= 0);

    // Prefer a contiguous block insert. Sequential is the fallback when resolution fails.
    if (indices.length === moving.length) {
      const next = named.filter((tag) => !movingKeys.has(tag.toLowerCase()));
      const removedBefore = indices.filter((index) => index < targetIndex).length;
      const insert = Math.max(0, Math.min(next.length, targetIndex - removedBefore));
      next.splice(insert, 0, ...moving);
      await this.persist({ groups: normalizeFlowTemplateTags(next) });
      return;
    }

    let insert = targetIndex;
    for (const tag of moving) {
      await this.reorderGroup(tag, insert);
      insert += 1;
    }
  }

  async moveTemplate(id: string, targetTag: string, index: number): Promise<void> {
    await this.moveTemplates([id], targetTag, index);
  }

  /** Moves templates as one ordered block into a group (or ungrouped root). */
  async moveTemplates(ids: readonly string[], targetTag: string, index: number): Promise<void> {
    const unique = [...new Set(ids)].filter((id) => !parseFlowTemplateGroupNodeId(id));
    if (unique.length === 0)
      return;

    const orderedIds = flattenFlowTemplateTreeRows(this.tree(), () => true)
      .map((row) => row.id)
      .filter((id) => unique.includes(id));
    const sources = orderedIds
      .map((id) => this.findTemplate(id))
      .filter((item): item is FlowGraphTemplate => !!item);
    if (sources.length === 0)
      return;

    const normalizedTarget =
      !targetTag || targetTag === FLOW_TEMPLATE_UNTAGGED ? '' : targetTag;
    const targetKey = normalizedTarget.toLowerCase();
    const movingIds = new Set(sources.map((item) => item.id));

    const updatedSources = sources.map((source) => {
      const primary = normalizedTarget ? [normalizedTarget] : [];
      const secondary = source.tags.filter(
        (tag) => tag.toLowerCase() !== (source.tags[0] ?? '').toLowerCase(),
      );
      return {
        ...source,
        tags: normalizeFlowTemplateTags([...primary, ...secondary]),
        builtin: undefined,
      } satisfies FlowGraphTemplate;
    });

    const withoutMoving = this.userTemplates().filter((item) => !movingIds.has(item.id));
    const inTarget: FlowGraphTemplate[] = [];
    const rest: FlowGraphTemplate[] = [];
    for (const item of withoutMoving) {
      const tag = (item.tags[0] ?? '').toLowerCase();
      if (tag === targetKey)
        inTarget.push(item);
      else
        rest.push(item);
    }

    const tree = this.tree();
    let removedBefore = 0;
    if (normalizedTarget) {
      const group = tree.groups.find((item) => item.tag.toLowerCase() === targetKey);
      if (group) {
        for (let i = 0; i < Math.min(index, group.children.length); i += 1) {
          if (movingIds.has(group.children[i]!.id))
            removedBefore += 1;
        }
      }
    } else {
      for (let i = 0; i < Math.min(index, tree.ungrouped.length); i += 1) {
        if (movingIds.has(tree.ungrouped[i]!.id))
          removedBefore += 1;
      }
    }

    const insertAt = Math.max(0, Math.min(inTarget.length, index - removedBefore));
    inTarget.splice(insertAt, 0, ...updatedSources);

    const byId = new Map<string, FlowGraphTemplate>();
    for (const item of rest)
      byId.set(item.id, item);
    for (const item of inTarget)
      byId.set(item.id, item);

    const ordered: FlowGraphTemplate[] = [];
    const seen = new Set<string>();

    for (const group of tree.groups) {
      if (group.tag.toLowerCase() === targetKey) {
        for (const item of inTarget) {
          if (seen.has(item.id))
            continue;
          seen.add(item.id);
          ordered.push(item);
        }
        continue;
      }
      for (const child of group.children) {
        if (movingIds.has(child.id) || seen.has(child.id))
          continue;
        const next = byId.get(child.id);
        if (!next)
          continue;
        seen.add(child.id);
        ordered.push(next);
      }
    }

    if (!normalizedTarget) {
      for (const item of inTarget) {
        if (seen.has(item.id))
          continue;
        seen.add(item.id);
        ordered.push(item);
      }
    } else {
      for (const leaf of tree.ungrouped) {
        if (movingIds.has(leaf.id) || seen.has(leaf.id))
          continue;
        const next = byId.get(leaf.id);
        if (!next)
          continue;
        seen.add(leaf.id);
        ordered.push(next);
      }
    }

    for (const item of byId.values()) {
      if (seen.has(item.id))
        continue;
      ordered.push(item);
    }

    const groups = normalizeFlowTemplateTags([
      ...this.savedGroups(),
      ...(normalizedTarget ? [normalizedTarget] : []),
    ]);
    await this.persist({ templates: ordered, groups });
  }

  async renameGroup(from: string, to: string): Promise<void> {
    const nextName = to.trim();
    if (!nextName || nextName.toLowerCase() === from.toLowerCase())
      return;
    if (nextName.toLowerCase() === FLOW_TEMPLATE_UNTAGGED.toLowerCase())
      return;

    const groups = normalizeFlowTemplateTags(
      this.savedGroups().map((tag) => (tag.toLowerCase() === from.toLowerCase() ? nextName : tag)),
    );

    const byId = new Map(this.userTemplates().map((item) => [item.id, item] as const));
    for (const item of this.allTemplates()) {
      const primary = item.tags[0] ?? '';
      if (primary.toLowerCase() !== from.toLowerCase())
        continue;
      const tags = normalizeFlowTemplateTags([nextName, ...item.tags.slice(1)]);
      byId.set(item.id, { ...item, tags, builtin: undefined });
    }

    await this.persist({ templates: [...byId.values()], groups });
  }

  async removeGroup(tag: string): Promise<void> {
    const key = tag.toLowerCase();
    const groups = this.savedGroups().filter((item) => item.toLowerCase() !== key);
    const byId = new Map(this.userTemplates().map((item) => [item.id, item]));
    for (const item of this.allTemplates()) {
      const primary = item.tags[0] ?? '';
      if (primary.toLowerCase() !== key)
        continue;
      const tags = normalizeFlowTemplateTags(item.tags.slice(1));
      byId.set(item.id, { ...item, tags, builtin: undefined });
    }
    await this.persist({ templates: [...byId.values()], groups });
  }

  async rename(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed)
      return;
    const source = this.findTemplate(id);
    if (!source)
      return;
    await this.save({ ...source, name: trimmed });
  }

  async setHint(id: string, hint: string): Promise<void> {
    const source = this.findTemplate(id);
    if (!source)
      return;
    await this.save({ ...source, hint });
  }

  async setTags(id: string, tags: readonly string[]): Promise<void> {
    const source = this.findTemplate(id);
    if (!source)
      return;
    await this.save({ ...source, tags: normalizeFlowTemplateTags(tags) });
  }

  async duplicate(id: string): Promise<string> {
    const source = this.findTemplate(id);
    if (!source)
      return '';
    const clone: FlowGraphTemplate = {
      ...source,
      id: newFlowTemplateId(),
      name: `${source.name} copy`,
      builtin: undefined,
    };
    await this.save(clone);
    this.selectedIds.set([clone.id]);
    this.selectionAnchorId.set(clone.id);
    return clone.id;
  }

  async removeMany(ids: readonly string[]): Promise<void> {
    if (ids.length === 0)
      return;
    const removing = new Set(ids);
    const templates = this.userTemplates().filter((item) => !removing.has(item.id));
    const hidden = [
      ...new Set([
        ...this.hiddenBuiltinIds(),
        ...ids.filter((id) => FLOW_GRAPH_TEMPLATES.some((item) => item.id === id)),
      ]),
    ];
    await this.persist({ templates, hiddenBuiltinIds: hidden });
    this.workbench.closeFlowTemplateTabs([...removing]);
    this.selectedIds.set(this.selectedIds().filter((id) => !removing.has(id)));
    this.selectionAnchorId.set(this.selectedIds()[0] ?? null);
  }

  async remove(id: string): Promise<void> {
    await this.removeMany([id]);
  }

  async hideBuiltin(id: string): Promise<void> {
    await this.removeMany([id]);
  }
}
