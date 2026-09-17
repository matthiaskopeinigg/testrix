import { NgTemplateOutlet } from '@angular/common';
import { OverlayModule, type ConnectedPosition, type CdkOverlayOrigin } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, contentChild, input, output, signal } from '@angular/core';

import { playLeaveThen } from '../../overlays/popover-leave';
import { TxSelectOptionDirective, type TxSelectOption } from './tx-select-option.directive';

export type { TxSelectOption } from './tx-select-option.directive';

export type TxSelectVariant = 'field' | 'bare' | 'chrome';

let selectUid = 0;

@Component({
  selector: 'tx-select',
  standalone: true,
  imports: [OverlayModule, NgTemplateOutlet],
  templateUrl: './tx-select.component.html',
  styleUrl: './tx-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-select',
    '[class.tx-select--bare]': 'variant() === "bare"',
    '[class.tx-select--chrome]': 'variant() === "chrome"',
  },
})
export class TxSelectComponent {
  readonly value = input.required<string>();
  readonly options = input.required<readonly TxSelectOption[]>();
  readonly ariaLabel = input('Select');
  readonly variant = input<TxSelectVariant>('field');
  readonly tone = input<string | null>(null);
  readonly valueChange = output<string>();
  readonly openChange = output<boolean>();
  readonly optionTemplate = contentChild(TxSelectOptionDirective);

  readonly open = signal(false);
  private closing = false;
  readonly activeIndex = signal(0);
  readonly triggerWidth = signal(0);
  readonly listId = `tx-select-${++selectUid}`;

  readonly selectedOption = computed(() => {
    const current = this.value();
    return this.options().find((option) => option.value === current) ?? null;
  });

  readonly selectedLabel = computed(() => this.selectedOption()?.label ?? this.value());

  readonly selectedFont = computed(() => {
    const current = this.value();
    return this.options().find((option) => option.value === current)?.fontFamily ?? null;
  });

  readonly activeOption = computed(() => this.options()[this.activeIndex()] ?? null);

  readonly overlayWidth = computed(() => {
    const width = this.triggerWidth();
    if (this.variant() === 'chrome')
      return Math.max(width, 120);
    return width;
  });

  readonly positions = computed<ConnectedPosition[]>(() => {
    if (this.variant() === 'chrome') {
      return [
        { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
        { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
      ];
    }
    return [
      { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 6 },
      { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -6 },
      { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
    ];
  });

  handleToggle(origin: CdkOverlayOrigin): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.openAt(origin);
  }

  handleSelect(value: string): void {
    this.valueChange.emit(value);
    this.close();
  }

  handleKeydown(event: KeyboardEvent, origin: CdkOverlayOrigin): void {
    const options = this.options();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.open()) {
        this.openAt(origin);
        return;
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const next = (this.activeIndex() + delta + options.length) % options.length;
      this.activeIndex.set(next);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!this.open()) {
        this.openAt(origin);
        return;
      }
      const option = this.activeOption();
      if (option)
        this.handleSelect(option.value);
      return;
    }
    if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    }
  }

  handleOutside(): void {
    this.close();
  }

  isSelected(value: string): boolean {
    return this.value() === value;
  }

  private openAt(origin: CdkOverlayOrigin): void {
    const el = origin.elementRef.nativeElement as HTMLElement;
    this.triggerWidth.set(Math.ceil(el.getBoundingClientRect().width));
    const index = this.options().findIndex((option) => option.value === this.value());
    this.activeIndex.set(index < 0 ? 0 : index);
    this.closing = false;
    this.open.set(true);
    this.openChange.emit(true);
  }

  private close(): void {
    if (!this.open() || this.closing)
      return;
    this.closing = true;
    const menu = document.getElementById(this.listId);
    playLeaveThen(menu instanceof HTMLElement ? menu : null, () => {
      this.closing = false;
      if (!this.open())
        return;
      this.open.set(false);
      this.openChange.emit(false);
    });
  }
}
