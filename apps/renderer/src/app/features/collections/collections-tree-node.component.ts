import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { CollectionNode } from '@testrix/contracts';

import { CollectionHealthService } from './collection-health.service';

/** Keyboard request to shift a row one slot within its parent. */
export interface CollectionsReorderRequest {
  readonly id: string;
  readonly direction: -1 | 1;
}

export interface CollectionsSelectRequest {
  readonly node: CollectionNode;
  readonly event: MouseEvent | KeyboardEvent;
}

export interface CollectionsMenuRequest {
  readonly node: CollectionNode;
  readonly event: MouseEvent;
}

@Component({
  selector: 'tx-collections-tree-node',
  standalone: true,
  templateUrl: './collections-tree-node.component.html',
  styleUrl: './collections-tree-node.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionsTreeNodeComponent {
  private readonly health = inject(CollectionHealthService);
  readonly node = input.required<CollectionNode>();
  readonly depth = input(0);
  readonly expanded = input(false);
  readonly open = input(false);
  readonly active = input(false);
  readonly selected = input(false);
  readonly renaming = input(false);
  readonly toggle = output<string>();
  readonly selectNode = output<CollectionsSelectRequest>();
  readonly reorder = output<CollectionsReorderRequest>();
  readonly nodeMenu = output<CollectionsMenuRequest>();
  readonly renameStart = output<string>();
  readonly renameInput = output<{ readonly id: string; readonly value: string }>();
  readonly renameKey = output<KeyboardEvent>();
  readonly renameBlur = output<void>();

  readonly httpNode = computed(() => {
    const node = this.node();
    return node.kind === 'http' ? node : null;
  });

  readonly isLeaf = computed(() => {
    const kind = this.node().kind;
    return kind === 'http' || kind === 'websocket';
  });

  readonly healthMark = computed(() => this.health.markFor(this.node().id));

  readonly rowAriaLabel = computed(() => {
    const node = this.node();
    const base = node.kind === 'folder'
      ? (this.expanded() ? `Collapse ${node.name}` : `Expand ${node.name}`)
      : node.kind === 'http'
        ? `Open ${node.method} ${node.name}`
        : `Open WebSocket ${node.name}`;
    const mark = this.healthMark();
    return mark ? `${base}. ${mark.label}` : base;
  });

  handleChevronClick(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.toggle.emit(this.node().id);
  }

  /** Drag-then-click is swallowed upstream by `txDraggable`, so this only sees real clicks. */
  handleRowClick(event: MouseEvent): void {
    if (this.renaming())
      return;
    event.stopPropagation();
    this.selectNode.emit({ node: this.node(), event });
  }

  handleRowKeydown(event: KeyboardEvent): void {
    if (this.renaming())
      return;
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      event.stopPropagation();
      this.reorder.emit({ id: this.node().id, direction: event.key === 'ArrowUp' ? -1 : 1 });
      return;
    }
    if (event.key === 'F2') {
      event.preventDefault();
      event.stopPropagation();
      this.renameStart.emit(this.node().id);
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ')
      return;
    event.preventDefault();
    event.stopPropagation();
    this.selectNode.emit({ node: this.node(), event });
  }

  handleMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.nodeMenu.emit({ node: this.node(), event });
  }

  handleHealthClick(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.health.show(this.node().id);
  }

  handleRenameInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.renameInput.emit({ id: this.node().id, value: target.value });
  }
}
