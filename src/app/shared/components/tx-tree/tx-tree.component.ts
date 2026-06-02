import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  contentChild,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  NgZone,
  output,
  signal,
  untracked,
} from '@angular/core';

import { startEntranceStaggerAnimation } from '@app/core/ui/entrance-stagger';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';

import {
  buildExpandRevealIndices,
  estimateExpandRevealSettleMs,
} from './tx-tree-expand.animation';
import { mergeTxTreeConfig, type TxTreeConfigPartial } from './tx-tree.config';
import { buildTxTreeDnDDebugInfo } from './tx-tree-dnd-debug';
import { TxTreeDnDController } from './tx-tree-dnd.controller';
import { TxTreeNodeTemplateDirective } from './tx-tree-node-template.directive';
import { TxTreeRowComponent } from './tx-tree-row.component';
import {
  captureTreeRowRects,
  scheduleTreeRowMoveAnimation,
} from './tx-tree-move.animation';
import { TxTreeModel } from './tx-tree.model';
import type {
  TxTreeConfig,
  TxTreeDnDDebugInfo,
  TxTreeDnDState,
  TxTreeNode,
  TxTreeNodeDropEvent,
  TxTreeNodeTemplateContext,
  TxTreeRowContextMenuEvent,
  TxTreeNodeClickEvent,
  TxTreeNodeRenameCommitEvent,
  TxTreeVisibleRow,
} from './tx-tree.types';
import { TX_TREE_INITIAL_DND_STATE } from './tx-tree.types';

/** Above this visible row count, entrance stagger is skipped for responsiveness. */
const TX_TREE_ENTRANCE_STAGGER_MAX_ROWS = 40;

@Component({
  selector: 'tx-tree',
  standalone: true,
  imports: [TxTreeRowComponent],
  templateUrl: './tx-tree.component.html',
  styleUrl: './tx-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-tree-host',
    role: 'tree',
    '[attr.aria-label]': 'resolvedConfig().ariaLabel',
    '[class.tx-tree-host--dragging]': '!!dndState().draggingId',
    '[class.tx-tree-host--debug]': 'debug()',
  },
})
export class TxTreeComponent<TMeta = unknown> {
  readonly nodes = input.required<readonly TxTreeNode<TMeta>[]>();
  readonly config = input<TxTreeConfigPartial<TMeta> | undefined>(undefined);
  /** When set, controls which folder nodes are expanded (two-way via expandedChange). */
  readonly expandedIds = input<readonly string[] | undefined>(undefined);
  /** When set, controls which rows appear selected (e.g. active workspace tab resource). */
  readonly selectionIds = input<readonly string[] | undefined>(undefined);
  /** When true, overlays row hosts, hit slop, and drop bands (design-system / layout QA). */
  readonly debug = input(false);
  /** Stagger row entrance when the tree mounts (e.g. sidebar panel open). */
  readonly entranceStagger = input(false);
  /** Shown when `nodes` is empty (e.g. panel-specific copy). */
  readonly emptyMessage = input('No items');
  /** When set, the matching row shows an inline rename field. */
  readonly renamingNodeId = input<string | null>(null);

  readonly nodesChange = output<readonly TxTreeNode<TMeta>[]>();
  readonly dndStateChange = output<TxTreeDnDState>();
  /** Rich drag trace; only emitted while {@link debug} is true. */
  readonly dndDebugChange = output<TxTreeDnDDebugInfo>();
  readonly nodeDrop = output<TxTreeNodeDropEvent>();
  readonly selectionChange = output<readonly string[]>();
  readonly expandedChange = output<readonly string[]>();
  readonly rowContextMenu = output<TxTreeRowContextMenuEvent>();
  readonly nodeClick = output<TxTreeNodeClickEvent<TMeta>>();
  readonly nodeDblClick = output<TxTreeNodeClickEvent<TMeta>>();
  readonly renameCommit = output<TxTreeNodeRenameCommitEvent>();
  readonly renameCancel = output<{ readonly nodeId: string }>();

  protected readonly nodeTemplate = contentChild(TxTreeNodeTemplateDirective<TMeta>);

  protected readonly resolvedConfig = signal<TxTreeConfig<TMeta>>(
    mergeTxTreeConfig() as TxTreeConfig<TMeta>,
  );
  protected readonly visibleRows = signal<readonly TxTreeVisibleRow<TMeta>[]>([]);
  protected readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  protected readonly dndState = signal<TxTreeDnDState>({ ...TX_TREE_INITIAL_DND_STATE });
  protected readonly entranceStaggerPlay = signal(false);
  protected readonly entranceStaggerSettled = signal(false);
  protected readonly expandRevealIndices = signal<ReadonlyMap<string, number>>(new Map());

  private readonly destroyRef = inject(DestroyRef);
  private readonly uiPreferences = inject(UiPreferencesService);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly model = new TxTreeModel<TMeta>(mergeTxTreeConfig() as TxTreeConfig<TMeta>);
  private dndController: TxTreeDnDController<TMeta> | null = null;
  private expandRefreshRaf: number | null = null;
  private expandRevealTimer: ReturnType<typeof setTimeout> | null = null;
  private expandedBeforeDrag: ReadonlySet<string> | null = null;
  private skipNextNodesInputSync = false;
  private hasSyncedExpandedIdsInput = false;

  constructor() {
    effect(() => {
      const cfg = mergeTxTreeConfig(this.config());
      this.resolvedConfig.set(cfg as TxTreeConfig<TMeta>);
      this.model.setConfig(cfg as TxTreeConfig<TMeta>);
      this.ensureDnDController();
    });

    effect(() => {
      const nextNodes = this.nodes();
      if (this.skipNextNodesInputSync) {
        this.skipNextNodesInputSync = false;
        return;
      }
      this.model.setNodes(nextNodes, { resetExpansion: false });
      this.refreshRows();
    });

    effect(() => {
      const ids = this.expandedIds();
      if (ids === undefined) {
        return;
      }
      const previousVisibleIds = untracked(
        () => new Set(this.visibleRows().map((row) => row.id)),
      );
      this.model.setExpandedIds(new Set(ids));
      this.refreshRows();
      const shouldAnimateExpand =
        this.hasSyncedExpandedIdsInput &&
        this.resolvedConfig().visual.animateExpand &&
        !this.dndController?.isActive() &&
        (!this.entranceStagger() || this.entranceStaggerSettled());
      this.hasSyncedExpandedIdsInput = true;
      if (shouldAnimateExpand) {
        untracked(() => this.triggerExpandReveal(previousVisibleIds));
      }
    });

    effect(() => {
      const ids = this.selectionIds();
      if (ids === undefined) {
        return;
      }
      untracked(() => this.selectedIds.set(new Set(ids)));
      this.cdr.markForCheck();
    });

    this.destroyRef.onDestroy(() => this.clearExpandRevealTimer());

    this.ensureDnDController();

    afterNextRender(() => {
      if (!this.entranceStagger()) {
        return;
      }

      const rowCount = this.visibleRows().length;
      if (rowCount > TX_TREE_ENTRANCE_STAGGER_MAX_ROWS) {
        this.entranceStaggerPlay.set(false);
        this.entranceStaggerSettled.set(true);
        return;
      }

      startEntranceStaggerAnimation(this.entranceStaggerPlay, this.entranceStaggerSettled, {
        enabled: () => this.uiPreferences.entranceStaggerEnabled(),
        destroyRef: this.destroyRef,
        childCount: () => Math.max(1, this.visibleRows().length),
      });
    });
  }

  protected trackRow(_index: number, row: TxTreeVisibleRow<TMeta>): string {
    return row.id;
  }

  protected showFolderExitSeam(): boolean {
    const state = this.dndState();
    return state.indicatorFolderSeamTopPx !== null && state.indicatorIndentDepth !== null;
  }

  protected folderExitSeamIndent(): number {
    return this.dndState().indicatorIndentDepth ?? 0;
  }

  protected expandRevealIndex(rowId: string): number | null {
    const index = this.expandRevealIndices().get(rowId);
    return index === undefined ? null : index;
  }

  protected isSelected(id: string): boolean {
    if (this.dndState().draggingId === id) {
      return false;
    }
    return this.selectedIds().has(id);
  }

  protected templateContext(row: TxTreeVisibleRow<TMeta>): TxTreeNodeTemplateContext<TMeta> {
    return {
      $implicit: row,
      row,
      node: row.node,
      depth: row.depth,
      selected: this.isSelected(row.id),
      expanded: row.expanded,
    };
  }

  protected handleRowClick(row: TxTreeVisibleRow<TMeta>): void {
    if (this.dndController?.consumeClickSuppression() || this.renamingNodeId() === row.id) {
      return;
    }

    const cfg = this.resolvedConfig();
    if (cfg.selection.selectOnClick && cfg.selection.mode !== 'none') {
      const maySelect =
        cfg.selection.canSelect?.({
          id: row.id,
          node: row.node,
          depth: row.depth,
          hasChildren: row.hasChildren,
        }) ?? true;
      if (maySelect && this.selectionIds() === undefined) {
        this.updateSelection(row.id);
      }
    }
    const expansionControlled = this.expandedIds() !== undefined;
    if (cfg.expansion.expandOnClick && row.hasChildren && !expansionControlled) {
      this.toggleRowExpanded(row);
    }

    this.nodeClick.emit({ nodeId: row.id, node: row.node });
  }

  /**
   * Applies controlled {@link expandedIds} to the model immediately (OnPush parents).
   * Call after updating `expandedIds` from outside when the row click path skips `expandOnClick`.
   */
  syncExpansionFromInput(ids: readonly string[]): void {
    this.model.setExpandedIds(new Set(ids));
    this.refreshRows();
  }

  protected handleRowDblClick(row: TxTreeVisibleRow<TMeta>): void {
    if (row.node.disabled) {
      return;
    }
    this.nodeDblClick.emit({ nodeId: row.id, node: row.node });
  }

  protected handleRenameCommit(row: TxTreeVisibleRow<TMeta>, value: string): void {
    this.renameCommit.emit({ nodeId: row.id, value });
  }

  protected handleRenameCancel(row: TxTreeVisibleRow<TMeta>): void {
    this.renameCancel.emit({ nodeId: row.id });
  }

  protected isRenaming(rowId: string): boolean {
    return this.renamingNodeId() === rowId;
  }

  protected handleChevronClick(row: TxTreeVisibleRow<TMeta>): void {
    if (this.expandedIds() !== undefined) {
      const next = new Set(this.expandedIds());
      if (next.has(row.id)) {
        next.delete(row.id);
      } else {
        next.add(row.id);
      }
      this.expandedChange.emit([...next]);
      return;
    }
    this.toggleRowExpanded(row);
  }

  private toggleRowExpanded(row: TxTreeVisibleRow<TMeta>): void {
    const previousVisibleIds = new Set(this.visibleRows().map((item) => item.id));
    this.model.toggleExpanded(row.id);
    this.emitExpanded();
    this.refreshRows();
    this.maybeRevealExpandedRows(previousVisibleIds);
  }

  protected handlePointerDownRow(row: TxTreeVisibleRow<TMeta>, event: PointerEvent): void {
    const cfg = this.resolvedConfig();
    if (cfg.drag.handleOnly) {
      return;
    }
    this.dndController?.handlePointerDown(event, row.id, false);
  }

  protected handlePointerDownHandle(row: TxTreeVisibleRow<TMeta>, event: PointerEvent): void {
    this.dndController?.handlePointerDown(event, row.id, true);
  }

  protected handleRowContextMenu(
    nodeId: string,
    event: { clientX: number; clientY: number },
  ): void {
    this.rowContextMenu.emit({
      nodeId,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }

  protected handleRegisterRow(rowId: string, element: HTMLElement): void {
    const row = this.visibleRows().find((r) => r.id === rowId);
    const hasChildren =
      row?.hasChildren || row?.node.kind === 'folder' || row?.node.kind === 'collection';
    this.dndController?.registerRow(rowId, element, { hasChildren: !!hasChildren });
  }

  protected handleUnregisterRow(rowId: string): void {
    this.dndController?.unregisterRow(rowId);
  }

  private ensureDnDController(): void {
    if (this.dndController) {
      return;
    }

    this.dndController = new TxTreeDnDController<TMeta>(
      this.model,
      () => this.resolvedConfig(),
      {
        getDebugEnabled: () => this.debug(),
        onDebugTrace: (state, pointer) => {
          this.ngZone.run(() => this.emitDndDebugTrace(state, pointer));
        },
        onStateChange: (state) => {
          this.ngZone.run(() => {
            this.dndState.set(state);
            this.dndStateChange.emit(state);
          });
        },
        onDragStart: () => {
          this.expandedBeforeDrag = new Set(this.model.getExpandedIds());
        },
        onDragEnd: ({ completed, dropEvent }) => {
          this.ngZone.run(() => this.applyExpansionAfterDrag(completed, dropEvent));
        },
        onDrop: (event, nextNodes) => {
          const nodes = nextNodes as TxTreeNode<TMeta>[];
          const animateMove = this.resolvedConfig().visual.animateMove;
          const reparented = event.previousParentId !== event.nextParentId;

          const beforeCaptures = animateMove
            ? captureTreeRowRects(this.hostEl.nativeElement)
            : null;

          this.dndState.set({ ...TX_TREE_INITIAL_DND_STATE });
          this.revertExpansionOpenedDuringDrag();
          this.skipNextNodesInputSync = true;
          this.model.setNodes(nodes);
          this.refreshRows();
          this.cdr.detectChanges();

          if (beforeCaptures) {
            scheduleTreeRowMoveAnimation(this.hostEl.nativeElement, beforeCaptures, {
              reparentedNodeId: reparented ? event.sourceId : undefined,
            });
          }

          this.nodesChange.emit(nodes);
          this.nodeDrop.emit(event);
        },
        onDeny: (targetId) => {
          this.ngZone.run(() => {
            this.dndState.set({
              ...TX_TREE_INITIAL_DND_STATE,
              denyTargetId: targetId,
            });
            globalThis.setTimeout(() => {
              this.dndState.update((current) =>
                current.denyTargetId === targetId
                  ? { ...current, denyTargetId: null }
                  : current,
              );
            }, 480);
          });
        },
        onExpandNode: (nodeId) => {
          this.model.expand(nodeId);
          this.emitExpanded();
          this.scheduleExpandRefreshDuringDrag();
        },
        getTreeHost: () => this.hostEl.nativeElement.querySelector('.tx-tree') as HTMLElement | null,
      },
    );
  }

  private emitDndDebugTrace(
    state: TxTreeDnDState,
    pointer: { readonly x: number; readonly y: number } | null,
  ): void {
    if (!this.debug()) {
      return;
    }

    this.dndDebugChange.emit(buildTxTreeDnDDebugInfo(this.model, state, pointer));
  }

  /** Collapses folders that were opened only during the current drag. */
  private revertExpansionOpenedDuringDrag(): boolean {
    const snapshot = this.expandedBeforeDrag;
    if (!snapshot) {
      return false;
    }

    let expansionChanged = false;
    for (const id of this.model.getExpandedIds()) {
      if (!snapshot.has(id)) {
        this.model.collapse(id);
        expansionChanged = true;
      }
    }

    if (expansionChanged) {
      this.emitExpanded();
    }

    return expansionChanged;
  }

  private applyExpansionAfterDrag(
    completed: boolean,
    dropEvent: TxTreeNodeDropEvent | undefined,
  ): void {
    const expansion = this.resolvedConfig().expansion;
    const snapshot = this.expandedBeforeDrag;
    this.expandedBeforeDrag = null;

    if (!snapshot) {
      return;
    }

    const previousVisibleIds = new Set(this.visibleRows().map((row) => row.id));
    let expansionChanged = false;

    if (
      completed &&
      dropEvent?.position === 'inside' &&
      expansion.expandFolderOnDrop
    ) {
      this.model.expand(dropEvent.targetId);
      expansionChanged = true;
    } else if (
      completed &&
      dropEvent?.position === 'inside' &&
      !expansion.expandFolderOnDrop &&
      !snapshot.has(dropEvent.targetId)
    ) {
      this.model.collapse(dropEvent.targetId);
      expansionChanged = true;
    }

    if (expansionChanged) {
      this.emitExpanded();
      this.refreshRows();
      this.maybeRevealExpandedRows(previousVisibleIds);
    }
  }

  private scheduleExpandRefreshDuringDrag(): void {
    if (!this.dndController?.isActive()) {
      this.refreshRows();
      return;
    }

    if (this.expandRefreshRaf !== null) {
      cancelAnimationFrame(this.expandRefreshRaf);
    }

    this.expandRefreshRaf = requestAnimationFrame(() => {
      this.expandRefreshRaf = null;
      if (!this.dndController?.isActive()) {
        return;
      }
      this.refreshRows();
      this.dndController?.syncRowMetaFromModel();
    });
  }

  private refreshRows(): void {
    this.visibleRows.set(this.model.getVisibleRows());
    this.cdr.markForCheck();
  }

  private maybeRevealExpandedRows(previousVisibleIds: ReadonlySet<string>): void {
    if (
      !this.resolvedConfig().visual.animateExpand ||
      !this.uiPreferences.animationsEnabled() ||
      this.dndController?.isActive() ||
      (this.entranceStagger() && !this.entranceStaggerSettled())
    ) {
      return;
    }

    this.triggerExpandReveal(previousVisibleIds);
  }

  private triggerExpandReveal(previousVisibleIds: ReadonlySet<string>): void {
    const visibleRowIds = this.visibleRows().map((row) => row.id);
    const indices = buildExpandRevealIndices(previousVisibleIds, visibleRowIds);
    if (indices.size === 0) {
      return;
    }

    this.clearExpandRevealTimer();
    this.expandRevealIndices.set(indices);
    this.cdr.markForCheck();

    this.expandRevealTimer = setTimeout(() => {
      this.expandRevealTimer = null;
      this.expandRevealIndices.set(new Map());
      this.cdr.markForCheck();
    }, estimateExpandRevealSettleMs(indices.size));
  }

  private clearExpandRevealTimer(): void {
    if (this.expandRevealTimer !== null) {
      clearTimeout(this.expandRevealTimer);
      this.expandRevealTimer = null;
    }
  }

  private updateSelection(id: string): void {
    const mode = this.resolvedConfig().selection.mode;
    if (mode === 'none') {
      return;
    }

    if (mode === 'single') {
      this.selectedIds.set(new Set([id]));
    } else {
      const next = new Set(this.selectedIds());
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      this.selectedIds.set(next);
    }

    this.selectionChange.emit([...this.selectedIds()]);
  }

  private emitExpanded(): void {
    this.expandedChange.emit([...this.model.getExpandedIds()]);
  }
}
