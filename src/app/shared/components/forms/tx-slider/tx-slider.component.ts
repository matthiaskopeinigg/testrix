import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'tx-slider',
  standalone: true,
  templateUrl: './tx-slider.component.html',
  styleUrl: './tx-slider.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TxSliderComponent),
      multi: true,
    },
  ],
})
export class TxSliderComponent implements ControlValueAccessor {
  private static nextId = 0;

  readonly controlId = input('');
  readonly label = input('');
  readonly ariaLabel = input('');
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  readonly disabled = input(false);
  readonly showValue = input(true);
  readonly unit = input('');

  protected readonly autoId = `tx-slider-${TxSliderComponent.nextId++}`;
  protected readonly value = signal(0);

  protected readonly effectiveMin = computed(() =>
    Number.isFinite(this.min()) ? this.min() : 0,
  );

  protected readonly effectiveMax = computed(() => {
    const max = Number.isFinite(this.max()) ? this.max() : 100;
    return max >= this.effectiveMin() ? max : this.effectiveMin();
  });

  protected readonly effectiveStep = computed(() => {
    const step = this.step();
    return Number.isFinite(step) && step > 0 ? step : 1;
  });

  protected readonly fillPercent = computed(() => {
    const span = this.effectiveMax() - this.effectiveMin();
    if (span <= 0) {
      return 0;
    }
    const pct = ((this.value() - this.effectiveMin()) / span) * 100;
    return Math.min(100, Math.max(0, pct));
  });

  protected readonly displayValue = computed(() => {
    const formatted = String(this.value());
    const unit = this.unit();
    return unit ? `${formatted}${unit}` : formatted;
  });

  private onChange: (value: number) => void = () => {};
  private onTouched: () => void = () => {};

  protected effectiveId(): string {
    return this.controlId().trim() || this.autoId;
  }

  protected handleInput(event: Event): void {
    const raw = Number((event.target as HTMLInputElement).value);
    const next = this.clampValue(raw);
    this.value.set(next);
    this.onChange(next);
  }

  protected handleBlur(): void {
    this.onTouched();
  }

  writeValue(value: unknown): void {
    const n = typeof value === 'number' ? value : Number(value);
    this.value.set(this.clampValue(Number.isFinite(n) ? n : this.effectiveMin()));
  }

  registerOnChange(fn: (value: number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    void isDisabled;
  }

  private clampValue(n: number): number {
    if (!Number.isFinite(n)) {
      return this.effectiveMin();
    }
    return Math.min(this.effectiveMax(), Math.max(this.effectiveMin(), n));
  }
}
