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

import { CollectionsService } from '@app/core/collections/collections.service';
import { findCollectionNode } from '@app/features/shell/collections/collection-tree.mutations';
import { collectFolderIdsInSubtree } from '@app/features/shell/collections/collection-tree.expand';
import type { CollectionTreeKind, CollectionTreeNode, CollectionTreeNodeMeta } from '@app/features/shell/collections/collection-tree.types';
import { mergeTxTreeConfig } from '@app/shared/components/tx-tree/tx-tree.config';
import { TxTreeComponent } from '@app/shared/components/tx-tree/tx-tree.component';
import type { TxTreeNodeClickEvent } from '@app/shared/components/tx-tree/tx-tree.types';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { collectFolderAncestorIds } from '@app/features/shell/workspace/workspace-sidebar-selection';

import { collectionRequestLabel } from '../load-test-workspace-tab/collect-collection-requests';
import { applyLtTargetTreeView } from '../load-test-workspace-tab/lt-target-tree.view';

const SEARCH_DEBOUNCE_MS = 100;

@Component({
  selector: 'app-ts-flow-collection-request-picker',
  standalone: true,
  imports: [TxTreeComponent, WorkspaceSidebarPanelShellComponent],
  templateUrl: './ts-flow-collection-request-picker.component.html',
  styleUrl: './ts-flow-collection-request-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowCollectionRequestPickerComponent {
  private readonly collectionsService = inject(CollectionsService);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly tree = viewChild(TxTreeComponent);

  readonly collectionRequestId = input<string | undefined>(undefined);

  readonly collectionRequestIdChange = output<string | undefined>();

  protected readonly searchQuery = signal('');
  protected readonly searchQueryDebounced = signal('');
  protected readonly expandedIds = signal<string[]>([]);
  protected readonly allExpanded = signal(true);

  private readonly expandedSnapshotBeforeSearch = signal<string[] | null>(null);
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly collectionNodes = computed(() => this.collectionsService.nodes());

  protected readonly displayNodes = computed(() =>
    applyLtTargetTreeView(this.collectionNodes(), {
      query: this.searchQueryDebounced(),
      filter: 'all',
      sortBy: 'order',
    }),
  );

  protected readonly treeSelectionIds = computed(() => {
    const id = this.collectionRequestId();
    return id ? [id] : [];
  });

  protected readonly selectedLabel = computed(() =>
    collectionRequestLabel(this.collectionNodes(), this.collectionRequestId()),
  );

  protected readonly emptyStateMessage = computed(() => {
    if (this.collectionNodes().length === 0) {
      return 'No collection requests yet. Add requests in Collections, then pick one here.';
    }
    if (this.searchQueryDebounced().trim()) {
      return 'No requests match your search.';
    }
    return 'No collection requests to show.';
  });

  protected readonly treeConfig = computed(() =>
    mergeTxTreeConfig<CollectionTreeNodeMeta>({
      ariaLabel: 'Collection requests',
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
      const requestId = this.collectionRequestId();
      if (!requestId || this.searchQuery().trim()) {
        return;
      }
      untracked(() => {
        const ancestors = collectFolderAncestorIds(
          this.collectionNodes(),
          requestId,
          findCollectionNode,
        );
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

    this.collectionRequestIdChange.emit(event.node.id);
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
