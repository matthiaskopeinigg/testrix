import { ChangeDetectionStrategy, Component, HostListener, computed, inject, input, output } from '@angular/core';
import type { Environment } from '@testrix/contracts';
import {
  TxDraggableDirective,
  type TxDragEndEvent,
  type TxDragMoveEvent,
  type TxDragStartEvent,
} from '@testrix/ui';

import { isRangeModifier, isToggleModifier, shouldKeepPointerSelection } from '../../core/range-select';
import { WorkbenchStore } from '../workbench/workbench.store';
import { EnvironmentsDndService } from './environments-dnd.service';
import {
  EnvironmentsListItemComponent,
  type EnvironmentsMenuRequest,
} from './environments-list-item.component';
import { EnvironmentsStore } from './environments.store';

@Component({
  selector: 'tx-environments-list',
  standalone: true,
  imports: [TxDraggableDirective, EnvironmentsListItemComponent],
  templateUrl: './environments-list.component.html',
  styleUrl: './environments-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnvironmentsListComponent {
  readonly store = inject(EnvironmentsStore);
  readonly dnd = inject(EnvironmentsDndService);
  private readonly workbench = inject(WorkbenchStore);

  readonly renamingId = input<string | null>(null);
  readonly itemMenu = output<EnvironmentsMenuRequest>();
  readonly renameStart = output<string>();
  readonly renameInput = output<{ readonly id: string; readonly value: string }>();
  readonly renameKey = output<KeyboardEvent>();
  readonly renameBlur = output<void>();

  readonly dragDisabled = computed(() => !!this.store.searchQuery().trim());

  handleSelect(id: string, event: MouseEvent | KeyboardEvent): void {
    const env = this.store.environmentById(id);
    if (!env) {
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
    this.workbench.openFromEnvironment(env);
  }

  handleReorder(id: string, direction: -1 | 1): void {
    this.dnd.reorder(id, direction);
  }

  handleDragStarted(event: TxDragStartEvent<Environment>): void {
    this.dnd.begin(event.payload);
  }

  handleDragMoved(event: TxDragMoveEvent<Environment>): void {
    this.dnd.move(event.point);
  }

  handleDragEnded(event: TxDragEndEvent<Environment>): void {
    this.dnd.end(event.reason, event.releaseRect);
  }

  isJustMoved(id: string): boolean {
    return this.store.lastMovedId() === id;
  }

  isTabActive(id: string): boolean {
    const group = this.workbench.focusedGroup();
    const tab = group?.tabs.find((item) => item.id === group.activeTabId);
    return tab?.kind === 'environment' && tab.nodeId === id;
  }

  handleListKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }
    if (event.altKey) {
      return;
    }
    const items = this.store.visibleEnvironments();
    if (items.length === 0) {
      return;
    }

    const focused = (event.target instanceof Element ? event.target : null)?.closest('[data-env-id]');
    const focusedId = focused?.getAttribute('data-env-id');
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
      `[data-env-id="${next.id}"] [role="option"]`,
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
    if (event.key !== 'Escape' || this.store.selectedIds().length === 0 || this.renamingId()) {
      return;
    }
    this.store.clearListSelection();
  }
}
