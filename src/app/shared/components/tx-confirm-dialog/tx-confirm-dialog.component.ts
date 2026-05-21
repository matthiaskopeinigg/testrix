import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxModalComponent } from '../tx-modal/tx-modal.component';

export type TxConfirmDialogVariant = 'default' | 'danger';

/**
 * Confirmation prompt built on `tx-modal` for destructive or irreversible actions.
 */
@Component({
  selector: 'tx-confirm-dialog',
  standalone: true,
  imports: [TxButtonComponent, TxModalComponent],
  templateUrl: './tx-confirm-dialog.component.html',
  styleUrl: './tx-confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxConfirmDialogComponent {
  readonly open = input(false);
  readonly title = input('Confirm');
  readonly message = input('');
  readonly confirmLabel = input('Confirm');
  readonly cancelLabel = input('Cancel');
  readonly variant = input<TxConfirmDialogVariant>('default');
  readonly dismissOnBackdrop = input(true);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
  readonly closed = output<void>();

  protected handleConfirm(): void {
    this.confirmed.emit();
  }

  protected handleCancel(): void {
    this.cancelled.emit();
    this.closed.emit();
  }

  protected handleModalClosed(): void {
    this.handleCancel();
  }
}
