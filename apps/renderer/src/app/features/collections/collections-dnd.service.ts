import { afterNextRender, computed, inject, Injectable, Injector, signal } from '@angular/core';
import type { CollectionNode } from '@testrix/contracts';
import type { TxDragEndReason, TxPoint, TxRect } from '@testrix/ui';

import {
  buildSlotTable,
  EMPTY_SLOT_TABLE,
  flattenTree,
  resolveSlot,
  TREE_GUTTER_PX,
  TREE_INDENT_PX,
  type DropSlot,
  type DropSlotTable,
  type MeasuredRow,
} from './collections-drop-model';
import { captureFlipPositions, playTreeFlip } from './collections-tree-flip';
import { CollectionsStore } from './collections.store';

/** Hover time over a collapsed folder before it springs open. */
const EXPAND_HOVER_MS = 450;

/** How far outside the sidebar the pointer may stray before the drop target clears. */
const OUTSIDE_SLACK_PX = 48;

/**
 * Drives one collections drag: measures the tree once, resolves the pointer against the
 * slot table, and owns the hand-off from the floating preview to the settled row.
 *
 * The tree component is recursive, so this lives beside it rather than inside it —
 * a drag spans every nesting level and needs a single owner.
 */
@Injectable({ providedIn: 'root' })
export class CollectionsDndService {
  private readonly store = inject(CollectionsStore);
  private readonly injector = inject(Injector);

  /** Scroll container, handed over by the sidebar. Rows pass it to the engine. */
  readonly scrollContainer = signal<HTMLElement | null>(null);
  /** Spoken feedback for keyboard reordering. */
  readonly announcement = signal('');

  readonly isIndicatorVisible = computed(() => this.store.dropTarget()?.mode === 'between');
  readonly indicatorY = computed(() => this.store.dropTarget()?.y ?? 0);
  readonly indicatorLeft = computed(
    () => TREE_GUTTER_PX + (this.store.dropTarget()?.depth ?? 0) * TREE_INDENT_PX,
  );
  readonly isIndicatorDenied = computed(() => this.store.dropTarget()?.denied ?? false);

  private root: HTMLElement | null = null;
  private table: DropSlotTable = EMPTY_SLOT_TABLE;
  private scrollerRect: DOMRect | null = null;
  private listLeft = 0;
  private currentKey: string | null = null;
  private lastPoint: TxPoint | null = null;
  private expandTimer: ReturnType<typeof setTimeout> | null = null;
  private expandFolderId: string | null = null;

  /** Called by the sidebar once its elements exist. */
  registerSurface(root: HTMLElement | null, scroller: HTMLElement | null): void {
    this.root = root;
    this.scrollContainer.set(scroller);
  }

  begin(node: CollectionNode): void {
    const ids = this.store.dragIdsFor(node.id);
    this.store.beginDrag(node, ids);
    this.currentKey = null;
    this.lastPoint = null;
    this.measure(node, ids);
  }

  move(point: TxPoint): void {
    const dragged = this.store.dragNode();
    const rect = this.scrollerRect;
    const scroller = this.scrollContainer();
    if (!dragged || !rect || !scroller) {
      return;
    }
    this.lastPoint = point;

    if (point.x < rect.left - OUTSIDE_SLACK_PX || point.x > rect.right + OUTSIDE_SLACK_PX) {
      this.clearExpandHover();
      this.currentKey = null;
      this.store.setDropTarget(null);
      return;
    }

    // Content space: unaffected by autoscroll, so the table never needs rebuilding.
    // Clamped so dragging past either end latches onto the first or last slot.
    const contentBottom = Math.max(scroller.scrollHeight, rect.height);
    const y = Math.max(0, Math.min(contentBottom, point.y - rect.top + scroller.scrollTop));
    const x = point.x - this.listLeft;

    const slot = resolveSlot(this.table, x, y, this.currentKey);
    this.currentKey = slot?.key ?? null;
    this.store.setDropTarget(slot);
    this.scheduleExpand(slot);
  }

  end(reason: TxDragEndReason, releaseRect: TxRect | null): void {
    this.clearExpandHover();
    this.currentKey = null;
    this.lastPoint = null;
    this.table = EMPTY_SLOT_TABLE;

    if (reason === 'cancel') {
      this.store.endDrag();
      return;
    }

    const root = this.root;
    const draggedId = this.store.dragNode()?.id ?? null;
    const first = root
      ? captureFlipPositions(root, { previewRect: this.clampToScroller(releaseRect), draggedId })
      : null;

    const movedId = this.store.commitDrop();
    if (!root || !first || !movedId) {
      return;
    }

    afterNextRender(
      () => {
        requestAnimationFrame(() => playTreeFlip(root, first, movedId));
      },
      { injector: this.injector },
    );
  }

  /** Keyboard equivalent of a short drag: one slot up or down within the same parent. */
  reorder(nodeId: string, direction: -1 | 1): void {
    const message = this.store.moveWithinParent(nodeId, direction);
    this.announcement.set(message ?? 'Cannot move further in that direction');
  }

  /**
   * Holds the release point inside the sidebar so the row flies in from somewhere visible.
   *
   * Where the pointer sat horizontally carries no meaning — rows are full width — but the
   * drop animation starts from it, and a release out near the canvas would otherwise send
   * the row on a long sideways trip behind the clipped edge.
   */
  private clampToScroller(rect: TxRect | null): TxRect | null {
    const bounds = this.scrollerRect;
    if (!rect || !bounds) {
      return rect;
    }
    const maxLeft = Math.max(bounds.left, bounds.right - rect.width);
    return { ...rect, left: Math.min(Math.max(rect.left, bounds.left), maxLeft) };
  }

  private measure(dragged: CollectionNode, ids: readonly string[] = [dragged.id]): void {
    const scroller = this.scrollContainer();
    if (!scroller) {
      this.table = EMPTY_SLOT_TABLE;
      return;
    }

    const scrollerRect = scroller.getBoundingClientRect();
    this.scrollerRect = scrollerRect;

    const elements = new Map<string, HTMLElement>();
    scroller.querySelectorAll('[data-node-id]').forEach((element) => {
      if (element instanceof HTMLElement && element.dataset['nodeId']) {
        elements.set(element.dataset['nodeId'], element);
      }
    });

    const originY = scrollerRect.top - scroller.scrollTop;
    const rows: MeasuredRow[] = [];
    this.listLeft = scrollerRect.left;

    for (const info of flattenTree(this.store.visibleTree(), (id) => this.store.isExpanded(id))) {
      const element = elements.get(info.id);
      if (!element) {
        continue;
      }
      const rect = element.getBoundingClientRect();
      if (rows.length === 0) {
        this.listLeft = rect.left;
      }
      rows.push({ ...info, top: rect.top - originY, height: rect.height });
    }

    const draggedFolderIds = flattenTree(this.store.tree(), () => true)
      .filter((row) => ids.includes(row.id) && row.kind === 'folder')
      .map((row) => row.id);

    this.table = buildSlotTable(rows, {
      draggedId: dragged.id,
      draggedIsFolder: dragged.kind === 'folder' || draggedFolderIds.length > 0,
      draggedFolderIds,
      contentTop: 0,
      contentBottom: Math.max(scroller.scrollHeight, scrollerRect.height),
    });
  }

  private scheduleExpand(slot: DropSlot | null): void {
    const folderId = slot?.mode === 'into' ? slot.folderId : null;
    if (!folderId || this.store.isExpanded(folderId)) {
      this.clearExpandHover();
      return;
    }
    if (this.expandFolderId === folderId) {
      return;
    }

    this.clearExpandHover();
    this.expandFolderId = folderId;
    this.expandTimer = setTimeout(() => {
      this.expandTimer = null;
      this.store.ensureExpanded(folderId);
      afterNextRender(() => this.remeasure(), { injector: this.injector });
    }, EXPAND_HOVER_MS);
  }

  private clearExpandHover(): void {
    if (this.expandTimer) {
      clearTimeout(this.expandTimer);
      this.expandTimer = null;
    }
    this.expandFolderId = null;
  }

  /** Rebuilds the table after the tree's layout changed mid-drag. */
  private remeasure(): void {
    const dragged = this.store.dragNode();
    if (!dragged) {
      return;
    }
    this.measure(dragged, this.store.dragIds());
    if (this.lastPoint) {
      this.move(this.lastPoint);
    }
  }
}
