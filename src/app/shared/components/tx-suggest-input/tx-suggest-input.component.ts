import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  forwardRef,
  HostListener,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import {
  positionFixedCompletionPopup,
  scheduleFixedCompletionPosition,
  TX_COMPLETION_PLACEMENT_DEFAULT,
  type TxCompletionPlacement,
} from '../tx-completion-popup/tx-completion-popup-placement';

import { filterPrefixSuggestions } from './filter-prefix-suggestions';
import { isSuggestTriggerKeydown } from './tx-suggest-input-keyboard';

@Component({
  selector: 'tx-suggest-input',
  standalone: true,
  templateUrl: './tx-suggest-input.component.html',
  styleUrl: './tx-suggest-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-suggest-input-host',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TxSuggestInputComponent),
      multi: true,
    },
  ],
})
export class TxSuggestInputComponent implements ControlValueAccessor {
  private static nextId = 0;

  readonly controlId = input('');
  readonly placeholder = input('');
  readonly disabled = input(false);
  readonly ariaLabel = input('');
  readonly suggestions = input<readonly string[]>([]);
  readonly maxSuggestions = input(20);
  readonly completionLabel = input('Suggestions');
  /** Fixed suggestion panel placement relative to the input. */
  readonly completionPlacement = input<TxCompletionPlacement>(TX_COMPLETION_PLACEMENT_DEFAULT);

  private static readonly COMPLETION_GAP_PX = 4;

  private readonly destroyRef = inject(DestroyRef);
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly nativeInput = viewChild<ElementRef<HTMLInputElement>>('nativeInput');
  private readonly completionPanel = viewChild<ElementRef<HTMLElement>>('completionPanel');

  constructor() {
    const onScroll = (): void => {
      if (this.completionOpen()) {
        this.positionCompletion();
      }
    };
    document.addEventListener('scroll', onScroll, { capture: true });
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('scroll', onScroll, { capture: true });
    });
  }

  protected readonly autoId = `tx-suggest-input-${TxSuggestInputComponent.nextId++}`;
  protected readonly value = signal('');

  protected readonly completionOpen = signal(false);
  protected readonly completionPositioned = signal(false);
  protected readonly resolvedCompletionPlacement = signal<TxCompletionPlacement>(
    TX_COMPLETION_PLACEMENT_DEFAULT,
  );
  protected readonly completionItems = signal<readonly string[]>([]);
  protected readonly completionIndex = signal(0);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.completionOpen()) {
      this.positionCompletion();
    }
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(ev: MouseEvent): void {
    if (!this.completionOpen()) {
      return;
    }
    const target = ev.target as Node | null;
    if (target && this.hostEl.nativeElement.contains(target)) {
      return;
    }
    this.closeCompletion();
  }

  protected effectiveId(): string {
    return this.controlId().trim() || this.autoId;
  }

  protected handleInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.value.set(raw);
    this.onChange(raw);
    this.refreshCompletion();
  }

  protected handleFocus(): void {
    this.refreshCompletion();
  }

  protected handleBlur(): void {
    this.onTouched();
    this.closeCompletion();
  }

  protected handleKeydown(ev: KeyboardEvent): void {
    if (this.disabled()) {
      return;
    }

    if (isSuggestTriggerKeydown(ev)) {
      ev.preventDefault();
      this.refreshCompletion();
      return;
    }

    if (!this.completionOpen()) {
      return;
    }

    if (ev.key === 'Escape') {
      ev.preventDefault();
      this.closeCompletion();
      return;
    }
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      const max = this.completionItems().length - 1;
      this.completionIndex.update((index) => Math.min(index + 1, max));
      return;
    }
    if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      this.completionIndex.update((index) => Math.max(index - 1, 0));
      return;
    }
    if (ev.key === 'Enter' || ev.key === 'Tab') {
      const item = this.completionItems()[this.completionIndex()];
      if (item) {
        ev.preventDefault();
        this.applyCompletion(item);
      }
    }
  }

  protected applyCompletion(item: string): void {
    this.value.set(item);
    this.onChange(item);
    const inputEl = this.nativeInput()?.nativeElement;
    queueMicrotask(() => {
      inputEl?.focus({ preventScroll: true });
      const end = item.length;
      inputEl?.setSelectionRange(end, end);
    });
    this.closeCompletion();
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

  private refreshCompletion(): void {
    if (this.disabled()) {
      this.closeCompletion();
      return;
    }
    const items = filterPrefixSuggestions(
      this.value(),
      this.suggestions(),
      this.maxSuggestions(),
    );
    if (items.length === 0) {
      this.closeCompletion();
      return;
    }
    this.completionItems.set(items);
    this.completionIndex.set(0);
    this.completionPositioned.set(false);
    this.completionOpen.set(true);
    scheduleFixedCompletionPosition(() => {
      if (this.completionOpen()) {
        this.positionCompletion();
      }
    });
  }

  private positionCompletion(): void {
    const inputEl = this.nativeInput()?.nativeElement;
    const panelEl = this.completionPanel()?.nativeElement;
    if (!inputEl || !panelEl) {
      return;
    }
    const resolved = positionFixedCompletionPopup({
      anchor: inputEl,
      panel: panelEl,
      placement: this.completionPlacement(),
      gapPx: TxSuggestInputComponent.COMPLETION_GAP_PX,
    });
    this.resolvedCompletionPlacement.set(resolved);
    this.completionPositioned.set(true);
  }

  private closeCompletion(): void {
    this.completionOpen.set(false);
    this.completionPositioned.set(false);
    this.completionItems.set([]);
    this.completionIndex.set(0);
  }
}
