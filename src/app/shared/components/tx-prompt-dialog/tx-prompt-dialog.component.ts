import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxFormFieldComponent } from '../tx-form-field/tx-form-field.component';
import { TxInputComponent } from '../tx-input/tx-input.component';
import { TxModalComponent } from '../tx-modal/tx-modal.component';

/**
 * Text prompt built on `tx-modal` (Electron-safe replacement for `window.prompt`).
 */
@Component({
  selector: 'tx-prompt-dialog',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxModalComponent,
  ],
  templateUrl: './tx-prompt-dialog.component.html',
  styleUrl: './tx-prompt-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxPromptDialogComponent {
  readonly open = input(false);
  readonly title = input('Enter a name');
  readonly label = input('Name');
  readonly defaultValue = input('');
  readonly placeholder = input('');
  readonly confirmLabel = input('Save');
  readonly cancelLabel = input('Cancel');
  readonly dismissOnBackdrop = input(true);

  readonly submitted = output<string>();
  readonly cancelled = output<void>();
  readonly closed = output<void>();

  protected readonly value = signal('');

  protected readonly canSubmit = computed(() => this.value().trim().length > 0);

  constructor() {
    effect(() => {
      if (this.open()) {
        this.value.set(this.defaultValue());
      }
    });
  }

  protected handleSubmit(): void {
    const trimmed = this.value().trim();
    if (!trimmed) {
      return;
    }
    this.submitted.emit(trimmed);
  }

  protected handleCancel(): void {
    this.cancelled.emit();
    this.closed.emit();
  }

  protected handleModalClosed(): void {
    this.handleCancel();
  }
}
