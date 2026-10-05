import { Injectable, computed, inject, signal } from '@angular/core';
import {
  orderTools,
  type ToolItem,
} from '@testrix/contracts';

import { DesktopApiService } from '../../core/desktop-api.service';
import { applyPointerSelect, emptySelection, type SelectionEntry } from '../../core/range-select';
import {
  moveByInsertIndex,
  moveManyByInsertIndex,
  type EnvDropSlot,
} from '../environments/environments-drop-model';

export type ToolsDrillId = 'plantuml';

@Injectable({ providedIn: 'root' })
export class ToolsStore {
  private readonly desktop = inject(DesktopApiService);

  readonly items = signal<ToolItem[]>(orderTools([]));
  readonly drillId = signal<ToolsDrillId | null>(null);
  readonly paneSlideDir = signal<'left' | 'right' | null>(null);
  readonly dragItem = signal<ToolItem | null>(null);
  readonly dragIds = signal<readonly string[]>([]);
  readonly dropTarget = signal<EnvDropSlot | null>(null);
  readonly lastMovedId = signal<string | null>(null);
  readonly selectedIds = signal<readonly string[]>([]);
  readonly selectionAnchorId = signal<string | null>(null);

  private moveAnimTimer: ReturnType<typeof setTimeout> | null = null;
  private persistEnabled = false;

  readonly hasItems = computed(() => this.items().length > 0);
  readonly isDrilled = computed(() => this.drillId() !== null);

  hydrate(): void {
    this.persistEnabled = false;
    this.items.set(orderTools(this.desktop.settings().toolsOrderIds));
    const drill = this.desktop.session().toolsDrill;
    this.drillId.set(drill === 'plantuml' ? drill : null);
    this.persistEnabled = true;
  }

  sessionPatch(): Pick<import('@testrix/contracts').SessionFile, 'toolsDrill'> {
    return { toolsDrill: this.drillId() };
  }

  drillIn(id: ToolsDrillId): void {
    if (this.drillId() === id)
      return;
    this.paneSlideDir.set('right');
    this.drillId.set(id);
  }

  back(): void {
    if (!this.drillId())
      return;
    this.paneSlideDir.set('left');
    this.drillId.set(null);
  }

  toolById(id: string): ToolItem | null {
    return this.items().find((item) => item.id === id) ?? null;
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  applyListPointerSelect(
    targetId: string,
    event: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean },
  ): SelectionEntry {
    const next = applyPointerSelect({
      event,
      visibleIds: this.items().map((item) => item.id),
      selectedIds: this.selectedIds(),
      anchorId: this.selectionAnchorId(),
      targetId,
    });
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);
    return next;
  }

  clearListSelection(): void {
    const next = emptySelection();
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);
  }

  dragIdsFor(sourceId: string): readonly string[] {
    const selected = this.selectedIds();
    if (selected.includes(sourceId)) {
      return this.items()
        .map((item) => item.id)
        .filter((id) => selected.includes(id));
    }
    this.selectedIds.set([sourceId]);
    this.selectionAnchorId.set(sourceId);
    return [sourceId];
  }

  beginDrag(item: ToolItem, ids: readonly string[] = [item.id]): void {
    this.dragItem.set(item);
    this.dragIds.set(ids.length > 0 ? ids : [item.id]);
    this.dropTarget.set(null);
  }

  setDropTarget(target: EnvDropSlot | null): void {
    this.dropTarget.set(target);
  }

  endDrag(): void {
    this.dragItem.set(null);
    this.dragIds.set([]);
    this.dropTarget.set(null);
  }

  /**
   * Applies the current drop target, then clears drag state.
   */
  commitDrop(): string | null {
    const dragged = this.dragItem();
    const target = this.dropTarget();
    const ids = this.dragIds().length > 0 ? this.dragIds() : dragged ? [dragged.id] : [];
    this.endDrag();
    if (!dragged || !target || ids.length === 0) {
      return null;
    }
    if (ids.length > 1) {
      const next = moveManyByInsertIndex(this.items(), ids, target.index);
      if (!next) {
        return null;
      }
      this.items.set(next);
      this.markMoved(dragged.id);
      this.persist();
      return dragged.id;
    }
    return this.moveToInsertIndex(dragged.id, target.index);
  }

  /**
   * Keyboard equivalent of a one-slot drag.
   */
  moveByDirection(id: string, direction: -1 | 1): string | null {
    const ids = this.dragIdsFor(id);
    const items = this.items();
    const ordered = items.filter((item) => ids.includes(item.id));
    if (ordered.length === 0) {
      return null;
    }
    const first = items.findIndex((item) => item.id === ordered[0].id);
    const last = items.findIndex((item) => item.id === ordered[ordered.length - 1].id);
    if (first < 0 || last < 0) {
      return null;
    }
    const insertIndex = direction < 0 ? first - 1 : last + 2;
    if (insertIndex < 0 || insertIndex > items.length) {
      return null;
    }
    if (ids.length === 1) {
      const moved = this.moveToInsertIndex(ids[0], insertIndex);
      if (!moved) {
        return null;
      }
      const name = ordered[0]?.label ?? 'Tool';
      return direction < 0 ? `Moved ${name} up` : `Moved ${name} down`;
    }
    const next = moveManyByInsertIndex(items, ids, insertIndex);
    if (!next) {
      return null;
    }
    this.items.set(next);
    this.markMoved(id);
    this.persist();
    const count = ordered.length;
    return direction < 0 ? `Moved ${count} tools up` : `Moved ${count} tools down`;
  }

  private moveToInsertIndex(id: string, insertIndex: number): string | null {
    const next = moveByInsertIndex(this.items(), id, insertIndex);
    if (!next) {
      return null;
    }
    this.items.set(next);
    this.markMoved(id);
    this.persist();
    return id;
  }

  private markMoved(id: string): void {
    if (this.moveAnimTimer) {
      clearTimeout(this.moveAnimTimer);
      this.moveAnimTimer = null;
    }
    this.lastMovedId.set(null);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.lastMovedId.set(id);
        this.moveAnimTimer = setTimeout(() => {
          if (this.lastMovedId() === id) {
            this.lastMovedId.set(null);
          }
          this.moveAnimTimer = null;
        }, 320);
      });
    });
  }

  private persist(): void {
    if (!this.persistEnabled) {
      return;
    }
    void this.desktop.patchSettings({
      toolsOrderIds: this.items().map((item) => item.id),
    });
  }
}
