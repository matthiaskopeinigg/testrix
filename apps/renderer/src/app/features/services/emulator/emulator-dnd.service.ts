import { afterNextRender, computed, inject, Injectable, Injector, NgZone, signal } from '@angular/core';
import type { EmulatorDeviceRecord } from '@testrix/contracts';
import type { TxDragEndReason, TxPoint, TxRect } from '@testrix/ui';

import { DesktopApiService } from '../../../core/desktop-api.service';
import { captureFlipPositions, playTreeFlip } from '../../collections/collections-tree-flip';
import {
  moveByInsertIndex,
  moveManyByInsertIndex,
  resolveEnvSlot,
  type EnvDropSlot,
  type EnvMeasuredRow,
} from '../../environments/environments-drop-model';

const OUTSIDE_SLACK_PX = 48;
const INDICATOR_LEFT_PX = 8;

/**
 * Flat-list drag for emulator devices. Same indicator + flip path as environments.
 */
@Injectable()
export class EmulatorDndService {
  private readonly desktop = inject(DesktopApiService);
  private readonly injector = inject(Injector);
  private readonly zone = inject(NgZone);

  readonly scrollContainer = signal<HTMLElement | null>(null);
  readonly announcement = signal('');
  readonly dragItem = signal<EmulatorDeviceRecord | null>(null);
  readonly dragIds = signal<readonly string[]>([]);
  readonly dropTarget = signal<EnvDropSlot | null>(null);
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

  begin(item: EmulatorDeviceRecord, ids: readonly string[]): void {
    this.dragItem.set(item);
    this.dragIds.set(ids.length > 0 ? ids : [item.id]);
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
    this.dropTarget.set(resolveEnvSlot(this.rows, y));
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

  reorder(id: string, direction: -1 | 1, selectedIds: readonly string[]): string | null {
    const devices = this.desktop.emulator().devices;
    const ids =
      selectedIds.includes(id) && selectedIds.length > 1
        ? devices.map((item) => item.id).filter((itemId) => selectedIds.includes(itemId))
        : [id];
    const ordered = devices.filter((item) => ids.includes(item.id));
    if (ordered.length === 0)
      return null;

    const first = devices.findIndex((item) => item.id === ordered[0].id);
    const last = devices.findIndex((item) => item.id === ordered[ordered.length - 1].id);
    if (first < 0 || last < 0)
      return null;

    const insertIndex = direction < 0 ? first - 1 : last + 2;
    if (insertIndex < 0 || insertIndex > devices.length)
      return null;

    const next =
      ids.length === 1
        ? moveByInsertIndex(devices, ids[0], insertIndex)
        : moveManyByInsertIndex(devices, ids, insertIndex);
    if (!next)
      return null;

    void this.desktop.saveEmulator({ devices: next });
    this.markMoved(ordered[0].id);
    const name = ordered[0]?.name ?? 'Device';
    const message = direction < 0 ? `Moved ${name} up` : `Moved ${name} down`;
    this.announcement.set(message);
    return message;
  }

  private commitDrop(): string | null {
    const dragged = this.dragItem();
    const target = this.dropTarget();
    const ids = this.dragIds().length > 0 ? this.dragIds() : dragged ? [dragged.id] : [];
    this.clearDrag();
    if (!dragged || !target || ids.length === 0)
      return null;

    const devices = this.desktop.emulator().devices;
    const next =
      ids.length > 1
        ? moveManyByInsertIndex(devices, ids, target.index)
        : moveByInsertIndex(devices, dragged.id, target.index);
    if (!next)
      return null;

    void this.desktop.saveEmulator({ devices: next });
    this.markMoved(dragged.id);
    return dragged.id;
  }

  private clearDrag(): void {
    this.dragItem.set(null);
    this.dragIds.set([]);
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
    const items = this.desktop.emulator().devices;
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
