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

import type { CollectionRequestBody } from '@shared/config';
import {
  buildCollectionEnvironmentDropdownOptions,
  environmentIdFromDropdownValue,
  toEnvironmentDropdownValue,
} from '@shared/config';
import {
  createDefaultLoadTestManualTarget,
  createDefaultRequestStepConfig,
  flowRequestStepCollectionBody,
  patchRequestStepFromCollectionBody,
  type LoadTestManualTarget,
  type LoadTestTargetSource,
} from '@shared/testing';

import { CollectionsService } from '@app/core/collections/collections.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { findCollectionNode } from '@app/features/shell/collections/collection-tree.mutations';
import { collectFolderIdsInSubtree } from '@app/features/shell/collections/collection-tree.expand';
import type { CollectionTreeKind, CollectionTreeNode, CollectionTreeNodeMeta } from '@app/features/shell/collections/collection-tree.types';
import { RequestTabBodyPanelComponent } from '@app/features/shell/workspace/request-workspace-tab/request-tab-body-panel.component';
import { WorkspacePanelToolbarActionsDirective } from '@app/features/shell/workspace/workspace-panel-toolbar-actions.directive';
import { WorkspaceSectionNavSliderDirective } from '@app/features/shell/workspace/workspace-section-nav-slider.directive';
import { collectFolderAncestorIds } from '@app/features/shell/workspace/workspace-sidebar-selection';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { TxBannerComponent } from '@app/shared/components/feedback/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxContextMenuComponent } from '@app/shared/components/overlays/tx-context-menu/tx-context-menu.component';
import { TxDropdownComponent } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/forms/tx-icon/tx-icon.component';
import { TxKeyValueListComponent } from '@app/shared/components/data/tx-key-value-list/tx-key-value-list.component';
import type { TxKeyValueRow } from '@app/shared/components/data/tx-key-value-list/tx-key-value-list.types';
import { TxVariableInputComponent } from '@app/shared/components/editors/tx-variable-input/tx-variable-input.component';
import { mergeTxTreeConfig } from '@app/shared/components/data/tx-tree/tx-tree.config';
import { TxTreeComponent } from '@app/shared/components/data/tx-tree/tx-tree.component';
import type { TxTreeNodeClickEvent } from '@app/shared/components/data/tx-tree/tx-tree.types';

import {
  FLOW_REQUEST_STEP_NAV_ITEMS,
  type FlowRequestStepSection,
} from '../test-suite-workspace-tab/flow-request-step-sections';
import { FLOW_STEP_HTTP_METHOD_OPTIONS } from '../test-suite-workspace-tab/flow-step-editor-options';
import { kvPairsToRows, rowsToKvPairs } from '../test-suite-workspace-tab/flow-step-kv';

import { collectionRequestLabel } from './collect-collection-requests';
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
    RequestTabBodyPanelComponent,
    TxBannerComponent,
    TxButtonComponent,
    TxContextMenuComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxKeyValueListComponent,
    TxTreeComponent,
    TxVariableInputComponent,
    WorkspaceSectionNavSliderDirective,
    WorkspaceSidebarPanelShellComponent,
    WorkspacePanelToolbarActionsDirective,
  ],
  templateUrl: './lt-tab-target-panel.component.html',
  styleUrl: './lt-tab-target-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtTabTargetPanelComponent {
  private readonly collectionsService = inject(CollectionsService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly tree = viewChild(TxTreeComponent);

  readonly targetSource = input<LoadTestTargetSource>('collection');
  readonly targetRequestId = input<string | undefined>(undefined);
  readonly manualTarget = input<LoadTestManualTarget | undefined>(undefined);
  readonly environmentId = input<string | null | undefined>(undefined);

  readonly targetSourceChange = output<LoadTestTargetSource>();
  readonly targetRequestIdChange = output<string | undefined>();
  readonly manualTargetChange = output<LoadTestManualTarget>();
  readonly environmentIdChange = output<string | null>();
  readonly openRequest = output<void>();

  protected readonly targetSourceOptions: readonly TxDropdownOption<LoadTestTargetSource>[] = [
    { value: 'collection', label: 'Existing request' },
    { value: 'manual', label: 'Manual request' },
  ];
  protected readonly httpMethodOptions = FLOW_STEP_HTTP_METHOD_OPTIONS;
  protected readonly navItems = FLOW_REQUEST_STEP_NAV_ITEMS;
  protected readonly activeSection = signal<FlowRequestStepSection>('params');

  protected readonly isManual = computed(() => this.targetSource() === 'manual');

  protected readonly sourceHint = computed(() =>
    this.isManual()
      ? 'Build the HTTP request this load test will send.'
      : 'Pick an existing collection request to run this load test against.',
  );

  protected readonly environmentOptions = computed(() =>
    buildCollectionEnvironmentDropdownOptions(this.environmentsService.environments(), {
      inheritLabel: this.isManual() ? 'Default (no environment)' : 'Inherit from request',
    }),
  );

  protected readonly environmentDropdownValue = computed(() =>
    toEnvironmentDropdownValue(this.environmentId()),
  );

  protected readonly environmentPlaceholder = computed(() =>
    this.isManual() ? 'No environment' : 'Inherit from request',
  );

  protected readonly needsManualUrl = computed(
    () => this.isManual() && !this.manual().url.trim(),
  );

  protected readonly collectionBody = computed(() =>
    flowRequestStepCollectionBody({
      ...createDefaultRequestStepConfig(),
      ...this.manual(),
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

  /** Returns the current manual target, filling defaults when none is saved yet. */
  protected manual(): LoadTestManualTarget {
    return this.manualTarget() ?? createDefaultLoadTestManualTarget();
  }

  protected headerRows(): readonly TxKeyValueRow[] {
    return kvPairsToRows(this.manual().headers ?? []);
  }

  protected queryRows(): readonly TxKeyValueRow[] {
    return kvPairsToRows(this.manual().queryParams ?? []);
  }

  /** Emits a source switch so the parent can keep collection vs manual independently. */
  protected handleTargetSourceChange(source: string): void {
    if (source !== 'collection' && source !== 'manual') {
      return;
    }
    this.targetSourceChange.emit(source);
  }

  /** Persists the load-test environment dropdown (inherit, none, or a profile id). */
  protected handleEnvironmentChange(value: string): void {
    this.environmentIdChange.emit(environmentIdFromDropdownValue(value));
  }

  protected handleSectionSelect(section: FlowRequestStepSection): void {
    this.activeSection.set(section);
  }

  protected handleHeadersChange(rows: readonly TxKeyValueRow[]): void {
    this.patchManual({ headers: rowsToKvPairs(rows) });
  }

  protected handleQueryChange(rows: readonly TxKeyValueRow[]): void {
    this.patchManual({ queryParams: rowsToKvPairs(rows) });
  }

  protected handleBodyChange(body: CollectionRequestBody): void {
    this.patchManual(patchRequestStepFromCollectionBody(body));
  }

  /** Merges a manual-target patch onto the current editor state. */
  protected patchManual(patch: Partial<LoadTestManualTarget>): void {
    this.manualTargetChange.emit({
      ...this.manual(),
      ...patch,
    });
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
