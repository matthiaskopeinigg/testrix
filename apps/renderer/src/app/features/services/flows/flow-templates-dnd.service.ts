import { afterNextRender, computed, inject, Injectable, Injector, signal } from '@angular/core';
import { parseFlowTemplateGroupNodeId } from '@testrix/contracts';
import type { TxDragEndReason, TxPoint, TxRect } from '@testrix/ui';

import { captureFlipPositions, playTreeFlip } from '../../collections/collections-tree-flip';
import { FlowTemplatesStore } from './flow-templates.store';
import {
  FLOW_TEMPLATES_INDENT_PX,
  TREE_GUTTER_PX,
  buildFlowTemplateSlotTable,
  flattenFlowTemplateTreeRows,
  resolveSlot,
  type DropSlotTable,
  type FlowTemplateTreeNode,
  type MeasuredRow,
} from './flow-templates-drop-model';

const OUTSIDE_SLACK_PX = 48;
const EMPTY_TABLE: DropSlotTable = { bands: [], indent: FLOW_TEMPLATES_INDENT_PX, gutter: TREE_GUTTER_PX };

/**
 * Drives one templates-tree drag across the sidebar list.
 */
@Injectable({ providedIn: 'root' })
export class FlowTemplatesDndService {
  private readonly store = inject(FlowTemplatesStore);
  private readonly injector = inject(Injector);

  readonly scrollContainer = signal<HTMLElement | null>(null);
  readonly announcement = signal('');

  readonly isIndicatorVisible = computed(() => this.store.dropTarget()?.mode === 'between');
  readonly indicatorY = computed(() => this.store.dropTarget()?.y ?? 0);
  readonly indicatorLeft = computed(
    () => TREE_GUTTER_PX + (this.store.dropTarget()?.depth ?? 0) * FLOW_TEMPLATES_INDENT_PX,
  );
  readonly isIndicatorDenied = computed(() => this.store.dropTarget()?.denied ?? false);

  private root: HTMLElement | null = null;
  private scrollerRect: DOMRect | null = null;
  private listLeft = 0;
  private table: DropSlotTable = EMPTY_TABLE;
  private currentKey: string | null = null;

  registerSurface(root: HTMLElement | null, scroller: HTMLElement | null): void {
    this.root = root;
    this.scrollContainer.set(scroller);
  }

  begin(node: FlowTemplateTreeNode): void {
    const ids = this.store.dragIdsFor(node.id);
    this.store.beginDrag(node, ids);
    this.currentKey = null;
    this.measure(node, ids);
  }

  move(point: TxPoint): void {
    const rect = this.scrollerRect;
    const scroller = this.scrollContainer();
    if (!this.store.dragNode() || !rect || !scroller)
      return;

    if (point.x < rect.left - OUTSIDE_SLACK_PX || point.x > rect.right + OUTSIDE_SLACK_PX) {
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

    // Hover-expand collapsed groups when dropping a template into them.
    if (slot?.mode === 'into' && slot.folderId && !this.store.isGroupExpanded(slot.folderId))
      this.store.setGroupExpanded(slot.folderId, true);
  }

  async end(reason: TxDragEndReason, releaseRect: TxRect | null): Promise<void> {
    this.currentKey = null;
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

  private measure(dragged: FlowTemplateTreeNode, ids: readonly string[] = [dragged.id]): void {
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

    const first = elements.values().next().value as HTMLElement | undefined;
    this.listLeft = first?.getBoundingClientRect().left ?? scrollerRect.left;

    const infos = flattenFlowTemplateTreeRows(this.store.tree(), (id) => this.store.isGroupExpanded(id));
    const rows: MeasuredRow[] = [];
    for (const info of infos) {
      const el = elements.get(info.id);
      if (!el)
        continue;
      const rect = el.getBoundingClientRect();
      rows.push({
        ...info,
        top: rect.top - scrollerRect.top + scroller.scrollTop,
        height: rect.height,
      });
    }

    const draggedFolderIds = ids.filter((id) => !!parseFlowTemplateGroupNodeId(id));
    const hasTemplates = ids.some((id) => !parseFlowTemplateGroupNodeId(id));
    const isMixed = draggedFolderIds.length > 0 && hasTemplates;

    this.table = buildFlowTemplateSlotTable(rows, {
      draggedId: dragged.id,
      draggedIsFolder: dragged.kind === 'group' || draggedFolderIds.length > 0,
      draggedFolderIds,
      denyAll: isMixed,
      contentTop: 0,
      contentBottom: Math.max(scroller.scrollHeight, scrollerRect.height),
    });
  }
}
