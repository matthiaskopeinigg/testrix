import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxModalComponent } from '@app/shared/components/overlays/tx-modal/tx-modal.component';
import { TxAutofocusDirective } from '@app/shared/directives/tx-autofocus.directive';

/**
 * Collects values for `:named` SQL parameters before Run.
 */
@Component({
  selector: 'app-database-query-params-dialog',
  standalone: true,
  imports: [
    FormsModule,
    TxAutofocusDirective,
    TxButtonComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxModalComponent,
  ],
  templateUrl: './database-query-params-dialog.component.html',
  styleUrl: './database-query-params-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatabaseQueryParamsDialogComponent {
  readonly open = input(false);
  readonly names = input<readonly string[]>([]);
  readonly initialValues = input<Readonly<Record<string, string>>>({});

  readonly submitted = output<Readonly<Record<string, string>>>();
  readonly cancelled = output<void>();

  protected readonly values = signal<Record<string, string>>({});
  private acceptSubmit = false;

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }
      this.acceptSubmit = false;
      const initial = this.initialValues();
      const next: Record<string, string> = {};
      for (const name of this.names()) {
        next[name] = initial[name] ?? '';
      }
      this.values.set(next);
    });
  }

  protected handleValueChange(name: string, value: string): void {
    this.values.update((current) => ({ ...current, [name]: value }));
  }

  protected handleSubmit(): void {
    this.acceptSubmit = true;
    this.submitted.emit({ ...this.values() });
  }

  protected handleCancel(): void {
    if (this.acceptSubmit) {
      this.acceptSubmit = false;
      return;
    }
    this.cancelled.emit();
  }
}
