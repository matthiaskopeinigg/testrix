import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import type { ServiceId, ServiceTreeNode } from '@testrix/contracts';
import {
  TxDraggableDirective,
  type TxDragEndEvent,
  type TxDragMoveEvent,
  type TxDragStartEvent,
} from '@testrix/ui';

import { CollabStore } from '../../collab/collab.store';
import { ServicesDndService } from '../services-dnd.service';
import { ServicesStore } from '../services.store';
import { ServiceIconComponent } from '../service-icon.component';

@Component({
  selector: 'tx-service-tree-node',
  standalone: true,
  imports: [ServiceTreeNodeComponent, ServiceIconComponent, TxDraggableDirective],
  templateUrl: './service-tree-node.component.html',
  styleUrl: './service-tree-node.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-flip-id]': 'node().id',
    '[class.is-just-moved]': 'isJustMoved()',
    '[class.is-drop-folder]': 'isDropFolder()',
  },
})
export class ServiceTreeNodeComponent {
  readonly store = inject(ServicesStore);
  readonly dnd = inject(ServicesDndService);
  private readonly collab = inject(CollabStore);

  readonly node = input.required<ServiceTreeNode<Record<string, unknown>>>();
  readonly serviceId = input.required<ServiceId>();
  readonly depth = input(0);
  readonly expandedIds = input<readonly string[]>([]);
  readonly activeId = input<string | null>(null);
  readonly selectedIds = input<readonly string[]>([]);
  readonly renamingId = input<string | null>(null);
  readonly dragDisabled = input(false);
  readonly toggle = output<string>();
  readonly open = output<ServiceTreeNode<Record<string, unknown>>>();
  readonly selectNode = output<{
    readonly node: ServiceTreeNode<Record<string, unknown>>;
    readonly event: MouseEvent;
  }>();
  readonly menu = output<{ readonly node: ServiceTreeNode<Record<string, unknown>>; readonly event: MouseEvent }>();
  readonly rename = output<{ readonly id: string; readonly name: string }>();
  readonly renameDone = output<void>();
  readonly dragStarted = output<TxDragStartEvent<ServiceTreeNode<Record<string, unknown>>>>();
  readonly dragMoved = output<TxDragMoveEvent<ServiceTreeNode<Record<string, unknown>>>>();
  readonly dragEnded = output<TxDragEndEvent<ServiceTreeNode<Record<string, unknown>>>>();

  isExpanded(): boolean {
    return this.expandedIds().includes(this.node().id);
  }

  isSelected(): boolean {
    return this.selectedIds().includes(this.node().id);
  }

  children(): readonly ServiceTreeNode<Record<string, unknown>>[] {
    const node = this.node();
    return node.kind === 'folder' ? node.children : [];
  }

  isDropFolder(): boolean {
    return this.store.isDropFolder(this.node().id);
  }

  isJustMoved(): boolean {
    return this.store.isJustMoved(this.node().id);
  }

  /** Newest shared regression result for this pack, or a live lock. */
  teamRunStatus(): 'passed' | 'failed' | 'cancelled' | 'live' | null {
    if (this.serviceId() !== 'regression' || this.node().kind !== 'artifact')
      return null;
    if (this.collab.lockFor(this.node().id))
      return 'live';
    const status = this.collab.latestRunFor(this.node().id)?.status;
    if (!status)
      return null;
    return status === 'running' ? 'live' : status;
  }

  handleRowClick(event: MouseEvent): void {
    if (this.renamingId() === this.node().id)
      return;
    this.selectNode.emit({ node: this.node(), event });
  }

  handleRowKeydown(event: KeyboardEvent): void {
    if (this.renamingId() === this.node().id)
      return;
    if (event.key !== 'Enter' && event.key !== ' ')
      return;
    event.preventDefault();
    event.stopPropagation();
    const node = this.node();
    if (node.kind === 'folder') {
      this.toggle.emit(node.id);
      return;
    }
    this.open.emit(node);
  }

  handleChevronClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.toggle.emit(this.node().id);
  }

  handleRenameInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.rename.emit({ id: this.node().id, name: target.value });
  }

  handleMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.menu.emit({ node: this.node(), event });
  }
}
