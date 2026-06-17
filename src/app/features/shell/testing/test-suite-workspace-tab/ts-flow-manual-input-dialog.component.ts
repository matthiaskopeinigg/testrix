import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { FlowManualInputPrompt } from '@shared/testing';

import { TxAutofocusDirective } from '@app/shared/directives/tx-autofocus.directive';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxModalComponent } from '@app/shared/components/tx-modal/tx-modal.component';

export interface FlowManualInputDialogSubmit {
  readonly requestId: string;
  readonly value: string;
}

@Component({
  selector: 'app-ts-flow-manual-input-dialog',
  standalone: true,
  imports: [
    FormsModule,
    TxAutofocusDirective,
    TxButtonComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxModalComponent,
  ],
  templateUrl: './ts-flow-manual-input-dialog.component.html',
  styleUrl: './ts-flow-manual-input-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowManualInputDialogComponent {
  readonly prompt = input<FlowManualInputPrompt | null>(null);

  readonly submitted = output<FlowManualInputDialogSubmit>();
  readonly cancelled = output<string>();

  protected readonly value = signal('');

  constructor() {
    effect(() => {
      if (this.prompt()) {
        this.value.set('');
      }
    });
  }

  protected dialogTitle(): string {
    const current = this.prompt();
    if (!current) {
      return 'Manual input';
    }
    const name = current.stepName.trim();
    return name || 'Manual input';
  }

  protected handleContinue(): void {
    const current = this.prompt();
    if (!current) {
      return;
    }

    this.submitted.emit({
      requestId: current.requestId,
      value: this.value(),
    });
  }

  protected handleCancel(): void {
    const current = this.prompt();
    if (!current) {
      return;
    }

    this.cancelled.emit(current.requestId);
  }

  protected handleModalClosed(): void {
    this.handleCancel();
  }
}
