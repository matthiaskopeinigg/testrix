import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { TxIconName } from '@app/shared/icons';

import { TxIconComponent } from '../tx-icon/tx-icon.component';

@Component({
  selector: 'tx-tab',
  standalone: true,
  imports: [TxIconComponent],
  templateUrl: './tx-tab.component.html',
  styleUrl: './tx-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-tab-host',
    '[class.tx-tab-host--active]': 'active()',
    '[class.tx-tab-host--pinned]': 'pinned()',
    '[class.tx-tab-host--dirty]': 'dirty()',
    '[attr.draggable]': 'draggable() ? "true" : null',
    role: 'tab',
    '[attr.aria-selected]': 'active()',
    '[attr.tabindex]': 'active() ? 0 : -1',
    '(dragstart)': 'handleDragStart($event)',
    '(dragend)': 'handleDragEnd($event)',
    '(contextmenu)': 'handleContextMenu($event)',
  },
})
export class TxTabComponent {
  readonly label = input.required<string>();
  readonly icon = input<TxIconName | undefined>(undefined);
  readonly method = input<string | undefined>(undefined);
  readonly active = input(false);
  readonly pinned = input(false);
  readonly dirty = input(false);
  readonly draggable = input(true);

  readonly activated = output<void>();
  readonly closed = output<void>();
  readonly pinToggled = output<void>();
  readonly dragStarted = output<DragEvent>();
  readonly dragEnded = output<DragEvent>();
  readonly contextMenu = output<MouseEvent>();

  protected handleClick(event: MouseEvent): void {
    if (event.button !== 0) {
      return;
    }
    this.activated.emit();
  }

  protected handleCloseClick(event: MouseEvent): void {
    event.stopPropagation();
    this.closed.emit();
  }

  protected handlePinClick(event: MouseEvent): void {
    event.stopPropagation();
    this.pinToggled.emit();
  }

  protected handleDragStart(event: DragEvent): void {
    if (!this.draggable()) {
      event.preventDefault();
      return;
    }
    this.dragStarted.emit(event);
  }

  protected handleDragEnd(event: DragEvent): void {
    this.dragEnded.emit(event);
  }

  protected handleContextMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenu.emit(event);
  }
}
