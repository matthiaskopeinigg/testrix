import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'tx-textarea',
  standalone: true,
  templateUrl: './tx-textarea.component.html',
  styleUrl: './tx-textarea.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TxTextareaComponent),
      multi: true,
    },
  ],
})
export class TxTextareaComponent implements ControlValueAccessor {
  private static nextId = 0;

  readonly controlId = input('');
  readonly placeholder = input('');
  readonly rows = input(4);
  readonly disabled = input(false);
  readonly readOnly = input(false);
  readonly monospace = input(false);

  readonly blurred = output<void>();

  protected readonly autoId = `tx-textarea-${TxTextareaComponent.nextId++}`;
  protected readonly value = signal('');

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  protected effectiveId(): string {
    return this.controlId().trim() || this.autoId;
  }

  protected handleInput(event: Event): void {
    const raw = (event.target as HTMLTextAreaElement).value;
    this.value.set(raw);
    this.onChange(raw);
  }

  protected handleBlur(): void {
    this.onTouched();
    this.blurred.emit();
  }

  writeValue(value: unknown): void {
    this.value.set(value == null ? '' : String(value));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    void isDisabled;
  }
}
