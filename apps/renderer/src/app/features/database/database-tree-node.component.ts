import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TxHintComponent, TxSpinnerComponent } from '@testrix/ui';

import {
  isDatabaseCatalogNav,
  isDatabaseDraggableNav,
  isDatabaseExpandableNav,
  type DatabaseNavNode,
} from './database-nav';
import { DatabaseTypeIconComponent } from './database-type-icon.component';

export interface DatabaseReorderRequest {
  readonly id: string;
  readonly direction: -1 | 1;
}

export interface DatabaseSelectRequest {
  readonly node: DatabaseNavNode;
  readonly event: MouseEvent | KeyboardEvent;
}

export interface DatabaseMenuRequest {
  readonly node: DatabaseNavNode;
  readonly event: MouseEvent;
}

@Component({
  selector: 'tx-database-tree-node',
  standalone: true,
  imports: [TxHintComponent, DatabaseTypeIconComponent, TxSpinnerComponent],
  templateUrl: './database-tree-node.component.html',
  styleUrl: './database-tree-node.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseTreeNodeComponent {
  readonly node = input.required<DatabaseNavNode>();
  readonly depth = input(0);
  readonly expanded = input(false);
  readonly open = input(false);
  readonly active = input(false);
  readonly selected = input(false);
  readonly renaming = input(false);
  readonly busy = input(false);
  readonly toggle = output<string>();
  readonly selectNode = output<DatabaseSelectRequest>();
  readonly reorder = output<DatabaseReorderRequest>();
  readonly nodeMenu = output<DatabaseMenuRequest>();
  readonly renameStart = output<string>();
  readonly renameInput = output<{ readonly id: string; readonly value: string }>();
  readonly renameKey = output<KeyboardEvent>();
  readonly renameBlur = output<void>();

  readonly expandable = computed(() => isDatabaseExpandableNav(this.node()));

  readonly iconKind = computed(() => {
    const node = this.node();
    if (node.kind === 'connection')
      return 'engine' as const;
    if (node.kind === 'query')
      return 'query' as const;
    if (node.kind === 'folder')
      return 'folder' as const;
    if (node.kind === 'view')
      return 'view' as const;
    if (node.kind === 'table')
      return 'table' as const;
    if (node.kind === 'schema')
      return 'schema' as const;
    if (node.kind === 'column')
      return 'column' as const;
    if (node.kind === 'index')
      return 'index' as const;
    if (node.kind === 'fk')
      return 'fk' as const;
    if (node.kind === 'routine')
      return 'routine' as const;
    if (node.kind === 'trigger')
      return 'trigger' as const;
    if (node.kind === 'sequence')
      return 'sequence' as const;
    if (node.kind === 'user')
      return 'user' as const;
    if (node.kind === 'group')
      return 'folder' as const;
    return 'picker' as const;
  });

  readonly rowAriaLabel = computed(() => this.node().name);
  readonly canRename = computed(() => isDatabaseDraggableNav(this.node()));
  readonly status = computed(() => this.node().status ?? 'unknown');

  handleChevronClick(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.toggle.emit(this.node().id);
  }

  handleRowClick(event: MouseEvent): void {
    if (this.renaming())
      return;
    event.stopPropagation();
    this.selectNode.emit({ node: this.node(), event });
  }

  handleRowDblClick(event: MouseEvent): void {
    if (this.renaming())
      return;
    event.stopPropagation();
    this.selectNode.emit({ node: this.node(), event });
  }

  handleMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.nodeMenu.emit({ node: this.node(), event });
  }

  handleRowKeydown(event: KeyboardEvent): void {
    if (this.renaming())
      return;
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      this.reorder.emit({ id: this.node().id, direction: event.key === 'ArrowUp' ? -1 : 1 });
      return;
    }
    if (event.key === 'F2' && this.canRename()) {
      event.preventDefault();
      this.renameStart.emit(this.node().id);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectNode.emit({ node: this.node(), event });
    }
  }

  handleRenameInput(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement)
      this.renameInput.emit({ id: this.node().id, value: target.value });
  }

  catalogHint(): boolean {
    return isDatabaseCatalogNav(this.node());
  }
}
