import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { CollectionFolderNode, CollectionHttpNode, CollectionNode, CollectionTree } from '@testrix/contracts';
import { TxDraggableDirective, type TxDragEndEvent, type TxDragMoveEvent, type TxDragStartEvent } from '@testrix/ui';

import { isRangeModifier, isToggleModifier, shouldKeepPointerSelection } from '../../core/range-select';
import { CollectionsStore } from './collections.store';
import { CollectionsDndService } from './collections-dnd.service';
import {
  CollectionsTreeNodeComponent,
  type CollectionsMenuRequest,
  type CollectionsReorderRequest,
  type CollectionsSelectRequest,
} from './collections-tree-node.component';
import { WorkbenchStore } from '../workbench/workbench.store';

@Component({
  selector: 'tx-collections-tree',
  standalone: true,
  imports: [TxDraggableDirective, CollectionsTreeNodeComponent, CollectionsTreeComponent],
  templateUrl: './collections-tree.component.html',
  styleUrl: './collections-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionsTreeComponent {
  readonly store = inject(CollectionsStore);
  readonly dnd = inject(CollectionsDndService);
  readonly workbench = inject(WorkbenchStore);

  readonly nodes = input.required<CollectionTree>();
  readonly parentId = input<string | null>(null);
  readonly depth = input(0);
  readonly renamingId = input<string | null>(null);
  readonly nodeMenu = output<CollectionsMenuRequest>();
  readonly renameStart = output<string>();
  readonly renameInput = output<{ readonly id: string; readonly value: string }>();
  readonly renameKey = output<KeyboardEvent>();
  readonly renameBlur = output<void>();

  /** Search and filters reshape the list, so reordering is meaningless while either is on. */
  readonly dragDisabled = computed(
    () => !!this.store.searchQuery().trim() || this.store.isFilterActive(),
  );

  handleToggle(id: string): void {
    this.store.toggleExpanded(id);
  }

  handleSelect(request: CollectionsSelectRequest): void {
    const { node, event } = request;
    if (
      shouldKeepPointerSelection({
        event,
        selectedIds: this.store.selectedIds(),
        targetId: node.id,
      })
    ) {
      return;
    }
    this.store.applyPointerSelect(node.id, event);
    if (isRangeModifier(event) || isToggleModifier(event)) {
      return;
    }
    if (node.kind === 'folder') {
      return;
    }
    this.workbench.openFromNode(node);
  }

  handleReorder(request: CollectionsReorderRequest): void {
    this.dnd.reorder(request.id, request.direction);
  }

  handleDragStarted(event: TxDragStartEvent<CollectionNode>): void {
    this.dnd.begin(event.payload);
  }

  handleDragMoved(event: TxDragMoveEvent<CollectionNode>): void {
    this.dnd.move(event.point);
  }

  handleDragEnded(event: TxDragEndEvent<CollectionNode>): void {
    this.dnd.end(event.reason, event.releaseRect);
  }

  isNodeOpen(nodeId: string): boolean {
    return this.workbench.isOpen(nodeId);
  }

  isNodeActive(nodeId: string): boolean {
    return this.workbench.isActive(nodeId);
  }

  isExpanded(node: CollectionNode): boolean {
    return node.kind === 'folder' && this.store.isExpanded(node.id);
  }

  asFolder(node: CollectionNode): CollectionFolderNode | null {
    return node.kind === 'folder' ? node : null;
  }

  asHttp(node: CollectionNode): CollectionHttpNode | null {
    return node.kind === 'http' ? node : null;
  }

  isDropFolder(folderId: string): boolean {
    const target = this.store.dropTarget();
    return target?.mode === 'into' && target.folderId === folderId;
  }

  isJustMoved(nodeId: string): boolean {
    return this.store.lastMovedId() === nodeId;
  }

  dragCount(): number {
    return this.store.dragIds().length;
  }
}
