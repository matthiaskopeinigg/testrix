import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { filter, fromEvent } from 'rxjs';

import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';

import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxTooltipService } from '../tx-tooltip/tx-tooltip.service';
import type { TxTooltipPosition } from '../tx-tooltip/tx-tooltip.types';
import type { TxDropdownOption, TxDropdownPlacement } from './tx-dropdown.types';

@Component({
  selector: 'tx-dropdown',
  standalone: true,
  imports: [TxIconComponent],
  templateUrl: './tx-dropdown.component.html',
  styleUrl: './tx-dropdown.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-dropdown-host',
    '[class.tx-dropdown-host--open]': 'isOpen()',
    '[class.tx-dropdown-host--disabled]': 'isDisabled()',
    '[class.tx-dropdown-host--placement-end]': "placement() === 'bottom-end'",
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TxDropdownComponent),
      multi: true,
    },
  ],
})
export class TxDropdownComponent implements ControlValueAccessor {
  private static nextId = 0;

  private readonly hostRef = inject(ElementRef<HTMLElement>);
  private readonly tooltips = inject(TxTooltipService);
  private readonly uiPreferences = inject(UiPreferencesService);

  readonly options = input<readonly TxDropdownOption[]>([]);
  readonly placeholder = input('Select…');
  readonly disabled = input(false);
  readonly controlId = input('');
  readonly ariaLabel = input('');
  readonly placement = input<TxDropdownPlacement>('bottom-start');
  readonly emptyLabel = input('No options');
  /** When bound, keeps the trigger in sync after programmatic model updates (e.g. profile switch). */
  readonly selectedValue = input<string | null | undefined>(undefined);
  /** Hover/focus hint anchored to the trigger only (not the component host). */
  readonly hint = input('');
  readonly hintPosition = input<TxTooltipPosition>('top');

  readonly valueChange = output<string>();

  protected readonly autoId = `tx-dropdown-${TxDropdownComponent.nextId++}`;
  protected readonly listboxId = `${this.autoId}-listbox`;
  protected readonly isOpen = signal(false);
  protected readonly value = signal<string | null>(null);
  protected readonly activeIndex = signal(0);

  private readonly triggerRef = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly panelRef = viewChild<ElementRef<HTMLUListElement>>('panel');

  private onChange: (value: string | null) => void = () => {};
  private onTouched: () => void = () => {};
  private formDisabled = false;

  constructor() {
    effect(() => {
      const external = this.selectedValue();
      if (external === undefined) {
        return;
      }
      const next = external === '' ? null : external;
      if (next !== this.value()) {
        this.value.set(next);
      }
    });

    // Capture phase so ancestors that call stopPropagation (e.g. settings popup) do not block outside-close.
    fromEvent<MouseEvent>(document, 'click', { capture: true })
      .pipe(
        filter(() => this.isOpen()),
        filter((event) => {
          const target = event.target;
          return target instanceof Node && !this.hostRef.nativeElement.contains(target);
        }),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closePanel(true));
  }

  protected readonly isDisabled = computed(() => this.disabled() || this.formDisabled);

  protected readonly enabledOptions = computed(() =>
    this.options().filter((option) => !option.disabled),
  );

  protected readonly selectedOption = computed(() => {
    const current = this.value();
    if (current == null) {
      return this.options().find((option) => option.value === '') ?? undefined;
    }
    return this.options().find((option) => option.value === current);
  });

  protected readonly triggerLabel = computed(() => {
    const selected = this.selectedOption();
    if (selected) {
      return selected.label;
    }
    return this.placeholder();
  });

  protected readonly hasSelection = computed(() => this.selectedOption() != null);

  protected effectiveId(): string {
    return this.controlId().trim() || this.autoId;
  }

  protected ariaLabelledById(): string | null {
    const id = this.controlId().trim();
    return id ? `${id}-label` : null;
  }

  protected optionId(index: number): string {
    return `${this.autoId}-opt-${index}`;
  }

  protected isOptionSelected(option: TxDropdownOption): boolean {
    return this.value() === option.value;
  }

  protected isOptionActive(index: number): boolean {
    return this.isOpen() && this.activeIndex() === index;
  }

  protected handleTriggerClick(): void {
    if (this.isDisabled()) {
      return;
    }

    this.hideHint();

    if (this.isOpen()) {
      this.closePanel();
      return;
    }

    this.openPanel();
  }

  protected handleTriggerKeydown(event: KeyboardEvent): void {
    if (this.isDisabled()) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
      case 'Down':
        event.preventDefault();
        if (!this.isOpen()) {
          this.openPanel();
        } else {
          this.moveActive(1);
        }
        break;
      case 'ArrowUp':
      case 'Up':
        event.preventDefault();
        if (!this.isOpen()) {
          this.openPanel();
        } else {
          this.moveActive(-1);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (this.isOpen()) {
          this.selectActiveOption();
        } else {
          this.openPanel();
        }
        break;
      case 'Escape':
        if (this.isOpen()) {
          event.preventDefault();
          this.closePanel(true);
        }
        break;
      case 'Home':
        if (this.isOpen()) {
          event.preventDefault();
          this.setActiveIndex(0);
        }
        break;
      case 'End':
        if (this.isOpen()) {
          event.preventDefault();
          this.setActiveIndex(this.options().length - 1);
        }
        break;
      default:
        break;
    }
  }

  protected handleOptionClick(option: TxDropdownOption, index: number): void {
    if (option.disabled || this.isDisabled()) {
      return;
    }

    this.selectOption(option, index);
  }

  protected handleOptionMouseEnter(index: number): void {
    if (this.isOpen()) {
      this.activeIndex.set(index);
    }
  }

  protected handleTriggerBlur(): void {
    this.hideHint();
    queueMicrotask(() => {
      if (!this.hostRef.nativeElement.contains(document.activeElement)) {
        this.onTouched();
      }
    });
  }

  protected handleTriggerPointerEnter(): void {
    this.showHint();
  }

  protected handleTriggerPointerLeave(): void {
    this.hideHint();
  }

  writeValue(value: unknown): void {
    if (value == null || value === '') {
      this.value.set(null);
      return;
    }
    this.value.set(String(value));
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.formDisabled = isDisabled;
    if (isDisabled) {
      this.closePanel(false);
    }
  }

  private openPanel(): void {
    this.hideHint();

    const options = this.options();
    if (options.length === 0) {
      return;
    }

    const selectedIndex = options.findIndex((option) => option.value === this.value());
    this.activeIndex.set(selectedIndex >= 0 ? selectedIndex : this.firstEnabledIndex());
    this.isOpen.set(true);

    queueMicrotask(() => {
      this.scrollActiveOptionIntoView();
    });
  }

  private closePanel(focusTrigger = false): void {
    if (!this.isOpen()) {
      return;
    }

    this.isOpen.set(false);
    this.onTouched();

    if (focusTrigger) {
      this.triggerRef()?.nativeElement.focus();
    }
  }

  private selectOption(option: TxDropdownOption, index: number): void {
    this.value.set(option.value);
    this.onChange(option.value);
    this.valueChange.emit(option.value);
    this.activeIndex.set(index);
    this.closePanel(true);
  }

  private selectActiveOption(): void {
    const options = this.options();
    const index = this.activeIndex();
    const option = options[index];
    if (!option || option.disabled) {
      return;
    }
    this.selectOption(option, index);
  }

  private moveActive(delta: number): void {
    const options = this.options();
    if (options.length === 0) {
      return;
    }

    let index = this.activeIndex();
    for (let step = 0; step < options.length; step += 1) {
      index = (index + delta + options.length) % options.length;
      if (!options[index]?.disabled) {
        this.setActiveIndex(index);
        return;
      }
    }
  }

  private setActiveIndex(index: number): void {
    const clamped = Math.max(0, Math.min(index, this.options().length - 1));
    this.activeIndex.set(clamped);
    this.scrollActiveOptionIntoView();
  }

  private firstEnabledIndex(): number {
    const index = this.options().findIndex((option) => !option.disabled);
    return index >= 0 ? index : 0;
  }

  private scrollActiveOptionIntoView(): void {
    const panel = this.panelRef()?.nativeElement;
    if (!panel) {
      return;
    }

    const active = panel.querySelector('.tx-dropdown__option.is-active') as HTMLElement | null;
    active?.scrollIntoView?.({ block: 'nearest' });
  }

  private showHint(): void {
    if (this.isOpen() || this.isDisabled()) {
      return;
    }

    const text = this.hint().trim();
    if (!text || !this.uiPreferences.showIconTooltips()) {
      return;
    }

    const trigger = this.triggerRef()?.nativeElement;
    if (trigger) {
      this.tooltips.show(trigger, text, this.hintPosition());
    }
  }

  private hideHint(): void {
    const trigger = this.triggerRef()?.nativeElement;
    if (trigger) {
      this.tooltips.hide(trigger);
    }
  }
}
