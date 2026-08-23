import type { TxTreeModel } from './tx-tree.model';
import {
  applyTxTreeAutoScroll,
  findTxTreeScrollParent,
  resolveTxTreeAutoScrollDelta,
  resolveTxTreeDropReachPx,
  resolveTxTreeRowSpan,
  TxTreeDragGeometry,
} from './tx-tree-drag-geometry';
import {
  buildTxTreeDropSlots,
  dropIndicatorsEqual,
  dropIntentsEqual,
  filterTxTreeDropSlots,
  resolveTxTreeDropIntent,
  resolveTxTreePointerDepth,
  TX_TREE_EMPTY_DROP_SLOT_TABLE,
  type TxTreeDropSlotTable,
} from './tx-tree-drop-slots';
import type {
  TxTreeConfig,
  TxTreeDnDState,
  TxTreeDropIntent,
  TxTreeDropPosition,
  TxTreeNodeDropEvent,
} from './tx-tree.types';
import {
  TX_TREE_DRAG_ACTIVATION_DISTANCE_PX,
  TX_TREE_INITIAL_DND_STATE,
} from './tx-tree.types';

export interface TxTreeDragEndContext {
  readonly completed: boolean;
  readonly dropEvent?: TxTreeNodeDropEvent;
}

/** Brief window after a tree drag ends where sidebar outside-click close is ignored. */
const TX_TREE_OUTSIDE_INTERACTION_SUPPRESS_MS = 200;

let outsideInteractionSuppressUntil = 0;

/** Returns true while a tree drag is active or just finished (avoids closing side panels on drop). */
export function shouldSuppressTxTreeOutsideInteraction(): boolean {
  return (
    document.body.classList.contains('tx-tree-dnd-active') ||
    performance.now() < outsideInteractionSuppressUntil
  );
}

function suppressTxTreeOutsideInteractionBriefly(): void {
  outsideInteractionSuppressUntil = performance.now() + TX_TREE_OUTSIDE_INTERACTION_SUPPRESS_MS;
}

interface TxTreeDnDLiveHandle {
  isGestureInProgress(): boolean;
  abort(): void;
}

const liveDnDControllers = new Set<TxTreeDnDLiveHandle>();
let documentSafetyInstalled = false;

/** Removes leftover tree-drag cursor/ghost after a controller is destroyed mid-gesture. */
export function clearTxTreeDnDDocumentChrome(): void {
  document.body.classList.remove('tx-tree-dnd-active');
  document.querySelectorAll('.tx-tree-ghost').forEach((element) => element.remove());
}

function anyTxTreeGestureInProgress(): boolean {
  for (const controller of liveDnDControllers) {
    if (controller.isGestureInProgress()) {
      return true;
    }
  }
  return false;
}

function installTxTreeDnDDocumentSafety(): void {
  if (documentSafetyInstalled || typeof document === 'undefined') {
    return;
  }
  documentSafetyInstalled = true;
  const abortOrphans = (): void => {
    if (!document.body.classList.contains('tx-tree-dnd-active')) {
      return;
    }
    if (anyTxTreeGestureInProgress()) {
      return;
    }
    clearTxTreeDnDDocumentChrome();
  };
  document.addEventListener('pointerup', abortOrphans, true);
  document.addEventListener('pointercancel', abortOrphans, true);
  document.addEventListener(
    'keydown',
    (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      for (const controller of liveDnDControllers) {
        controller.abort();
      }
      clearTxTreeDnDDocumentChrome();
    },
    true,
  );
}

export interface TxTreeDnDCallbacks {
  readonly onStateChange: (state: TxTreeDnDState) => void;
  readonly getDebugEnabled?: () => boolean;
  readonly onDebugTrace?: (
    state: TxTreeDnDState,
    pointer: { readonly x: number; readonly y: number } | null,
  ) => void;
  readonly onDragStart?: () => void;
  readonly onDragEnd?: (context: TxTreeDragEndContext) => void;
  readonly onDrop: (event: TxTreeNodeDropEvent, nodes: ReturnType<TxTreeModel['getNodes']>) => void;
  readonly onExpandNode: (nodeId: string) => void;
  /** Tree content element (`.tx-tree`) that row geometry is measured against. */
  readonly getTreeHost?: () => HTMLElement | null;
}

interface PendingDrag {
  readonly nodeId: string;
  readonly fromHandle: boolean;
  readonly startX: number;
  readonly startY: number;
  readonly pointerId: number;
  readonly captureTarget: HTMLElement | null;
  /** Row box at pointer-down, so the ghost keeps the grab offset it was picked up with. */
  readonly rowRect: DOMRect | null;
}

/**
 * Pointer-driven drag-and-drop for {@link TxTreeComponent}.
 *
 * Each frame resolves the pointer to a single {@link TxTreeDropIntent} through the drop-slot
 * table, and that one value feeds both the insert indicator and the committed move.
 */
export class TxTreeDnDController<TMeta = unknown> {
  private readonly rowElements = new Map<string, HTMLElement>();
  private readonly geometry = new TxTreeDragGeometry(
    () => this.callbacks.getTreeHost?.() ?? null,
    () => this.rowElements,
  );

  private state: TxTreeDnDState = { ...TX_TREE_INITIAL_DND_STATE };
  private slotTable: TxTreeDropSlotTable = TX_TREE_EMPTY_DROP_SLOT_TABLE;
  private slotTableStale = true;

  private ghostEl: HTMLElement | null = null;
  private pointerId: number | null = null;
  private autoExpandTimer: ReturnType<typeof setTimeout> | null = null;
  private autoExpandHoverId: string | null = null;
  private ghostOffsetX = 0;
  private ghostOffsetY = 0;
  private rafId: number | null = null;
  private pendingClientX = 0;
  private pendingClientY = 0;
  private pendingDrag: PendingDrag | null = null;
  private dragActivated = false;
  private suppressClick = false;
  private captureTarget: HTMLElement | null = null;
  private endingDrag = false;
  private scrollParent: HTMLElement | null = null;
  private autoScrollRafId: number | null = null;

  private readonly boundMove = (event: PointerEvent) => this.schedulePointerMove(event);
  private readonly boundUp = (event: PointerEvent) => this.handleDocumentPointerUp(event);
  private readonly boundCancel = (event: PointerEvent) => this.handleDocumentPointerUp(event);
  private readonly boundKeyDown = (event: KeyboardEvent) => this.handleDocumentKeyDown(event);
  private readonly boundWindowBlur = () => this.endDrag(false);
  private readonly boundResize = () => this.invalidateGeometry();
  private readonly boundVisibilityChange = () => {
    if (document.visibilityState !== 'visible') {
      this.endDrag(false);
    }
  };
  private readonly boundLostPointerCapture = () => this.endDrag(false);

  private readonly liveHandle: TxTreeDnDLiveHandle = {
    isGestureInProgress: () => this.isGestureInProgress(),
    abort: () => this.abort(),
  };

  constructor(
    private readonly model: TxTreeModel<TMeta>,
    private getConfig: () => TxTreeConfig<TMeta>,
    private readonly callbacks: TxTreeDnDCallbacks,
  ) {
    liveDnDControllers.add(this.liveHandle);
    installTxTreeDnDDocumentSafety();
  }

  getState(): TxTreeDnDState {
    return this.state;
  }

  /** Whether a drag gesture is in progress. */
  isActive(): boolean {
    return this.state.draggingId !== null;
  }

  /** True while a pointer-down may still become a drag, or a drag is active. */
  isGestureInProgress(): boolean {
    return this.pendingDrag !== null || this.dragActivated || this.state.draggingId !== null;
  }

  /** Cancels an in-progress gesture without unregistering the controller. */
  abort(): void {
    this.endDrag(false);
  }

  /** Returns true once after a drag gesture so row click handlers can skip activation. */
  consumeClickSuppression(): boolean {
    if (!this.suppressClick) {
      return false;
    }
    this.suppressClick = false;
    return true;
  }

  registerRow(nodeId: string, element: HTMLElement): void {
    this.rowElements.set(nodeId, element);
    this.invalidateGeometry();
  }

  unregisterRow(nodeId: string): void {
    const aborting = this.state.draggingId === nodeId || this.pendingDrag?.nodeId === nodeId;
    this.rowElements.delete(nodeId);
    this.invalidateGeometry();
    if (aborting) {
      this.endDrag(false);
    }
  }

  /** Discards cached row geometry and drop slots (call after rows change mid-drag). */
  invalidateGeometry(): void {
    this.geometry.invalidate();
    this.slotTableStale = true;
  }

  destroy(): void {
    liveDnDControllers.delete(this.liveHandle);
    this.endDrag(false);
    this.rowElements.clear();
    this.geometry.reset();
    clearTxTreeDnDDocumentChrome();
  }

  handlePointerDown(event: PointerEvent, nodeId: string, fromHandle: boolean): void {
    const config = this.getConfig();
    if (!config.drag.enabled) {
      return;
    }
    if (config.drag.handleOnly && !fromHandle) {
      return;
    }
    if (!this.model.canDrag(nodeId)) {
      return;
    }

    if (this.dragActivated || this.state.draggingId !== null) {
      this.endDrag(false);
    } else {
      this.cancelPendingDrag();
    }

    this.pendingDrag = {
      nodeId,
      fromHandle,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
      captureTarget: (event.currentTarget as HTMLElement | null) ?? null,
      rowRect: this.rowElements.get(nodeId)?.getBoundingClientRect() ?? null,
    };
    this.dragActivated = false;
    this.pendingClientX = event.clientX;
    this.pendingClientY = event.clientY;

    this.addDocumentDragListeners();
  }

  private addDocumentDragListeners(): void {
    document.addEventListener('pointermove', this.boundMove, { passive: true });
    document.addEventListener('pointerup', this.boundUp);
    document.addEventListener('pointercancel', this.boundCancel);
    document.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('blur', this.boundWindowBlur);
    window.addEventListener('resize', this.boundResize);
    document.addEventListener('visibilitychange', this.boundVisibilityChange);
  }

  private handleDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
      return;
    }
    this.endDrag(false);
  }

  private schedulePointerMove(event: PointerEvent): void {
    if (this.pointerId !== null && event.pointerId !== this.pointerId) {
      return;
    }
    if (this.pendingDrag !== null && event.pointerId !== this.pendingDrag.pointerId) {
      return;
    }

    this.pendingClientX = event.clientX;
    this.pendingClientY = event.clientY;

    if (this.rafId !== null) {
      return;
    }

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (!this.dragActivated && this.pendingDrag) {
        this.tryActivateDrag(this.pendingClientX, this.pendingClientY);
      }
      if (this.dragActivated) {
        this.updateDrag(this.pendingClientX, this.pendingClientY);
      }
    });
  }

  private tryActivateDrag(clientX: number, clientY: number): void {
    const pending = this.pendingDrag;
    if (!pending || this.dragActivated) {
      return;
    }

    const config = this.getConfig();
    const threshold = pending.fromHandle
      ? 0
      : (config.drag.activationDistancePx ?? TX_TREE_DRAG_ACTIVATION_DISTANCE_PX);

    const dx = clientX - pending.startX;
    const dy = clientY - pending.startY;
    if (Math.hypot(dx, dy) < threshold) {
      return;
    }

    this.activateDrag(pending, clientX, clientY);
  }

  private activateDrag(pending: PendingDrag, clientX: number, clientY: number): void {
    this.dragActivated = true;
    this.suppressClick = true;
    this.pointerId = pending.pointerId;
    this.captureTarget = pending.captureTarget;
    this.trySetPointerCapture(pending.captureTarget, pending.pointerId);

    // The grab offset comes from where the row sat at pointer-down, before drag styling
    // changes the layout, so the ghost does not jump when it appears.
    const rect = pending.rowRect;
    if (rect) {
      this.ghostOffsetX = pending.startX - rect.left;
      this.ghostOffsetY = pending.startY - rect.top;
    }

    this.scrollParent = findTxTreeScrollParent(this.callbacks.getTreeHost?.() ?? null);
    this.invalidateGeometry();
    this.setState({
      draggingId: pending.nodeId,
      intent: null,
      indicator: null,
      denyTargetId: null,
    });

    this.createGhost(pending.nodeId, rect);
    this.moveGhost(clientX, clientY);
    document.body.classList.add('tx-tree-dnd-active');
    this.callbacks.onDragStart?.();
    this.startAutoScrollLoop();
    this.updateDrag(clientX, clientY);
    this.emitDebugTrace(clientX, clientY);
  }

  /** Recomputes the resolved drop for the current pointer position. */
  private updateDrag(clientX: number, clientY: number): void {
    const draggingId = this.state.draggingId;
    if (!draggingId) {
      return;
    }

    this.moveGhost(clientX, clientY);

    const table = this.ensureSlotTable(draggingId);
    const frame = this.geometry.toFrame(clientX, clientY);
    const boxes = this.geometry.getBoxes();

    // Past either end of the list the pointer belongs to the nearest end seam, so clamp
    // before scoring; inside the list the reach keeps the indicator on the hovered row.
    const span = resolveTxTreeRowSpan(boxes);
    const pointerYPx = span
      ? Math.min(Math.max(frame.pointerYPx, span.topPx), span.bottomPx)
      : frame.pointerYPx;

    const resolved = resolveTxTreeDropIntent({
      table,
      pointerYPx,
      pointerDepth: resolveTxTreePointerDepth(
        frame.pointerXPx,
        frame.contentLeftPx,
        this.getConfig().visual.indentPx,
      ),
      previous: this.state.intent,
      reachPx: resolveTxTreeDropReachPx(boxes, pointerYPx) ?? undefined,
    });

    const hoveredId =
      resolved?.intent.kind === 'inside'
        ? resolved.intent.parentId
        : this.resolveRowAt(frame.pointerYPx);
    this.scheduleAutoExpand(hoveredId);

    this.setState({
      draggingId,
      intent: resolved?.intent ?? null,
      indicator: resolved?.indicator ?? null,
      denyTargetId: resolved ? null : hoveredId,
    });
    this.emitDebugTrace(clientX, clientY);
  }

  /**
   * Builds the legal drop slots for the current tree, reusing them until rows or geometry
   * change. Policy checks depend on the tree rather than the pointer, so they run here
   * instead of on every pointer frame.
   */
  private ensureSlotTable(draggingId: string): TxTreeDropSlotTable {
    if (!this.slotTableStale) {
      return this.slotTable;
    }

    const rows = this.model.getVisibleRows();
    const source = rows.find((row) => row.id === draggingId);

    const table = buildTxTreeDropSlots({
      rows,
      boxes: this.geometry.getBoxes(),
      source: source
        ? { id: source.id, parentId: source.parentId, index: source.indexAmongSiblings }
        : null,
      indentPx: this.getConfig().visual.indentPx,
    });

    this.slotTable = filterTxTreeDropSlots(table, (intent) =>
      this.model.canDropIntent(draggingId, intent),
    );
    this.slotTableStale = false;
    return this.slotTable;
  }

  /** Node id of the row under a content-relative Y position. */
  private resolveRowAt(pointerYPx: number): string | null {
    for (const [nodeId, box] of this.geometry.getBoxes()) {
      if (pointerYPx >= box.topPx && pointerYPx < box.bottomPx) {
        return nodeId;
      }
    }
    return null;
  }

  private handleDocumentPointerUp(event: PointerEvent): void {
    const pending = this.pendingDrag;
    if (pending !== null && event.pointerId !== pending.pointerId) {
      return;
    }
    if (this.pointerId !== null && event.pointerId !== this.pointerId) {
      return;
    }

    if (!this.dragActivated) {
      this.cancelPendingDrag();
      return;
    }

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
      this.updateDrag(this.pendingClientX, this.pendingClientY);
    }

    const draggingId = this.state.draggingId;
    const intent = this.state.intent;

    if (draggingId && intent) {
      const result = this.model.applyIntent(draggingId, intent);
      if (result) {
        try {
          this.callbacks.onDrop(result.event, result.nodes);
        } finally {
          this.endDrag(true, result.event);
        }
        return;
      }
    }

    // No reachable drop, or one that changes nothing: end silently.
    this.endDrag(false);
  }

  private cancelPendingDrag(): void {
    document.removeEventListener('pointermove', this.boundMove);
    document.removeEventListener('pointerup', this.boundUp);
    document.removeEventListener('pointercancel', this.boundCancel);
    document.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('blur', this.boundWindowBlur);
    window.removeEventListener('resize', this.boundResize);
    document.removeEventListener('visibilitychange', this.boundVisibilityChange);
    this.pendingDrag = null;
    this.dragActivated = false;
  }

  private endDrag(completed: boolean, dropEvent?: TxTreeNodeDropEvent): void {
    if (this.endingDrag) {
      return;
    }
    const wasDragging = this.dragActivated || this.state.draggingId !== null;
    this.endingDrag = true;
    try {
      this.releasePointerCapture();
      this.cancelPendingDrag();
      this.stopAutoScrollLoop();
      this.clearHoverExpand();
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      clearTxTreeDnDDocumentChrome();
      this.pointerId = null;
      this.scrollParent = null;
      this.slotTable = TX_TREE_EMPTY_DROP_SLOT_TABLE;
      this.slotTableStale = true;
      this.removeGhost();
      this.setState({ ...TX_TREE_INITIAL_DND_STATE });
      this.emitDebugTrace(null, null);
      if (wasDragging) {
        suppressTxTreeOutsideInteractionBriefly();
        this.callbacks.onDragEnd?.({ completed, dropEvent });
      }
    } finally {
      this.endingDrag = false;
    }
  }

  /**
   * Scrolls the nearest scrollable ancestor while the pointer rests near its edge, then
   * re-resolves the drop so the indicator tracks the rows moving under the cursor.
   */
  private startAutoScrollLoop(): void {
    if (this.autoScrollRafId !== null || !this.scrollParent) {
      return;
    }

    const step = (): void => {
      this.autoScrollRafId = null;
      const container = this.scrollParent;
      if (!container || !this.dragActivated) {
        return;
      }

      const delta = resolveTxTreeAutoScrollDelta(
        this.pendingClientY,
        container.getBoundingClientRect(),
      );
      if (applyTxTreeAutoScroll(container, delta) !== 0) {
        this.updateDrag(this.pendingClientX, this.pendingClientY);
      }

      this.autoScrollRafId = requestAnimationFrame(step);
    };

    this.autoScrollRafId = requestAnimationFrame(step);
  }

  private stopAutoScrollLoop(): void {
    if (this.autoScrollRafId !== null) {
      cancelAnimationFrame(this.autoScrollRafId);
      this.autoScrollRafId = null;
    }
  }

  private trySetPointerCapture(target: HTMLElement | null, pointerId: number): void {
    if (!target) {
      return;
    }
    try {
      target.addEventListener('lostpointercapture', this.boundLostPointerCapture);
      target.setPointerCapture(pointerId);
    } catch {
      target.removeEventListener('lostpointercapture', this.boundLostPointerCapture);
    }
  }

  private releasePointerCapture(): void {
    const target = this.captureTarget;
    const pointerId = this.pointerId;
    this.captureTarget = null;
    if (!target) {
      return;
    }
    target.removeEventListener('lostpointercapture', this.boundLostPointerCapture);
    if (pointerId === null) {
      return;
    }
    try {
      if (target.hasPointerCapture?.(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    } catch {
      /* already released or node detached */
    }
  }

  private emitDebugTrace(clientX: number | null, clientY: number | null): void {
    if (!this.callbacks.getDebugEnabled?.()) {
      return;
    }

    const pointer = clientX !== null && clientY !== null ? { x: clientX, y: clientY } : null;
    this.callbacks.onDebugTrace?.(this.state, pointer);
  }

  private createGhost(nodeId: string, rect: DOMRect | null): void {
    this.removeGhost();

    const rowEl = this.rowElements.get(nodeId);
    if (!rowEl) {
      return;
    }

    const clone = rowEl.cloneNode(true) as HTMLElement;
    clone.classList.remove('tx-tree-row-host--dragging', 'tx-tree-row-host--drop-inside');
    clone.classList.add('tx-tree-ghost');
    clone.setAttribute('aria-hidden', 'true');
    clone.style.position = 'fixed';
    clone.style.left = '0';
    clone.style.top = '0';
    clone.style.width = `${(rect ?? rowEl.getBoundingClientRect()).width}px`;
    clone.style.pointerEvents = 'none';
    clone.style.zIndex = '10000';
    clone.style.willChange = 'transform';
    clone.style.margin = '0';
    clone.style.opacity = '';
    clone.style.visibility = 'visible';
    clone.querySelectorAll('.tx-tree-row').forEach((row) => {
      (row as HTMLElement).style.visibility = 'visible';
    });
    document.body.appendChild(clone);
    this.ghostEl = clone;
  }

  private moveGhost(x: number, y: number): void {
    if (!this.ghostEl) {
      return;
    }
    const translateX = x - this.ghostOffsetX;
    const translateY = y - this.ghostOffsetY;
    this.ghostEl.style.transform = `translate3d(${translateX}px, ${translateY}px, 0)`;
  }

  private removeGhost(): void {
    this.ghostEl?.remove();
    this.ghostEl = null;
    document.querySelectorAll('.tx-tree-ghost').forEach((element) => element.remove());
  }

  private setState(next: TxTreeDnDState): void {
    if (statesEqual(this.state, next)) {
      return;
    }
    this.state = next;
    this.callbacks.onStateChange(next);
  }

  /** Expands a collapsed parent after the pointer rests on it. */
  private scheduleAutoExpand(nodeId: string | null): void {
    const expansion = this.getConfig().expansion;
    if (!expansion.expandFolderOnDrag || expansion.autoExpandOnDropHoverMs <= 0) {
      return;
    }
    if (this.autoExpandHoverId === nodeId) {
      return;
    }

    this.clearHoverExpand();
    this.autoExpandHoverId = nodeId;
    if (!nodeId) {
      return;
    }

    this.autoExpandTimer = setTimeout(() => {
      this.autoExpandTimer = null;
      if (this.autoExpandHoverId !== nodeId) {
        return;
      }
      const row = this.model.getVisibleRows().find((item) => item.id === nodeId);
      if (!row?.hasChildren || row.expanded) {
        return;
      }
      this.callbacks.onExpandNode(nodeId);
    }, expansion.autoExpandOnDropHoverMs);
  }

  private clearHoverExpand(): void {
    if (this.autoExpandTimer) {
      clearTimeout(this.autoExpandTimer);
      this.autoExpandTimer = null;
    }
    this.autoExpandHoverId = null;
  }
}

function statesEqual(a: TxTreeDnDState, b: TxTreeDnDState): boolean {
  return (
    a.draggingId === b.draggingId &&
    a.denyTargetId === b.denyTargetId &&
    dropIntentsEqual(a.intent, b.intent) &&
    dropIndicatorsEqual(a.indicator, b.indicator)
  );
}

export type { TxTreeDropIntent, TxTreeDropPosition };
