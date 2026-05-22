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

import { TestSuiteService } from '@app/core/testing/test-suite.service';
import {
  collectTestSuiteFolderIdsInSubtree,
  filterTestSuiteTree,
} from '@app/features/shell/testing/test-suite-sidebar-panel/test-suite-tree.filter';
import type { TestSuiteTreeNode, TestSuiteTreeNodeMeta } from '@app/features/shell/testing/test-suite-sidebar-panel/test-suite-tree.types';
import { mergeTxTreeConfig } from '@app/shared/components/tx-tree/tx-tree.config';
import { TxTreeComponent } from '@app/shared/components/tx-tree/tx-tree.component';
import { TxTreeNodeTemplateDirective } from '@app/shared/components/tx-tree/tx-tree-node-template.directive';
import type { TxTreeNodeClickEvent } from '@app/shared/components/tx-tree/tx-tree.types';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';

import {
  isFolderFullySelected,
  isFolderPartiallySelected,
  orderRegressionFlowIds,
  resolveTestSuiteTreeKind,
  toggleFlowInSelection,
  toggleFolderInSelection,
} from './rg-flow-picker-tree';

const SEARCH_DEBOUNCE_MS = 100;

@Component({
  selector: 'app-rg-tab-flows-panel',
  standalone: true,
  imports: [
    TxButtonComponent,
    TxIconComponent,
    TxTreeComponent,
    TxTreeNodeTemplateDirective,
    WorkspaceSidebarPanelShellComponent,
  ],
  templateUrl: './rg-tab-flows-panel.component.html',
  styleUrl: './rg-tab-flows-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgTabFlowsPanelComponent {
  private readonly testSuite = inject(TestSuiteService);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly tree = viewChild(TxTreeComponent);

  readonly flowIds = input<readonly string[]>([]);
  readonly expandedIds = input<readonly string[]>([]);

  readonly flowIdsChange = output<readonly string[]>();
  readonly expandedIdsChange = output<readonly string[]>();

  protected readonly searchQuery = signal('');
  protected readonly searchQueryDebounced = signal('');
  protected readonly treeExpandedIds = signal<string[]>([]);
  protected readonly allExpanded = signal(true);

  private readonly expandedSnapshotBeforeSearch = signal<string[] | null>(null);
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly treeNodes = computed(() => this.testSuite.nodes());

  protected readonly displayNodes = computed(() =>
    filterTestSuiteTree(this.treeNodes(), this.searchQueryDebounced()),
  );

  protected readonly linkedCount = computed(() => this.flowIds().length);

  protected readonly linkedSet = computed(() => new Set(this.flowIds()));

  protected readonly treeSelectionIds = computed(() => [...this.flowIds()]);

  protected readonly emptyStateMessage = computed(() => {
    if (this.treeNodes().length === 0) {
      return 'No test-suite flows yet. Add flows in Test Suite, then link them here.';
    }
    if (this.searchQueryDebounced().trim()) {
      return 'No flows or folders match your search.';
    }
    return 'No flows to show.';
  });

  protected readonly treeConfig = computed(() =>
    mergeTxTreeConfig<TestSuiteTreeNodeMeta>({
      ariaLabel: 'Test suite flows',
      selection: {
        mode: 'multiple',
        selectOnClick: false,
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
      const fromParent = this.expandedIds();
      untracked(() => {
        this.applyExpandedIds(fromParent);
      });
    });

    effect(() => {
      const query = this.searchQueryDebounced().trim();
      if (query) {
        if (this.expandedSnapshotBeforeSearch() === null) {
          this.expandedSnapshotBeforeSearch.set([...this.treeExpandedIds()]);
        }
        untracked(() => {
          this.applyExpandedIds(collectTestSuiteFolderIdsInSubtree(this.displayNodes()));
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
    this.applyExpandedIds(
      expanded ? collectTestSuiteFolderIdsInSubtree(this.displayNodes()) : [],
    );
  }

  protected handleExpandedChange(ids: readonly string[]): void {
    this.applyExpandedIds([...ids]);
    this.expandedIdsChange.emit([...ids]);
  }

  protected handleNodeClick(event: TxTreeNodeClickEvent<TestSuiteTreeNodeMeta>): void {
    const node = event.node as TestSuiteTreeNode;
    const kind = resolveTestSuiteTreeKind(node);
    const next =
      kind === 'folder'
        ? toggleFolderInSelection(this.flowIds(), node)
        : toggleFlowInSelection(this.flowIds(), event.nodeId);
    this.emitFlowIds(next);
  }

  protected handleClearSelection(): void {
    this.emitFlowIds([]);
  }

  protected handleSelectAllVisible(): void {
    const next = orderRegressionFlowIds(
      this.displayNodes(),
      [...new Set([...this.flowIds(), ...this.collectVisibleFlowIds(this.displayNodes())])],
    );
    this.emitFlowIds(next);
  }

  protected rowCheckState(row: TestSuiteTreeNode): 'checked' | 'partial' | 'unchecked' {
    const linked = this.linkedSet();
    const kind = resolveTestSuiteTreeKind(row);
    if (kind === 'flow') {
      return linked.has(row.id) ? 'checked' : 'unchecked';
    }
    if (isFolderFullySelected(row, linked)) {
      return 'checked';
    }
    if (isFolderPartiallySelected(row, linked)) {
      return 'partial';
    }
    return 'unchecked';
  }

  private emitFlowIds(next: readonly string[]): void {
    this.flowIdsChange.emit(orderRegressionFlowIds(this.treeNodes(), next));
  }

  private collectVisibleFlowIds(nodes: readonly TestSuiteTreeNode[]): readonly string[] {
    const ids: string[] = [];
    for (const node of nodes) {
      if (resolveTestSuiteTreeKind(node) === 'flow') {
        ids.push(node.id);
        continue;
      }
      ids.push(...this.collectVisibleFlowIds(node.children ?? []));
    }
    return ids;
  }

  private applyExpandedIds(next: readonly string[]): void {
    this.treeExpandedIds.set([...next]);
    this.tree()?.syncExpansionFromInput(next);
    const folderIds = collectTestSuiteFolderIdsInSubtree(this.displayNodes());
    this.allExpanded.set(folderIds.length > 0 && folderIds.every((id) => next.includes(id)));
    this.cdr.markForCheck();
  }
}
