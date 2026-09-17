import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import {
  isEnvironmentFolder,
  type EnvironmentFolder,
  type EnvironmentNode,
} from '@testrix/contracts';
import {
  TxDraggableDirective,
  type TxDragEndEvent,
  type TxDragMoveEvent,
  type TxDragStartEvent,
} from '@testrix/ui';

import { EnvironmentsStore } from '../environments/environments.store';
import { EnvironmentEditorDndService } from './environment-editor-dnd.service';
import {
  EnvironmentTreeNodeComponent,
  type EnvironmentTreeMenuRequest,
  type EnvironmentTreeSelectRequest,
} from './environment-tree-node.component';

@Component({
  selector: 'tx-environment-tree',
  standalone: true,
  imports: [TxDraggableDirective, EnvironmentTreeNodeComponent, EnvironmentTreeComponent],
  templateUrl: './environment-tree.component.html',
  styleUrl: './environment-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentTreeComponent {
  private readonly environments = inject(EnvironmentsStore);
  readonly dnd = inject(EnvironmentEditorDndService);

  readonly nodes = input.required<readonly EnvironmentNode[]>();
  readonly envId = input.required<string>();
  readonly parentId = input<string | null>(null);
  readonly depth = input(0);
  readonly focusedId = input<string | null>(null);
  readonly renamingId = input<string | null>(null);
  readonly menuTargetId = input<string | null>(null);
  readonly dragDisabled = input(false);
  readonly selectNode = output<EnvironmentTreeSelectRequest>();
  readonly toggle = output<string>();
  readonly nodeMenu = output<EnvironmentTreeMenuRequest>();
  readonly renameStart = output<string>();
  readonly renameInput = output<{ readonly id: string; readonly value: string }>();
  readonly renameKey = output<KeyboardEvent>();
  readonly renameBlur = output<void>();

  readonly dragCount = computed(() => this.dnd.dragIds().length);

  isSelected(id: string): boolean {
    return this.environments.nodeSelectionFor(this.envId()).ids.includes(id);
  }

  isExpanded(node: EnvironmentNode): boolean {
    return isEnvironmentFolder(node) && !node.collapsed;
  }

  asFolder(node: EnvironmentNode): EnvironmentFolder | null {
    return isEnvironmentFolder(node) ? node : null;
  }

  isDropFolder(id: string): boolean {
    return this.dnd.isDropFolder(id);
  }

  isJustMoved(id: string): boolean {
    return this.dnd.isJustMoved(id);
  }

  handleDragStarted(event: TxDragStartEvent<EnvironmentNode>): void {
    const ids = this.environments.dragNodeIdsFor(this.envId(), event.payload.id);
    this.dnd.begin(event.payload, this.parentId(), ids);
  }

  handleDragMoved(event: TxDragMoveEvent<EnvironmentNode>): void {
    this.dnd.move(event.point);
  }

  handleDragEnded(event: TxDragEndEvent<EnvironmentNode>): void {
    this.dnd.end(event.reason, event.releaseRect);
  }

  previewName(node: EnvironmentNode): string {
    if (isEnvironmentFolder(node)) {
      return node.name.trim() || 'Untitled folder';
    }
    return node.key.trim() || 'Untitled key';
  }
}
