import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { isEnvironmentFolder, isEnvironmentNodeInactive, type EnvironmentNode } from '@testrix/contracts';
import { TxHintComponent } from '@testrix/ui';

export interface EnvironmentTreeSelectRequest {
  readonly node: EnvironmentNode;
  readonly event: MouseEvent | KeyboardEvent;
}

export interface EnvironmentTreeMenuRequest {
  readonly node: EnvironmentNode;
  readonly parentId: string | null;
  readonly event: Event;
}

@Component({
  selector: 'tx-environment-tree-node',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './environment-tree-node.component.html',
  styleUrl: './environment-tree-node.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentTreeNodeComponent {
  readonly node = input.required<EnvironmentNode>();
  readonly parentId = input<string | null>(null);
  readonly depth = input(0);
  readonly expanded = input(false);
  readonly focused = input(false);
  readonly selected = input(false);
  readonly renaming = input(false);
  readonly menuOpen = input(false);
  readonly toggle = output<string>();
  readonly selectNode = output<EnvironmentTreeSelectRequest>();
  readonly contextMenu = output<EnvironmentTreeMenuRequest>();
  readonly renameStart = output<string>();
  readonly renameInput = output<{ readonly id: string; readonly value: string }>();
  readonly renameKey = output<KeyboardEvent>();
  readonly renameBlur = output<void>();

  readonly isFolder = computed(() => isEnvironmentFolder(this.node()));

  readonly folderName = computed(() => {
    const node = this.node();
    return isEnvironmentFolder(node) ? node.name : '';
  });

  readonly label = computed(() => {
    const node = this.node();
    if (isEnvironmentFolder(node)) {
      return node.name.trim() || 'Untitled folder';
    }
    return node.key.trim() || 'Untitled key';
  });

  readonly description = computed(() => this.node().description.replace(/\s+/g, ' ').trim());

  readonly inactive = computed(() => isEnvironmentNodeInactive(this.node()));

  readonly rowAriaLabel = computed(() => {
    const kind = this.isFolder() ? 'folder' : 'variable';
    const parts = [this.label(), kind];
    if (this.inactive())
      parts.push('disabled');
    const description = this.description();
    if (description)
      parts.push(description);
    return parts.join(', ');
  });

  handleChevronClick(event: MouseEvent): void {
    event.stopPropagation();
    event.preventDefault();
    this.toggle.emit(this.node().id);
  }

  handleRowClick(event: MouseEvent): void {
    if (this.renaming()) {
      return;
    }
    event.stopPropagation();
    this.selectNode.emit({ node: this.node(), event });
  }

  handleRowDblClick(event: MouseEvent): void {
    if (!this.isFolder()) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.renameStart.emit(this.node().id);
  }

  handleRowKeydown(event: KeyboardEvent): void {
    if (this.renaming()) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      this.selectNode.emit({ node: this.node(), event });
      return;
    }
    if (event.key === 'ArrowRight' && this.isFolder() && !this.expanded()) {
      event.preventDefault();
      this.toggle.emit(this.node().id);
      return;
    }
    if (event.key === 'ArrowLeft' && this.isFolder() && this.expanded()) {
      event.preventDefault();
      this.toggle.emit(this.node().id);
      return;
    }
    if (event.key === 'F2' && this.isFolder()) {
      event.preventDefault();
      this.renameStart.emit(this.node().id);
    }
  }

  handleMenu(event: Event): void {
    this.contextMenu.emit({ node: this.node(), parentId: this.parentId(), event });
  }

  handleRenameInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    this.renameInput.emit({ id: this.node().id, value: target.value });
  }
}
