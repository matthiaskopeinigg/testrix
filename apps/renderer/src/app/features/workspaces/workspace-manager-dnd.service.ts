import { afterNextRender, computed, inject, Injectable, Injector, NgZone, signal } from '@angular/core';
import type { Workspace } from '@testrix/contracts';
import type { TxDragEndReason, TxPoint, TxRect } from '@testrix/ui';

import { captureFlipPositions, playTreeFlip } from '../collections/collections-tree-flip';
import {
  moveByInsertIndex,
  resolveEnvSlot,
  type EnvMeasuredRow,
} from '../environments/environments-drop-model';
import { WorkspacesStore } from './workspaces.store';

const OUTSIDE_SLACK_PX = 48;
const INDICATOR_LEFT_PX = 8;

/** Flat-list drag for Manage workspaces. */
@Injectable()
export class WorkspaceManagerDndService {
  private readonly store = inject(WorkspacesStore);
  private readonly injector = inject(Injector);
  private readonly zone = inject(NgZone);

  readonly scrollContainer = signal<HTMLElement | null>(null);
  readonly announcement = signal('');
  readonly dragItem = signal<Workspace | null>(null);
  readonly dropTarget = signal<{ readonly index: number; readonly y: number } | null>(null);
  readonly lastMovedId = signal<string | null>(null);

  readonly isIndicatorVisible = computed(() => !!this.dragItem() && !!this.dropTarget());
  readonly indicatorY = computed(() => this.dropTarget()?.y ?? 0);
  readonly indicatorLeft = computed(() => INDICATOR_LEFT_PX);

  private root: HTMLElement | null = null;
  private rows: EnvMeasuredRow[] = [];
  private scrollerRect: DOMRect | null = null;
  private movedClearTimer: ReturnType<typeof setTimeout> | null = null;

  registerSurface(root: HTMLElement | null, scroller: HTMLElement | null): void {
    this.root = root;
    this.scrollContainer.set(scroller);
  }

  begin(item: Workspace): void {
    this.dragItem.set(item);
    this.dropTarget.set(null);
    this.measure();
  }

  move(point: TxPoint): void {
    const dragged = this.dragItem();
    const rect = this.scrollerRect;
    const scroller = this.scrollContainer();
    if (!dragged || !rect || !scroller)
      return;

    if (point.x < rect.left - OUTSIDE_SLACK_PX || point.x > rect.right + OUTSIDE_SLACK_PX) {
      this.dropTarget.set(null);
      return;
    }

    const contentBottom = Math.max(scroller.scrollHeight, rect.height);
    const y = Math.max(0, Math.min(contentBottom, point.y - rect.top + scroller.scrollTop));
    const slot = resolveEnvSlot(this.rows, y);
    this.dropTarget.set(slot ? { index: slot.index, y: slot.y } : null);
  }

  end(reason: TxDragEndReason, releaseRect: TxRect | null): void {
    this.rows = [];
    if (reason === 'cancel') {
      this.scrollerRect = null;
      this.clearDrag();
      return;
    }

    const root = this.root;
    const draggedId = this.dragItem()?.id ?? null;
    const first = root
      ? captureFlipPositions(root, { previewRect: this.clampToScroller(releaseRect), draggedId })
      : null;

    this.zone.run(() => {
      const movedId = this.commitDrop();
      this.scrollerRect = null;
      if (!root || !first || !movedId)
        return;

      afterNextRender(
        () => {
          requestAnimationFrame(() => playTreeFlip(root, first, movedId));
        },
        { injector: this.injector },
      );
    });
  }

  isDragging(id: string): boolean {
    return this.dragItem()?.id === id;
  }

  private commitDrop(): string | null {
    const dragged = this.dragItem();
    const target = this.dropTarget();
    this.clearDrag();
    if (!dragged || !target)
      return null;

    const items = this.store.items();
    const next = moveByInsertIndex(items, dragged.id, target.index);
    if (!next)
      return null;

    void this.store.reorder(next.map((item) => item.id));
    this.markMoved(dragged.id);
    this.announcement.set(`Moved ${dragged.name}`);
    return dragged.id;
  }

  private clearDrag(): void {
    this.dragItem.set(null);
    this.dropTarget.set(null);
  }

  private markMoved(id: string): void {
    this.lastMovedId.set(id);
    if (this.movedClearTimer)
      clearTimeout(this.movedClearTimer);
    this.movedClearTimer = setTimeout(() => {
      if (this.lastMovedId() === id)
        this.lastMovedId.set(null);
      this.movedClearTimer = null;
    }, 420);
  }

  private clampToScroller(rect: TxRect | null): TxRect | null {
    const bounds = this.scrollerRect;
    if (!rect || !bounds)
      return rect;
    const maxLeft = Math.max(bounds.left, bounds.right - rect.width);
    return { ...rect, left: Math.min(Math.max(rect.left, bounds.left), maxLeft) };
  }

  private measure(): void {
    const scroller = this.scrollContainer();
    if (!scroller) {
      this.rows = [];
      return;
    }

    const scrollerRect = scroller.getBoundingClientRect();
    this.scrollerRect = scrollerRect;
    const originY = scrollerRect.top - scroller.scrollTop;
    const items = this.store.items();
    const rows: EnvMeasuredRow[] = [];

    scroller.querySelectorAll('[data-flip-id]').forEach((element) => {
      if (!(element instanceof HTMLElement) || !element.dataset['flipId'])
        return;
      const id = element.dataset['flipId'];
      const index = items.findIndex((item) => item.id === id);
      if (index < 0)
        return;
      const box = element.getBoundingClientRect();
      rows.push({
        id,
        index,
        top: box.top - originY,
        height: box.height,
      });
    });

    rows.sort((left, right) => left.index - right.index);
    this.rows = rows;
  }
}
