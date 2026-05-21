import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  output,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { TxIconComponent } from '../tx-icon/tx-icon.component';

@Component({
  selector: 'tx-input',
  standalone: true,
  imports: [TxIconComponent],
  templateUrl: './tx-input.component.html',
  styleUrl: './tx-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-input-host',
    '[class.tx-input-host--clearable]': 'supportsClear()',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TxInputComponent),
      multi: true,
    },
  ],
})
export class TxInputComponent implements ControlValueAccessor {
  private static nextId = 0;

  readonly controlId = input('');
  readonly placeholder = input('');
  readonly type = input<'text' | 'password' | 'email' | 'search' | 'url' | 'number'>('text');
  readonly disabled = input(false);
  readonly ariaLabel = input('');
  /** When unset, search inputs show a clear control when they have a value. */
  readonly clearable = input<boolean | undefined>(undefined);

  readonly cleared = output<void>();

  private readonly nativeInput = viewChild<ElementRef<HTMLInputElement>>('nativeInput');

  protected readonly autoId = `tx-input-${TxInputComponent.nextId++}`;
  protected readonly value = signal('');

  protected readonly supportsClear = computed(() => {
    const mode = this.clearable();
    if (mode === false) {
      return false;
    }
    if (mode === true) {
      return true;
    }
    return this.type() === 'search';
  });

  protected readonly showClear = computed(
    () => this.supportsClear() && this.value().length > 0 && !this.disabled(),
  );

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  protected effectiveId(): string {
    return this.controlId().trim() || this.autoId;
  }

  protected handleInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.value.set(raw);
    this.onChange(raw);
  }

  protected handleBlur(): void {
    this.onTouched();
  }

  protected handleClear(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.value.set('');
    this.onChange('');
    this.onTouched();
    this.cleared.emit();
    const input = this.nativeInput()?.nativeElement;
    input?.focus({ preventScroll: true });
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
