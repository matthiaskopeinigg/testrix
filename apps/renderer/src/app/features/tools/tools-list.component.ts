import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import type { ToolItem } from '@testrix/contracts';
import {
  TxDraggableDirective,
  type TxDragEndEvent,
  type TxDragMoveEvent,
  type TxDragStartEvent,
} from '@testrix/ui';

import { isRangeModifier, isToggleModifier, shouldKeepPointerSelection } from '../../core/range-select';
import { WorkbenchStore } from '../workbench/workbench.store';
import { ToolsDndService } from './tools-dnd.service';
import { ToolsListItemComponent } from './tools-list-item.component';
import { ToolsStore } from './tools.store';

@Component({
  selector: 'tx-tools-list',
  standalone: true,
  imports: [TxDraggableDirective, ToolsListItemComponent],
  templateUrl: './tools-list.component.html',
  styleUrl: './tools-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolsListComponent {
  readonly store = inject(ToolsStore);
  readonly dnd = inject(ToolsDndService);
  private readonly workbench = inject(WorkbenchStore);

  handleSelect(id: string, event: MouseEvent | KeyboardEvent): void {
    const tool = this.store.toolById(id);
    if (!tool) {
      return;
    }
    if (
      shouldKeepPointerSelection({
        event,
        selectedIds: this.store.selectedIds(),
        targetId: id,
      })
    ) {
      return;
    }
    this.store.applyListPointerSelect(id, event);
    if (isRangeModifier(event) || isToggleModifier(event)) {
      return;
    }
    if (tool.id === 'plantuml') {
      this.store.drillIn(tool.id);
      return;
    }
    this.workbench.openFromTool(tool);
  }

  handleReorder(id: string, direction: -1 | 1): void {
    this.dnd.reorder(id, direction);
  }

  handleDragStarted(event: TxDragStartEvent<ToolItem>): void {
    this.dnd.begin(event.payload);
  }

  handleDragMoved(event: TxDragMoveEvent<ToolItem>): void {
    this.dnd.move(event.point);
  }

  handleDragEnded(event: TxDragEndEvent<ToolItem>): void {
    this.dnd.end(event.reason, event.releaseRect);
  }

  isJustMoved(id: string): boolean {
    return this.store.lastMovedId() === id;
  }

  isTabActive(id: string): boolean {
    const group = this.workbench.focusedGroup();
    const tab = group?.tabs.find((item) => item.id === group.activeTabId);
    if (id === 'plantuml')
      return tab?.kind === 'plantuml' || this.store.drillId() === 'plantuml';
    return tab?.kind === 'tool' && tab.nodeId === id;
  }

  handleListKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }
    if (event.altKey) {
      return;
    }
    const items = this.store.items();
    if (items.length === 0) {
      return;
    }

    const focused = (event.target instanceof Element ? event.target : null)?.closest('[data-tool-id]');
    const focusedId = focused?.getAttribute('data-tool-id');
    const index = Math.max(
      0,
      items.findIndex((item) => item.id === focusedId),
    );
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = Math.min(items.length - 1, Math.max(0, index + delta));
    const next = items[nextIndex];
    if (!next || next.id === focusedId) {
      return;
    }

    event.preventDefault();
    const row = (event.currentTarget as HTMLElement | null)?.querySelector(
      `[data-tool-id="${next.id}"] [role="option"]`,
    );
    if (row instanceof HTMLElement) {
      row.focus();
    }
  }

  dragCount(): number {
    return this.store.dragIds().length;
  }

  @HostListener('document:keydown', ['$event'])
  handleEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || this.store.selectedIds().length === 0) {
      return;
    }
    this.store.clearListSelection();
  }
}
