import {
  remapIndicatorOffDraggingRow,
  remapFolderExitToAfterBlockSeam,
  resolveDropIndicatorDisplay,
  resolveDropPositionWithHysteresis,
  resolveTailRootRowId,
  type TxTreeModel,
} from './tx-tree.model';
import type {
  TxTreeConfig,
  TxTreeDnDState,
  TxTreeDropPosition,
  TxTreeNodeDropEvent,
} from './tx-tree.types';
import {
  TX_TREE_DRAG_ACTIVATION_DISTANCE_PX,
  TX_TREE_INITIAL_DND_STATE,
  TX_TREE_ROW_HIT_SLOP_PX,
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
  readonly onDeny: (targetId: string) => void;
  readonly onExpandNode: (nodeId: string) => void;
  /** Called after the tree expands mid-drag so row geometry can be re-measured. */
  readonly onLayoutChangeDuringDrag?: () => void;
  /** Tree container element for folder-exit seam positioning. */
  readonly getTreeHost?: () => HTMLElement | null;
}

interface RowTargetMeta {
  readonly hasChildren: boolean;
}

interface PendingDrag {
  readonly nodeId: string;
  readonly fromHandle: boolean;
  readonly startX: number;
  readonly startY: number;
  readonly pointerId: number;
  readonly captureTarget: HTMLElement | null;
}

/**
 * Pointer-driven drag-and-drop for {@link TxTreeComponent}.
 * Attaches document listeners while a drag is active.
 */
export class TxTreeDnDController<TMeta = unknown> {
  private readonly rowElements = new Map<string, HTMLElement>();
  private readonly rowMeta = new Map<string, RowTargetMeta>();
  private state: TxTreeDnDState = { ...TX_TREE_INITIAL_DND_STATE };
  private ghostEl: HTMLElement | null = null;
  private pointerId: number | null = null;
  private autoExpandTimer: ReturnType<typeof setTimeout> | null = null;
  private lastHoverTargetId: string | null = null;
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

  private readonly boundMove = (event: PointerEvent) => this.schedulePointerMove(event);
  private readonly boundUp = (event: PointerEvent) => this.handleDocumentPointerUp(event);
  private readonly boundCancel = (event: PointerEvent) => this.handleDocumentPointerUp(event);
  private readonly boundKeyDown = (event: KeyboardEvent) => this.handleDocumentKeyDown(event);
  private readonly boundWindowBlur = () => this.endDrag(false);
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

  registerRow(nodeId: string, element: HTMLElement, meta?: RowTargetMeta): void {
    this.rowElements.set(nodeId, element);
    if (meta) {
      this.rowMeta.set(nodeId, meta);
    }
  }

  unregisterRow(nodeId: string): void {
    const aborting =
      this.state.draggingId === nodeId || this.pendingDrag?.nodeId === nodeId;
    this.rowElements.delete(nodeId);
    this.rowMeta.delete(nodeId);
    if (aborting) {
      this.endDrag(false);
    }
  }

  /** Refreshes cached row metadata (call after visible rows change during drag). */
  syncRowMetaFromModel(): void {
    for (const row of this.model.getVisibleRows()) {
      const hasChildren =
        row.hasChildren || row.node.kind === 'folder' || row.node.kind === 'collection';
      this.rowMeta.set(row.id, { hasChildren });
    }
  }

  destroy(): void {
    liveDnDControllers.delete(this.liveHandle);
    this.endDrag(false);
    this.rowElements.clear();
    this.rowMeta.clear();
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
        this.handlePointerMove(this.pendingClientX, this.pendingClientY);
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

    this.syncRowMetaFromModel();
    this.setState({
      draggingId: pending.nodeId,
      dropTargetId: null,
      dropPosition: null,
      denyTargetId: null,
      indicatorTargetId: null,
      indicatorPosition: null,
      indicatorIndentDepth: null,
      indicatorFolderSeamTopPx: null,
    });

    const rowEl = this.rowElements.get(pending.nodeId);
    if (rowEl) {
      const rect = rowEl.getBoundingClientRect();
      this.ghostOffsetX = clientX - rect.left;
      this.ghostOffsetY = clientY - rect.top;
    }

    this.createGhost(pending.nodeId);
    this.moveGhost(clientX, clientY);
    document.body.classList.add('tx-tree-dnd-active');
    this.callbacks.onDragStart?.();
    this.emitDebugTrace(clientX, clientY);
  }

  private handlePointerMove(clientX: number, clientY: number): void {
    const draggingId = this.state.draggingId;
    if (!draggingId) {
      return;
    }

    this.moveGhost(clientX, clientY);

    const hit = this.hitTest(clientX, clientY);
    if (!hit) {
      this.clearHoverExpand();
      this.setState({
        draggingId,
        dropTargetId: null,
        dropPosition: null,
        denyTargetId: null,
        indicatorTargetId: null,
        indicatorPosition: null,
        indicatorIndentDepth: null,
        indicatorFolderSeamTopPx: null,
      });
      this.emitDebugTrace(clientX, clientY);
      return;
    }

    const config = this.getConfig();
    const allowed = config.drop.positions;
    const meta = this.rowMeta.get(hit.nodeId);
    const targetHasChildren = meta?.hasChildren ?? false;

    const stickyPosition =
      this.state.dropTargetId === hit.nodeId ? this.state.dropPosition : null;

    let dropTargetId = hit.nodeId;
    let position = this.resolveDropPosition(
      clientY,
      hit.rect,
      allowed,
      targetHasChildren,
      stickyPosition,
    );

    if (!position) {
      this.clearHoverExpand();
      this.setState({
        draggingId,
        dropTargetId,
        dropPosition: null,
        denyTargetId: null,
        indicatorTargetId: null,
        indicatorPosition: null,
        indicatorIndentDepth: null,
        indicatorFolderSeamTopPx: null,
      });
      this.emitDebugTrace(clientX, clientY);
      return;
    }

    const logical = this.model.resolveLogicalDrop(draggingId, dropTargetId, position);
    const logicalTargetId = logical.targetId;
    const logicalPosition = logical.position;

    if (!logicalPosition || !this.model.canDrop(draggingId, logicalTargetId, logicalPosition)) {
      this.clearHoverExpand();
      this.setState({
        draggingId,
        dropTargetId: logicalTargetId,
        dropPosition: logicalPosition,
        denyTargetId: logicalTargetId,
        indicatorTargetId: null,
        indicatorPosition: null,
        indicatorIndentDepth: null,
        indicatorFolderSeamTopPx: null,
      });
      this.emitDebugTrace(clientX, clientY);
      return;
    }

    const allVisibleRows = this.model.getVisibleRows();
    const indicator = resolveDropIndicatorDisplay(
      allVisibleRows,
      logicalTargetId,
      logicalPosition,
    );
    let indicatorTargetId: string | null = indicator.targetId;
    let indicatorPosition: TxTreeDropPosition | null = indicator.position;
    let indicatorIndentDepth: number | null = indicator.indentDepth;

    if (indicatorIndentDepth !== null && logicalPosition === 'after') {
      const seam = remapFolderExitToAfterBlockSeam(
        allVisibleRows,
        draggingId,
        logicalTargetId,
        indicatorIndentDepth,
      );
      indicatorTargetId = seam.targetId;
      indicatorPosition = seam.position;
      indicatorIndentDepth = seam.indentDepth;
    } else {
      const remapped = remapIndicatorOffDraggingRow(
        allVisibleRows,
        draggingId,
        indicatorTargetId,
        indicatorPosition,
        indicatorIndentDepth,
      );
      indicatorTargetId = remapped.targetId;
      indicatorPosition = remapped.position;
      indicatorIndentDepth = remapped.indentDepth;
    }

    let indicatorFolderSeamTopPx: number | null = null;
    if (
      indicatorTargetId === draggingId &&
      indicatorIndentDepth !== null &&
      indicatorPosition === 'after'
    ) {
      const seamFolderId = this.resolveFolderExitSeamFolderId(logicalTargetId, logicalPosition);
      const seamTop = seamFolderId
        ? this.resolveFolderSeamTopPx(seamFolderId, draggingId)
        : null;
      if (seamTop !== null) {
        indicatorFolderSeamTopPx = seamTop;
        indicatorTargetId = null;
        indicatorPosition = null;
      }
    }

    if (indicatorTargetId === draggingId) {
      indicatorTargetId = null;
      indicatorPosition = null;
      if (indicatorFolderSeamTopPx === null && logicalPosition === 'after') {
        const seamFolderId = this.resolveFolderExitSeamFolderId(logicalTargetId, logicalPosition);
        const seamTop = seamFolderId
          ? this.resolveFolderSeamTopPx(seamFolderId, draggingId)
          : null;
        if (seamTop !== null) {
          indicatorFolderSeamTopPx = seamTop;
        }
      }
    }

    this.scheduleAutoExpand(logicalTargetId, config.expansion.autoExpandOnDropHoverMs);
    this.setState({
      draggingId,
      dropTargetId: logicalTargetId,
      dropPosition: logicalPosition,
      denyTargetId: null,
      indicatorTargetId,
      indicatorPosition,
      indicatorIndentDepth,
      indicatorFolderSeamTopPx,
    });
    this.emitDebugTrace(clientX, clientY);
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
      this.handlePointerMove(this.pendingClientX, this.pendingClientY);
    }

    const draggingId = this.state.draggingId;
    const targetId = this.state.dropTargetId;
    const position = this.state.dropPosition;
    const denied = this.state.denyTargetId;

    if (draggingId && targetId && position && !denied) {
      const result = this.model.moveNode(draggingId, targetId, position);
      if (result) {
        try {
          this.callbacks.onDrop(result.event, result.nodes);
        } finally {
          this.endDrag(true, result.event);
        }
        return;
      }
    }

    this.endDrag(false);

    if (denied && this.getConfig().visual.animateDeny) {
      this.callbacks.onDeny(denied);
    }
  }

  private cancelPendingDrag(): void {
    document.removeEventListener('pointermove', this.boundMove);
    document.removeEventListener('pointerup', this.boundUp);
    document.removeEventListener('pointercancel', this.boundCancel);
    document.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('blur', this.boundWindowBlur);
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
      this.clearHoverExpand();
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      clearTxTreeDnDDocumentChrome();
      this.pointerId = null;
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

    const pointer =
      clientX !== null && clientY !== null ? { x: clientX, y: clientY } : null;
    this.callbacks.onDebugTrace?.(this.state, pointer);
  }

  private hitTest(clientX: number, clientY: number): { nodeId: string; rect: DOMRect } | null {
    const draggingId = this.state.draggingId;

    if (draggingId) {
      const dragEl = this.rowElements.get(draggingId);
      if (dragEl) {
        const dragRect = dragEl.getBoundingClientRect();
        if (this.isPointerInRowBand(clientY, dragRect)) {
          return { nodeId: draggingId, rect: dragRect };
        }
      }
    }

    const nearest = this.hitTestNearestRow(clientY, draggingId);

    if (typeof document.elementsFromPoint !== 'function') {
      return nearest;
    }

    const stack = document.elementsFromPoint(clientX, clientY);

    for (const element of stack) {
      const host = element.closest('.tx-tree-row-host') as HTMLElement | null;
      if (!host) {
        continue;
      }

      const nodeId = host.dataset['txTreeNodeId'];
      if (!nodeId || nodeId === draggingId) {
        continue;
      }

      const rect = host.getBoundingClientRect();
      if (this.isPointerInRowBand(clientY, rect)) {
        return { nodeId, rect };
      }
    }

    return nearest;
  }

  /** Bottom edge of every registered row host (includes the row being dragged). */
  private getMaxRegisteredRowBottom(): number {
    let maxBottom = Number.NEGATIVE_INFINITY;
    for (const element of this.rowElements.values()) {
      maxBottom = Math.max(maxBottom, element.getBoundingClientRect().bottom);
    }
    return maxBottom;
  }

  /**
   * Maps pointer Y to a row, including gaps between items (midpoint splits).
   */
  private hitTestNearestRow(
    clientY: number,
    draggingId: string | null,
  ): { nodeId: string; rect: DOMRect } | null {
    const rows: { nodeId: string; rect: DOMRect }[] = [];

    for (const [nodeId, element] of this.rowElements) {
      if (nodeId === draggingId) {
        continue;
      }
      rows.push({ nodeId, rect: element.getBoundingClientRect() });
    }

    if (rows.length === 0) {
      return null;
    }

    rows.sort((a, b) => a.rect.top - b.rect.top);

    const slop = TX_TREE_ROW_HIT_SLOP_PX;
    const maxBottomAll = this.getMaxRegisteredRowBottom();

    if (clientY < rows[0].rect.top - slop) {
      return rows[0];
    }

    const last = rows[rows.length - 1];
    if (Number.isFinite(maxBottomAll) && clientY > maxBottomAll + slop) {
      const belowTree = this.resolveBelowTreeDropTarget(draggingId);
      if (belowTree) {
        return belowTree;
      }
      return last;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const topBound =
        i === 0 ? row.rect.top - slop : (rows[i - 1].rect.bottom + row.rect.top) / 2;
      const bottomBound =
        i === rows.length - 1
          ? (Number.isFinite(maxBottomAll) ? maxBottomAll : row.rect.bottom) + slop
          : (row.rect.bottom + rows[i + 1].rect.top) / 2;

      if (clientY >= topBound && clientY < bottomBound) {
        return row;
      }
    }

    return last;
  }

  /** Drop target when the pointer is below the last visible row (append at root tail). */
  private resolveBelowTreeDropTarget(
    draggingId: string | null,
  ): { nodeId: string; rect: DOMRect } | null {
    const tailRootId = resolveTailRootRowId(this.model.getVisibleRows(), draggingId);
    if (!tailRootId) {
      return null;
    }

    const element = this.rowElements.get(tailRootId);
    if (!element) {
      return null;
    }

    return { nodeId: tailRootId, rect: element.getBoundingClientRect() };
  }

  private isPointerInRowBand(clientY: number, rect: DOMRect): boolean {
    const slop = TX_TREE_ROW_HIT_SLOP_PX;
    return clientY >= rect.top - slop && clientY <= rect.bottom + slop;
  }

  /**
   * When the pointer sits in an inter-row gap, the row band resolves to before/after
   * instead of the inner 25/50/25 zones (which are unreachable there).
   */
  private resolveDropPosition(
    clientY: number,
    rect: DOMRect,
    allowed: readonly TxTreeDropPosition[],
    targetHasChildren: boolean,
    stickyPosition: TxTreeDropPosition | null,
  ): TxTreeDropPosition | null {
    if (clientY > rect.bottom + 1) {
      if (stickyPosition === 'after') {
        return 'after';
      }
      return allowed.includes('after') ? 'after' : null;
    }

    if (clientY < rect.top - 1) {
      if (stickyPosition === 'before') {
        return 'before';
      }
      return allowed.includes('before') ? 'before' : null;
    }

    return resolveDropPositionWithHysteresis(
      clientY,
      rect,
      allowed,
      targetHasChildren,
      stickyPosition,
    );
  }

  private createGhost(nodeId: string): void {
    this.removeGhost();

    const rowEl = this.rowElements.get(nodeId);
    if (!rowEl) {
      return;
    }

    const clone = rowEl.cloneNode(true) as HTMLElement;
    clone.classList.remove(
      'tx-tree-row-host--dragging',
      'tx-tree-row-host--drop-before',
      'tx-tree-row-host--drop-after',
      'tx-tree-row-host--drop-inside',
      'tx-tree-row-host--drop-deny',
      'tx-dnd-deny-active',
    );
    clone.classList.add('tx-tree-ghost');
    clone.setAttribute('aria-hidden', 'true');
    clone.style.position = 'fixed';
    clone.style.left = '0';
    clone.style.top = '0';
    clone.style.width = `${rowEl.getBoundingClientRect().width}px`;
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

  /** Bottom edge of an expanded folder block in viewport coordinates. */
  private resolveFolderBlockBottomPx(
    folderId: string,
    excludeRowId: string | null = null,
  ): number | null {
    const rows = this.model.getVisibleRows();
    const folderIndex = rows.findIndex((row) => row.id === folderId);
    if (folderIndex < 0) {
      return null;
    }

    const folderDepth = rows[folderIndex].depth;
    let lastRowId = folderId;
    const folderRow = rows[folderIndex];
    if (folderRow.hasChildren && folderRow.expanded) {
      for (let j = folderIndex + 1; j < rows.length; j++) {
        if (rows[j].depth <= folderDepth) {
          break;
        }
        if (rows[j].id !== excludeRowId) {
          lastRowId = rows[j].id;
        }
      }
    }

    if (lastRowId === excludeRowId) {
      const folderEl = this.rowElements.get(folderId);
      return folderEl?.getBoundingClientRect().bottom ?? null;
    }

    const element = this.rowElements.get(lastRowId);
    return element?.getBoundingClientRect().bottom ?? null;
  }

  /** Folder-exit seam offset from the tree container top (px). */
  private resolveFolderSeamTopPx(
    folderId: string,
    excludeRowId: string | null = null,
  ): number | null {
    const treeHost = this.callbacks.getTreeHost?.();
    const blockBottom = this.resolveFolderBlockBottomPx(folderId, excludeRowId);
    if (!treeHost || blockBottom === null) {
      return null;
    }

    return blockBottom - treeHost.getBoundingClientRect().top;
  }

  /**
   * Resolves the expanded folder whose exit seam should receive the insert line for an `after`
   * drop on a folder row or one of its descendants.
   */
  private resolveFolderExitSeamFolderId(
    logicalTargetId: string,
    logicalPosition: TxTreeDropPosition,
  ): string | null {
    if (logicalPosition !== 'after') {
      return null;
    }

    const rows = this.model.getVisibleRows();
    const target = rows.find((row) => row.id === logicalTargetId);
    if (!target) {
      return null;
    }

    if (target.hasChildren && target.expanded) {
      return target.id;
    }

    return target.parentId;
  }

  private setState(next: TxTreeDnDState): void {
    if (statesEqual(this.state, next)) {
      return;
    }
    this.state = next;
    this.callbacks.onStateChange(next);
  }

  private scheduleAutoExpand(nodeId: string, delayMs: number): void {
    if (!this.getConfig().expansion.expandFolderOnDrag || delayMs <= 0) {
      return;
    }
    if (this.lastHoverTargetId === nodeId) {
      return;
    }
    this.clearHoverExpand();
    this.lastHoverTargetId = nodeId;
    this.autoExpandTimer = setTimeout(() => {
      this.autoExpandTimer = null;
      if (this.state.dropTargetId !== nodeId) {
        return;
      }
      const row = this.model.getVisibleRows().find((r) => r.id === nodeId);
      if (!row?.hasChildren || row.expanded) {
        return;
      }
      this.callbacks.onExpandNode(nodeId);
    }, delayMs);
  }

  private clearHoverExpand(): void {
    if (this.autoExpandTimer) {
      clearTimeout(this.autoExpandTimer);
      this.autoExpandTimer = null;
    }
    this.lastHoverTargetId = null;
  }
}

function statesEqual(a: TxTreeDnDState, b: TxTreeDnDState): boolean {
  return (
    a.draggingId === b.draggingId &&
    a.dropTargetId === b.dropTargetId &&
    a.dropPosition === b.dropPosition &&
    a.denyTargetId === b.denyTargetId &&
    a.indicatorTargetId === b.indicatorTargetId &&
    a.indicatorPosition === b.indicatorPosition &&
    a.indicatorIndentDepth === b.indicatorIndentDepth &&
    a.indicatorFolderSeamTopPx === b.indicatorFolderSeamTopPx
  );
}

export type { TxTreeDropPosition };
