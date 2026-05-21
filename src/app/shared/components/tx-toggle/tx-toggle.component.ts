import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'tx-toggle',
  standalone: true,
  templateUrl: './tx-toggle.component.html',
  styleUrl: './tx-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-toggle-host',
    '[class.tx-toggle-host--checked]': 'checked()',
    '[class.tx-toggle-host--disabled]': 'disabled()',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TxToggleComponent),
      multi: true,
    },
  ],
})
export class TxToggleComponent implements ControlValueAccessor {
  private static nextId = 0;

  readonly controlId = input('');
  readonly label = input('');
  readonly disabled = input(false);

  protected readonly autoId = `tx-toggle-${TxToggleComponent.nextId++}`;
  protected readonly checked = signal(false);

  private onChange: (value: boolean) => void = () => {};
  private onTouched: () => void = () => {};

  protected effectiveId(): string {
    return this.controlId().trim() || this.autoId;
  }

  protected handleChange(event: Event): void {
    const el = event.target as HTMLInputElement;
    this.checked.set(el.checked);
    this.onChange(el.checked);
  }

  protected handleBlur(): void {
    this.onTouched();
  }

  writeValue(value: unknown): void {
    this.checked.set(!!value);
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    void isDisabled;
  }
}
