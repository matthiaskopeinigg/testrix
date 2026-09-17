import { afterNextRender, computed, inject, Injectable, Injector, signal } from '@angular/core';
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
} from './database-drop-model';
import { captureFlipPositions, playTreeFlip } from './database-tree-flip';
import type { DatabaseNavNode, DatabaseNavSection } from './database-nav';
import { DatabaseStore } from './database.store';

const EXPAND_HOVER_MS = 450;
const OUTSIDE_SLACK_PX = 48;

@Injectable({ providedIn: 'root' })
export class DatabaseDndService {
  private readonly store = inject(DatabaseStore);
  private readonly injector = inject(Injector);

  readonly scrollContainer = signal<HTMLElement | null>(null);
  readonly announcement = signal('');

  readonly isIndicatorVisible = computed(() => this.store.dropTarget()?.mode === 'between');
  readonly indicatorY = computed(() => {
    const y = this.store.dropTarget()?.y ?? 0;
    const scrollTop = this.scrollContainer()?.scrollTop ?? 0;
    return this.sectionOffsetTop + y - scrollTop;
  });
  readonly indicatorLeft = computed(
    () => TREE_GUTTER_PX + (this.store.dropTarget()?.depth ?? 0) * TREE_INDENT_PX,
  );
  readonly isIndicatorDenied = computed(() => this.store.dropTarget()?.denied ?? false);

  private root: HTMLElement | null = null;
  private rootScroller: HTMLElement | null = null;
  private sectionOffsetTop = 0;
  private table: DropSlotTable = EMPTY_SLOT_TABLE;
  private scrollerRect: DOMRect | null = null;
  private listLeft = 0;
  private currentKey: string | null = null;
  private lastPoint: TxPoint | null = null;
  private expandTimer: ReturnType<typeof setTimeout> | null = null;
  private expandFolderId: string | null = null;
  private section: DatabaseNavSection | null = null;

  registerSurface(root: HTMLElement | null, scroller: HTMLElement | null): void {
    this.root = root;
    this.rootScroller = scroller;
    this.scrollContainer.set(scroller);
  }

  begin(node: DatabaseNavNode): void {
    this.section = node.section;
    const ids = this.store.dragIdsFor(node.id, node.section);
    this.store.beginDrag(node, ids);
    this.currentKey = null;
    this.lastPoint = null;
    const row = this.root?.querySelector(`[data-node-id="${cssEscape(node.id)}"]`);
    const sectionBody = row instanceof Element ? row.closest('.tx-database__section-body') : null;
    this.scrollContainer.set(sectionBody instanceof HTMLElement ? sectionBody : this.rootScroller);
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
    this.section = null;
    if (!root || !first || !movedId)
      return;
    afterNextRender(
      () => {
        requestAnimationFrame(() => playTreeFlip(root, first, movedId));
      },
      { injector: this.injector },
    );
  }

  reorder(nodeId: string, direction: -1 | 1, section: DatabaseNavSection): void {
    const message = this.store.moveWithinParent(nodeId, direction, section);
    this.announcement.set(message ?? 'Cannot move further in that direction');
  }

  private clampToScroller(rect: TxRect | null): TxRect | null {
    const bounds = this.scrollerRect;
    if (!rect || !bounds)
      return rect;
    const maxLeft = Math.max(bounds.left, bounds.right - rect.width);
    return { ...rect, left: Math.min(Math.max(rect.left, bounds.left), maxLeft) };
  }

  private measure(dragged: DatabaseNavNode, ids: readonly string[]): void {
    const scroller = this.scrollContainer();
    if (!scroller) {
      this.table = EMPTY_SLOT_TABLE;
      return;
    }
    const scrollerRect = scroller.getBoundingClientRect();
    this.scrollerRect = scrollerRect;
    const content = this.root?.querySelector('.tx-database__content');
    const contentRect = content?.getBoundingClientRect();
    this.sectionOffsetTop = contentRect ? scrollerRect.top - contentRect.top : 0;
    const elements = new Map<string, HTMLElement>();
    scroller.querySelectorAll('[data-node-id]').forEach((element) => {
      if (element instanceof HTMLElement && element.dataset['nodeId'] && element.dataset['section'] === dragged.section)
        elements.set(element.dataset['nodeId'], element);
    });
    const originY = scrollerRect.top - scroller.scrollTop;
    const rows: MeasuredRow[] = [];
    this.listLeft = scrollerRect.left;
    const tree =
      dragged.section === 'connections' ? this.store.visibleConnectionTree() : this.store.visibleQueryTree();
    for (const info of flattenTree(tree, (id) => this.store.isExpanded(id))) {
      const element = elements.get(info.id);
      if (!element)
        continue;
      const rect = element.getBoundingClientRect();
      if (rows.length === 0)
        this.listLeft = rect.left;
      rows.push({ ...info, top: rect.top - originY, height: rect.height });
    }
    const source =
      dragged.section === 'connections' ? this.store.visibleConnectionTree() : this.store.visibleQueryTree();
    const draggedFolderIds = flattenTree(source, () => true)
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
    if (this.expandFolderId === folderId)
      return;
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

  private remeasure(): void {
    const dragged = this.store.dragNode();
    if (!dragged)
      return;
    this.measure(dragged, this.store.dragIds());
    if (this.lastPoint)
      this.move(this.lastPoint);
  }
}

function cssEscape(value: string): string {
  return globalThis.CSS?.escape?.(value) ?? value;
}
