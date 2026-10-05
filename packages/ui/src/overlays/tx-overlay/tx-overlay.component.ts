import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, output } from '@angular/core';

import { TxDndService } from '../../dnd/tx-dnd.service';
import { lockOverlayWindowDrag, unlockOverlayWindowDrag } from '../overlay-window-drag';

@Component({
  selector: 'tx-overlay',
  standalone: true,
  templateUrl: './tx-overlay.component.html',
  styleUrl: './tx-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxOverlayComponent {
  readonly labelledBy = input.required<string>();
  readonly variant = input<'dialog' | 'palette' | 'settings' | 'confirm'>('dialog');
  /** Widens the dialog panel for dense pickers (node catalogs, etc.). */
  readonly size = input<'md' | 'wide' | 'lg'>('md');
  readonly closed = output<void>();

  constructor() {
    inject(TxDndService).abort();
    lockOverlayWindowDrag();
    inject(DestroyRef).onDestroy(unlockOverlayWindowDrag);
  }

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.stopPropagation();
      this.closed.emit();
    }
  }
}
