import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { DYNAMIC_VARIABLES } from '@shared/dynamic-variables';
import {
  createDefaultLoadTestManualTarget,
  resolveLoadTestTargetSource,
  type LoadTestManualTarget,
  type LoadTestTargetSource,
} from '@shared/testing';

import { CollectionsService } from '@app/core/collections/collections.service';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxContextMenuComponent } from '@app/shared/components/tx-context-menu/tx-context-menu.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { mergeTxTreeConfig } from '@app/shared/components/tx-tree/tx-tree.config';
import { TxTreeComponent } from '@app/shared/components/tx-tree/tx-tree.component';
import type { TxTreeNodeClickEvent } from '@app/shared/components/tx-tree/tx-tree.types';
import { WorkspacePanelToolbarActionsDirective } from '@app/features/shell/workspace/workspace-panel-toolbar-actions.directive';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { collectFolderAncestorIds } from '@app/features/shell/workspace/workspace-sidebar-selection';

import { findCollectionNode } from '@app/features/shell/collections/collection-tree.mutations';
import { collectFolderIdsInSubtree } from '@app/features/shell/collections/collection-tree.expand';
import type { CollectionTreeKind, CollectionTreeNode, CollectionTreeNodeMeta } from '@app/features/shell/collections/collection-tree.types';

import { collectionRequestLabel } from './collect-collection-requests';
import { LtTabManualTargetPanelComponent } from './lt-tab-manual-target-panel.component';
import { LOAD_TEST_TARGET_SOURCE_OPTIONS } from './load-test-target-source';
import {
  buildLtTargetFilterMenuItems,
  buildLtTargetSortMenuItems,
} from './lt-target-sidebar-menus';
import { applyLtTargetTreeView } from './lt-target-tree.view';
import {
  DEFAULT_LT_TARGET_TREE_FILTER,
  DEFAULT_LT_TARGET_TREE_SORT_BY,
  type LtTargetTreeFilter,
  type LtTargetTreeSortBy,
} from './lt-target-tree.types';

const SEARCH_DEBOUNCE_MS = 100;

@Component({
  selector: 'app-lt-tab-target-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxButtonComponent,
    TxContextMenuComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxTreeComponent,
    LtTabManualTargetPanelComponent,
    WorkspaceSidebarPanelShellComponent,
    WorkspacePanelToolbarActionsDirective,
  ],
  templateUrl: './lt-tab-target-panel.component.html',
  styleUrl: './lt-tab-target-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtTabTargetPanelComponent {
  private readonly collectionsService = inject(CollectionsService);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly tree = viewChild(TxTreeComponent);

  readonly targetSource = input<LoadTestTargetSource>('collection');
  readonly targetRequestId = input<string | undefined>(undefined);
  readonly manualTarget = input<LoadTestManualTarget | undefined>(undefined);

  readonly targetSourceChange = output<LoadTestTargetSource>();
  readonly targetRequestIdChange = output<string | undefined>();
  readonly manualTargetChange = output<LoadTestManualTarget>();
  readonly openRequest = output<void>();

  protected readonly targetSourceOptions = LOAD_TEST_TARGET_SOURCE_OPTIONS;
  protected readonly variableCatalog = computed(() => DYNAMIC_VARIABLES);

  protected readonly resolvedTargetSource = computed(() =>
    resolveLoadTestTargetSource({
      targetSource: this.targetSource(),
      targetRequestId: this.targetRequestId(),
    }),
  );

  protected readonly searchQuery = signal('');
  protected readonly searchQueryDebounced = signal('');
  protected readonly treeFilter = signal<LtTargetTreeFilter>(DEFAULT_LT_TARGET_TREE_FILTER);
  protected readonly treeSortBy = signal<LtTargetTreeSortBy>(DEFAULT_LT_TARGET_TREE_SORT_BY);
  protected readonly expandedIds = signal<string[]>([]);
  protected readonly allExpanded = signal(true);

  protected readonly filterMenuOpen = signal(false);
  protected readonly sortMenuOpen = signal(false);
  protected readonly filterMenuPosition = signal({ x: 0, y: 0 });
  protected readonly sortMenuPosition = signal({ x: 0, y: 0 });

  private readonly expandedSnapshotBeforeSearch = signal<string[] | null>(null);
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly collectionNodes = computed(() => this.collectionsService.nodes());

  protected readonly displayNodes = computed(() =>
    applyLtTargetTreeView(this.collectionNodes(), {
      query: this.searchQueryDebounced(),
      filter: this.treeFilter(),
      sortBy: this.treeSortBy(),
    }),
  );

  protected readonly treeSelectionIds = computed(() => {
    const id = this.targetRequestId();
    return id ? [id] : [];
  });

  protected readonly selectedTargetLabel = computed(() =>
    collectionRequestLabel(this.collectionNodes(), this.targetRequestId()),
  );

  protected readonly filterMenuItems = computed(() =>
    buildLtTargetFilterMenuItems(this.treeFilter()),
  );

  protected readonly sortMenuItems = computed(() => buildLtTargetSortMenuItems(this.treeSortBy()));

  protected readonly filterToolbarActive = computed(() => this.treeFilter() !== 'all');
  protected readonly sortToolbarActive = computed(() => this.treeSortBy() !== 'order');

  protected readonly emptyStateMessage = computed(() => {
    if (this.collectionNodes().length === 0) {
      return 'No collection requests yet. Add requests in Collections, then pick one here.';
    }
    if (this.searchQueryDebounced().trim()) {
      return 'No requests match your search.';
    }
    if (this.treeFilter() === 'requests') {
      return 'No HTTP requests found in collections.';
    }
    return 'No collection items to show.';
  });

  protected readonly treeConfig = computed(() =>
    mergeTxTreeConfig<CollectionTreeNodeMeta>({
      ariaLabel: 'Collection requests for load test target',
      selection: {
        canSelect: (ctx) => this.resolveKind(ctx.node) === 'request',
      },
      expansion: {
        expandOnClick: false,
        expandFolderOnDrag: false,
        expandFolderOnDrop: false,
      },
      visual: {
        showDragHandle: false,
        animateMove: false,
        animateExpand: true,
      },
      sort: {
        siblingSort: 'orderThenPriority',
        foldersFirst: true,
      },
      drag: {
        canDrag: () => false,
      },
      drop: {
        canDrop: () => false,
      },
    }),
  );

  constructor() {
    effect(() => {
      const query = this.searchQueryDebounced().trim();
      if (query) {
        if (this.expandedSnapshotBeforeSearch() === null) {
          this.expandedSnapshotBeforeSearch.set([...this.expandedIds()]);
        }
        untracked(() => {
          this.applyExpandedIds(collectFolderIdsInSubtree(this.displayNodes()));
        });
        return;
      }

      const snapshot = this.expandedSnapshotBeforeSearch();
      if (snapshot !== null) {
        this.expandedSnapshotBeforeSearch.set(null);
        untracked(() => {
          this.applyExpandedIds(snapshot);
        });
      }
    });

    effect(() => {
      const targetId = this.targetRequestId();
      if (!targetId || this.searchQuery().trim()) {
        return;
      }
      untracked(() => {
        const ancestors = collectFolderAncestorIds(this.collectionNodes(), targetId, findCollectionNode);
        if (ancestors.length === 0) {
          return;
        }
        this.applyExpandedIds([...new Set([...this.expandedIds(), ...ancestors])]);
      });
    });
  }

  protected handleSearch(query: string): void {
    this.searchQuery.set(query);
    if (this.searchDebounceTimer !== null) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.searchDebounceTimer = null;
      this.searchQueryDebounced.set(query);
    }, SEARCH_DEBOUNCE_MS);
  }

  protected handleExpandAll(expanded: boolean): void {
    this.allExpanded.set(expanded);
    this.applyExpandedIds(expanded ? collectFolderIdsInSubtree(this.displayNodes()) : []);
  }

  protected handleExpandedChange(ids: readonly string[]): void {
    this.applyExpandedIds([...ids]);
  }

  protected handleNodeClick(event: TxTreeNodeClickEvent<CollectionTreeNodeMeta>): void {
    const kind = this.resolveKind(event.node);

    if (kind === 'folder') {
      if (!event.node.children?.length) {
        return;
      }
      const isExpanded = this.expandedIds().includes(event.nodeId);
      const next = isExpanded
        ? this.expandedIds().filter((id) => id !== event.nodeId)
        : [...this.expandedIds(), event.nodeId];
      this.applyExpandedIds(next);
      return;
    }

    if (kind !== 'request') {
      return;
    }
    this.targetRequestIdChange.emit(event.node.id);
  }

  protected handleClearTarget(): void {
    this.targetRequestIdChange.emit(undefined);
  }

  protected handleTargetSourceChange(source: LoadTestTargetSource): void {
    if (source === this.resolvedTargetSource()) {
      return;
    }
    this.targetSourceChange.emit(source);
    if (source === 'manual') {
      this.targetRequestIdChange.emit(undefined);
      if (!this.manualTarget()) {
        this.manualTargetChange.emit(createDefaultLoadTestManualTarget());
      }
      return;
    }
    this.targetRequestIdChange.emit(undefined);
  }

  protected handleFilterToolbarClick(event: MouseEvent): void {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.filterMenuPosition.set({ x: rect.left, y: rect.bottom + 4 });
    this.sortMenuOpen.set(false);
    this.filterMenuOpen.set(true);
  }

  protected handleSortToolbarClick(event: MouseEvent): void {
    event.stopPropagation();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.sortMenuPosition.set({ x: rect.left, y: rect.bottom + 4 });
    this.filterMenuOpen.set(false);
    this.sortMenuOpen.set(true);
  }

  protected handleFilterMenuSelect(itemId: string): void {
    this.filterMenuOpen.set(false);
    if (itemId === 'all' || itemId === 'requests') {
      this.treeFilter.set(itemId);
    }
  }

  protected handleSortMenuSelect(itemId: string): void {
    this.sortMenuOpen.set(false);
    if (itemId === 'order' || itemId === 'name') {
      this.treeSortBy.set(itemId);
    }
  }

  protected handleFilterMenuClosed(): void {
    this.filterMenuOpen.set(false);
  }

  protected handleSortMenuClosed(): void {
    this.sortMenuOpen.set(false);
  }

  private applyExpandedIds(next: readonly string[]): void {
    this.expandedIds.set([...next]);
    this.tree()?.syncExpansionFromInput(next);
    const folderIds = collectFolderIdsInSubtree(this.displayNodes());
    this.allExpanded.set(folderIds.length > 0 && folderIds.every((id) => next.includes(id)));
    this.cdr.markForCheck();
  }

  private resolveKind(node: CollectionTreeNode): CollectionTreeKind {
    if (node.data?.kind === 'folder' || node.data?.kind === 'request' || node.data?.kind === 'websocket') {
      return node.data.kind;
    }
    return node.kind === 'folder' ? 'folder' : 'request';
  }
}
