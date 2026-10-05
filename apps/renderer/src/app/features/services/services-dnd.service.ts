import { afterNextRender, computed, inject, Injectable, Injector, signal } from '@angular/core';
import type { ServiceId, ServiceTreeNode } from '@testrix/contracts';
import type { TxDragEndReason, TxPoint, TxRect } from '@testrix/ui';

import { captureFlipPositions, playTreeFlip } from '../collections/collections-tree-flip';
import { ServicesStore } from './services.store';
import {
  SERVICES_INDENT_PX,
  SERVICES_ROOT_ID,
  TREE_GUTTER_PX,
  buildServiceSlotTable,
  flattenServiceTreeRows,
  resolveSlot,
  type DropSlot,
  type DropSlotTable,
  type MeasuredRow,
} from './services-drop-model';

const EXPAND_HOVER_MS = 450;
const OUTSIDE_SLACK_PX = 48;
const EMPTY_TABLE: DropSlotTable = { bands: [], indent: SERVICES_INDENT_PX, gutter: TREE_GUTTER_PX };

/**
 * Drives one services-tree drag across the recursive node components.
 */
@Injectable({ providedIn: 'root' })
export class ServicesDndService {
  private readonly store = inject(ServicesStore);
  private readonly injector = inject(Injector);

  readonly scrollContainer = signal<HTMLElement | null>(null);
  readonly announcement = signal('');

  readonly isIndicatorVisible = computed(() => this.store.dropTarget()?.mode === 'between');
  readonly indicatorY = computed(() => this.store.dropTarget()?.y ?? 0);
  readonly indicatorLeft = computed(
    () => TREE_GUTTER_PX + (this.store.dropTarget()?.depth ?? 0) * SERVICES_INDENT_PX,
  );
  readonly isIndicatorDenied = computed(() => this.store.dropTarget()?.denied ?? false);

  private serviceId: ServiceId | null = null;
  private root: HTMLElement | null = null;
  private scrollerRect: DOMRect | null = null;
  private listLeft = 0;
  private table: DropSlotTable = EMPTY_TABLE;
  private currentKey: string | null = null;
  private lastPoint: TxPoint | null = null;
  private expandTimer: ReturnType<typeof setTimeout> | null = null;
  private expandFolderId: string | null = null;

  registerSurface(
    serviceId: ServiceId,
    root: HTMLElement | null,
    scroller: HTMLElement | null,
  ): void {
    this.serviceId = serviceId;
    this.root = root;
    this.scrollContainer.set(scroller);
  }

  begin(node: ServiceTreeNode<Record<string, unknown>>): void {
    const serviceId = this.serviceId;
    if (!serviceId)
      return;
    const ids = this.store.dragIdsFor(serviceId, node.id);
    this.store.beginDrag(serviceId, node, ids);
    this.currentKey = null;
    this.lastPoint = null;
    this.measure(node, ids);
  }

  move(point: TxPoint): void {
    const rect = this.scrollerRect;
    const scroller = this.scrollContainer();
    if (!this.store.dragNode() || !rect || !scroller)
      return;
    this.lastPoint = point;

    if (point.x < rect.left - OUTSIDE_SLACK_PX || point.x > rect.right + OUTSIDE_SLACK_PX) {
      this.clearExpandHover();
      this.currentKey = null;
      this.store.setDropTarget(null);
      return;
    }

    const contentBottom = Math.max(scroller.scrollHeight, rect.height);
    const y = Math.max(0, Math.min(contentBottom, point.y - rect.top + scroller.scrollTop));
    const x = point.x - this.listLeft;
    const slot = resolveSlot(this.table, x, y, this.currentKey);
    this.currentKey = slot?.key ?? null;
    this.store.setDropTarget(slot);
    this.scheduleExpand(slot);
  }

  async end(reason: TxDragEndReason, releaseRect: TxRect | null): Promise<void> {
    this.clearExpandHover();
    this.currentKey = null;
    this.lastPoint = null;
    this.table = EMPTY_TABLE;

    if (reason === 'cancel') {
      this.store.endDrag();
      return;
    }

    const root = this.root;
    const draggedId = this.store.dragNode()?.id ?? null;
    const first = root
      ? captureFlipPositions(root, { previewRect: this.clampToScroller(releaseRect), draggedId })
      : null;

    const movedId = await this.store.commitDrop();
    if (movedId)
      this.announcement.set('Moved');
    if (!root || !first || !movedId)
      return;

    afterNextRender(
      () => {
        requestAnimationFrame(() => playTreeFlip(root, first, movedId));
      },
      { injector: this.injector },
    );
  }

  /**
   * Keeps the release point inside the sidebar so the row flies in from somewhere visible.
   */
  private clampToScroller(rect: TxRect | null): TxRect | null {
    const bounds = this.scrollerRect;
    if (!rect || !bounds)
      return rect;
    const maxLeft = Math.max(bounds.left, bounds.right - rect.width);
    return { ...rect, left: Math.min(Math.max(rect.left, bounds.left), maxLeft) };
  }

  private measure(
    dragged: ServiceTreeNode<Record<string, unknown>>,
    ids: readonly string[] = [dragged.id],
  ): void {
    const serviceId = this.serviceId;
    const scroller = this.scrollContainer();
    if (!serviceId || !scroller) {
      this.table = EMPTY_TABLE;
      return;
    }

    const scrollerRect = scroller.getBoundingClientRect();
    this.scrollerRect = scrollerRect;

    const elements = new Map<string, HTMLElement>();
    scroller.querySelectorAll('[data-node-id]').forEach((element) => {
      if (element instanceof HTMLElement && element.dataset['nodeId'])
        elements.set(element.dataset['nodeId'], element);
    });

    const originY = scrollerRect.top - scroller.scrollTop;
    const rows: MeasuredRow[] = [];
    this.listLeft = scrollerRect.left;
    const expanded = new Set(this.store.expanded(serviceId));

    for (const info of flattenServiceTreeRows(this.store.visibleTree(serviceId), (id) => expanded.has(id))) {
      const element = elements.get(info.id);
      if (!element)
        continue;
      const rect = element.getBoundingClientRect();
      if (rows.length === 0)
        this.listLeft = rect.left;
      rows.push({ ...info, top: rect.top - originY, height: rect.height });
    }

    const draggedFolderIds = flattenServiceTreeRows(this.store.visibleTree(serviceId), () => true)
      .filter((row) => ids.includes(row.id) && row.kind === 'folder')
      .map((row) => row.id);

    this.table = buildServiceSlotTable(rows, {
      draggedId: dragged.id,
      draggedIsFolder: dragged.kind === 'folder' || draggedFolderIds.length > 0,
      draggedFolderIds,
      contentTop: 0,
      contentBottom: Math.max(scroller.scrollHeight, scrollerRect.height),
    });
  }

  private scheduleExpand(slot: DropSlot | null): void {
    const serviceId = this.serviceId;
    const folderId = slot?.mode === 'into' ? slot.folderId : null;
    if (!serviceId || !folderId || this.store.expanded(serviceId).includes(folderId)) {
      this.clearExpandHover();
      return;
    }
    if (this.expandFolderId === folderId)
      return;

    this.clearExpandHover();
    this.expandFolderId = folderId;
    this.expandTimer = setTimeout(() => {
      this.expandTimer = null;
      if (!this.store.expanded(serviceId).includes(folderId))
        this.store.toggleExpanded(serviceId, folderId);
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
    if (!dragged)
      return;
    this.measure(dragged, this.store.dragIds());
    if (this.lastPoint)
      this.move(this.lastPoint);
  }
}

export { SERVICES_ROOT_ID };
