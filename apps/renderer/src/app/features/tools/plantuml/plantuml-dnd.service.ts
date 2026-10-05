import { afterNextRender, computed, inject, Injectable, Injector, signal } from '@angular/core';
import type { PlantumlNode } from '@testrix/contracts';
import type { TxDragEndReason, TxPoint, TxRect } from '@testrix/ui';

import { captureFlipPositions, playTreeFlip } from '../../collections/collections-tree-flip';
import { PlantumlStore } from './plantuml.store';
import {
  PLANTUML_INDENT_PX,
  TREE_GUTTER_PX,
  buildPlantumlSlotTable,
  flattenPlantumlTreeRows,
  resolveSlot,
  type DropSlot,
  type DropSlotTable,
  type MeasuredRow,
} from './plantuml-drop-model';

const EXPAND_HOVER_MS = 450;
const OUTSIDE_SLACK_PX = 48;
const EMPTY_TABLE: DropSlotTable = { bands: [], indent: PLANTUML_INDENT_PX, gutter: TREE_GUTTER_PX };

/**
 * Drives PlantUML tree drag across the flat list rows.
 */
@Injectable({ providedIn: 'root' })
export class PlantumlDndService {
  private readonly store = inject(PlantumlStore);
  private readonly injector = inject(Injector);

  readonly scrollContainer = signal<HTMLElement | null>(null);
  readonly announcement = signal('');

  readonly isIndicatorVisible = computed(() => this.store.dropTarget()?.mode === 'between');
  readonly indicatorY = computed(() => this.store.dropTarget()?.y ?? 0);
  readonly indicatorLeft = computed(
    () => TREE_GUTTER_PX + (this.store.dropTarget()?.depth ?? 0) * PLANTUML_INDENT_PX,
  );
  readonly isIndicatorDenied = computed(() => this.store.dropTarget()?.denied ?? false);

  private root: HTMLElement | null = null;
  private scrollerRect: DOMRect | null = null;
  private listLeft = 0;
  private table: DropSlotTable = EMPTY_TABLE;
  private currentKey: string | null = null;
  private lastPoint: TxPoint | null = null;
  private expandTimer: ReturnType<typeof setTimeout> | null = null;
  private expandFolderId: string | null = null;

  registerSurface(root: HTMLElement | null, scroller: HTMLElement | null): void {
    this.root = root;
    this.scrollContainer.set(scroller);
  }

  begin(node: PlantumlNode): void {
    const ids = this.store.dragIdsFor(node.id);
    this.store.beginDrag(node, ids);
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

  private clampToScroller(rect: TxRect | null): TxRect | null {
    const bounds = this.scrollerRect;
    if (!rect || !bounds)
      return rect;
    const maxLeft = Math.max(bounds.left, bounds.right - rect.width);
    return { ...rect, left: Math.min(Math.max(rect.left, bounds.left), maxLeft) };
  }

  private measure(dragged: PlantumlNode, ids: readonly string[] = [dragged.id]): void {
    const scroller = this.scrollContainer();
    if (!scroller) {
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
    const reveal = this.store.search().trim().length > 0 || this.store.isFilterActive();
    const expanded = new Set(this.store.expandedIds());
    const isExpanded = (id: string): boolean => reveal || expanded.has(id);

    for (const info of flattenPlantumlTreeRows(this.store.items(), isExpanded)) {
      const element = elements.get(info.id);
      if (!element)
        continue;
      const rect = element.getBoundingClientRect();
      if (rows.length === 0)
        this.listLeft = rect.left;
      rows.push({ ...info, top: rect.top - originY, height: rect.height });
    }

    const draggedFolderIds = flattenPlantumlTreeRows(this.store.items(), () => true)
      .filter((row) => ids.includes(row.id) && row.kind === 'folder')
      .map((row) => row.id);

    this.table = buildPlantumlSlotTable(rows, {
      draggedId: dragged.id,
      draggedIsFolder: dragged.kind === 'folder' || draggedFolderIds.length > 0,
      draggedFolderIds,
      contentTop: 0,
      contentBottom: Math.max(scroller.scrollHeight, scrollerRect.height),
    });
  }

  private scheduleExpand(slot: DropSlot | null): void {
    const folderId = slot?.mode === 'into' ? slot.folderId : null;
    if (!folderId || this.store.expandedIds().includes(folderId)) {
      this.clearExpandHover();
      return;
    }
    if (this.expandFolderId === folderId)
      return;

    this.clearExpandHover();
    this.expandFolderId = folderId;
    this.expandTimer = setTimeout(() => {
      this.expandTimer = null;
      if (!this.store.expandedIds().includes(folderId))
        this.store.toggleExpanded(folderId);
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

  private remeasure(): void {
    const dragged = this.store.dragNode();
    if (!dragged)
      return;
    this.measure(dragged, this.store.dragIds());
    if (this.lastPoint)
      this.move(this.lastPoint);
  }
}
