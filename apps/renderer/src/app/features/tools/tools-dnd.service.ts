import { afterNextRender, computed, inject, Injectable, Injector, NgZone, signal } from '@angular/core';
import type { ToolItem } from '@testrix/contracts';
import type { TxDragEndReason, TxPoint, TxRect } from '@testrix/ui';

import { captureFlipPositions, playTreeFlip } from '../collections/collections-tree-flip';
import { resolveEnvSlot, type EnvMeasuredRow } from '../environments/environments-drop-model';
import { ToolsStore } from './tools.store';

const OUTSIDE_SLACK_PX = 48;
const INDICATOR_LEFT_PX = 8;

/**
 * Flat-list drag for development tools.
 */
@Injectable({ providedIn: 'root' })
export class ToolsDndService {
  private readonly store = inject(ToolsStore);
  private readonly injector = inject(Injector);
  private readonly zone = inject(NgZone);

  readonly scrollContainer = signal<HTMLElement | null>(null);
  readonly announcement = signal('');

  readonly isIndicatorVisible = computed(
    () => !!this.store.dragItem() && !!this.store.dropTarget(),
  );
  readonly indicatorY = computed(() => this.store.dropTarget()?.y ?? 0);
  readonly indicatorLeft = computed(() => INDICATOR_LEFT_PX);

  private root: HTMLElement | null = null;
  private rows: EnvMeasuredRow[] = [];
  private scrollerRect: DOMRect | null = null;

  registerSurface(root: HTMLElement | null, scroller: HTMLElement | null): void {
    this.root = root;
    this.scrollContainer.set(scroller);
  }

  begin(item: ToolItem): void {
    const ids = this.store.dragIdsFor(item.id);
    this.store.beginDrag(item, ids);
    this.measure();
  }

  move(point: TxPoint): void {
    const dragged = this.store.dragItem();
    const rect = this.scrollerRect;
    const scroller = this.scrollContainer();
    if (!dragged || !rect || !scroller) {
      return;
    }

    if (point.x < rect.left - OUTSIDE_SLACK_PX || point.x > rect.right + OUTSIDE_SLACK_PX) {
      this.store.setDropTarget(null);
      return;
    }

    const contentBottom = Math.max(scroller.scrollHeight, rect.height);
    const y = Math.max(0, Math.min(contentBottom, point.y - rect.top + scroller.scrollTop));
    this.store.setDropTarget(resolveEnvSlot(this.rows, y));
  }

  end(reason: TxDragEndReason, releaseRect: TxRect | null): void {
    this.rows = [];
    if (reason === 'cancel') {
      this.scrollerRect = null;
      this.store.endDrag();
      return;
    }

    const root = this.root;
    const draggedId = this.store.dragItem()?.id ?? null;
    const first = root
      ? captureFlipPositions(root, { previewRect: this.clampToScroller(releaseRect), draggedId })
      : null;

    this.zone.run(() => {
      const movedId = this.store.commitDrop();
      this.scrollerRect = null;
      if (!root || !first || !movedId) {
        return;
      }

      afterNextRender(
        () => {
          requestAnimationFrame(() => playTreeFlip(root, first, movedId));
        },
        { injector: this.injector },
      );
    });
  }

  reorder(id: string, direction: -1 | 1): void {
    const message = this.store.moveByDirection(id, direction);
    this.announcement.set(message ?? 'Cannot move further in that direction');
  }

  private clampToScroller(rect: TxRect | null): TxRect | null {
    const bounds = this.scrollerRect;
    if (!rect || !bounds) {
      return rect;
    }
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
      if (!(element instanceof HTMLElement) || !element.dataset['flipId']) {
        return;
      }
      const id = element.dataset['flipId'];
      const index = items.findIndex((item) => item.id === id);
      if (index < 0) {
        return;
      }
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
