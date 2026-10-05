import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  collectServiceTreeTags,
  emptyRegressionPackEntry,
  findServiceNode,
  type FlowArtifactFields,
  type RegressionPackEntry,
  type ServiceTreeNode,
} from '@testrix/contracts';
import { TxEmptyStateComponent, TxSelectComponent } from '@testrix/ui';

import { ServiceToolbarComponent } from '../shared/service-toolbar.component';
import type { ServiceSort } from '../services.store';
import {
  buildPickerRows,
  collectFolderIds,
  collectFolderOptions,
  collectFlowIdsFromTree,
  filterFlowTree,
  flowCheckState,
  folderCheckStateFromEntries,
  orderRegressionEntries,
  scenarioCheckState,
  sortFlowTree,
  syncEntriesFromLinkedFolder,
  toggleFolderEntries,
  toggleFlowEntry,
  toggleScenarioEntry,
  type RgPickerCheckState,
  type RgPickerRow,
} from './rg-flow-picker-tree';

@Component({
  selector: 'tx-rg-pack-panel',
  standalone: true,
  imports: [
    TxEmptyStateComponent,
    TxSelectComponent,
    ServiceToolbarComponent,
  ],
  templateUrl: './rg-pack-panel.component.html',
  styleUrl: './rg-pack-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgPackPanelComponent {
  readonly entries = input<readonly RegressionPackEntry[]>([]);
  readonly flowTree = input<readonly ServiceTreeNode<FlowArtifactFields>[]>([]);
  readonly linkedFolderId = input<string | null>(null);

  readonly entriesChange = output<readonly RegressionPackEntry[]>();
  readonly linkedFolderIdChange = output<string | null>();

  readonly search = signal('');
  readonly sort = signal<ServiceSort>('manual');
  readonly tagFilters = signal<readonly string[]>([]);
  readonly expandedIds = signal<readonly string[]>([]);

  readonly linkedFlowCount = computed(
    () => new Set(this.entries().map((entry) => entry.flowId)).size,
  );

  readonly availableTags = computed(() => collectServiceTreeTags(this.flowTree()));

  readonly displayTree = computed(() =>
    sortFlowTree(filterFlowTree(this.flowTree(), this.search(), this.tagFilters()), this.sort()),
  );

  readonly rows = computed((): readonly RgPickerRow[] =>
    buildPickerRows({
      nodes: this.displayTree(),
      expandedIds: new Set(this.expandedIds()),
    }),
  );

  readonly folderOptions = computed(() => [
    { value: '', label: 'No folder sync' },
    ...collectFolderOptions(this.flowTree()),
  ]);

  readonly linkedFolderName = computed(() => {
    const id = this.linkedFolderId();
    if (!id)
      return null;
    const node = findServiceNode(this.flowTree(), id);
    return node?.kind === 'folder' ? node.name : null;
  });

  readonly emptyMessage = computed(() => {
    if (this.flowTree().length === 0)
      return 'No flows yet. Create a flow first, then link it here.';
    if (this.search().trim() || this.tagFilters().length > 0)
      return 'No flows or folders match your search or filters.';
    return 'No flows to show.';
  });

  readonly expandableIds = computed(() => [
    ...collectFolderIds(this.displayTree()),
    ...collectFlowIdsFromTree(this.displayTree()),
  ]);

  readonly allExpanded = computed(() => {
    const ids = this.expandableIds();
    if (ids.length === 0)
      return false;
    const expanded = new Set(this.expandedIds());
    return ids.every((id) => expanded.has(id));
  });

  handleSearch(value: string): void {
    this.search.set(value);
  }

  handleCycleSort(): void {
    const current = this.sort();
    const next: ServiceSort =
      current === 'manual' ? 'name' : current === 'name' ? 'updated' : 'manual';
    this.sort.set(next);
  }

  handleToggleTag(tag: string): void {
    const key = tag.trim();
    if (!key)
      return;
    const current = this.tagFilters();
    this.tagFilters.set(
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  handleClearTags(): void {
    this.tagFilters.set([]);
  }

  handleExpandToggle(): void {
    this.handleExpandAll(!this.allExpanded());
  }

  handleExpandAll(expand: boolean): void {
    if (!expand) {
      this.expandedIds.set([]);
      return;
    }
    this.expandedIds.set([...this.expandableIds()]);
  }

  handleToggleExpand(rowId: string): void {
    const current = this.expandedIds();
    this.expandedIds.set(
      current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId],
    );
  }

  isExpanded(id: string): boolean {
    return this.expandedIds().includes(id);
  }

  depthMarks(depth: number): readonly number[] {
    return Array.from({ length: Math.max(0, depth) }, (_, index) => index);
  }

  handleRowClick(row: RgPickerRow): void {
    if (row.kind === 'folder') {
      this.emitEntries(toggleFolderEntries(this.entries(), row.node));
      return;
    }
    if (row.kind === 'flow') {
      this.emitEntries(toggleFlowEntry(this.entries(), row.id));
      return;
    }
    const flow = findServiceNode(this.flowTree(), row.flowId);
    if (!flow || flow.kind !== 'artifact')
      return;
    this.emitEntries(toggleScenarioEntry(this.entries(), flow, row.scenarioId));
  }

  handleClear(): void {
    this.entriesChange.emit([]);
  }

  handleSelectVisible(): void {
    const visible = collectFlowIdsFromTree(this.displayTree());
    const linked = new Set(this.entries().map((entry) => entry.flowId));
    let next = [...this.entries()];
    for (const flowId of visible) {
      if (linked.has(flowId))
        continue;
      next = [...next, emptyRegressionPackEntry(flowId, null)];
      linked.add(flowId);
    }
    this.emitEntries(next);
  }

  handleLinkedFolderChange(value: string): void {
    const next = value.trim() || null;
    this.linkedFolderIdChange.emit(next);
    if (!next)
      return;
    this.emitEntries(syncEntriesFromLinkedFolder(this.entries(), next, this.flowTree()));
  }

  handleUnlinkFolder(): void {
    this.linkedFolderIdChange.emit(null);
  }

  checkState(row: RgPickerRow): RgPickerCheckState {
    if (row.kind === 'folder')
      return folderCheckStateFromEntries(row.node, this.entries());
    if (row.kind === 'flow')
      return flowCheckState(this.entries(), row.node);
    return scenarioCheckState(this.entries(), row.flowId, row.scenarioId);
  }

  private emitEntries(entries: readonly RegressionPackEntry[]): void {
    this.entriesChange.emit(orderRegressionEntries(this.flowTree(), entries));
  }
}
