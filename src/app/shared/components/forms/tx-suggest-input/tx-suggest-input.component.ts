import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  forwardRef,
  HostListener,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { TxIconComponent } from '../tx-icon/tx-icon.component';
import {
  positionFixedCompletionPopup,
  scheduleFixedCompletionPosition,
  TX_COMPLETION_PLACEMENT_DEFAULT,
  type TxCompletionPlacement,
} from '../tx-completion-popup/tx-completion-popup-placement';

import { filterPrefixSuggestions, inlineCompletionSuffix } from './filter-prefix-suggestions';
import {
  resolveSuggestInputAutoClose,
  resolveSuggestInputAutoCloseBackspace,
} from './tx-suggest-input-auto-close';
import { isSuggestTriggerKeydown } from './tx-suggest-input-keyboard';
import { canSuggestSqlColumn, lastIdentifierToken } from './tx-suggest-input-token';

@Component({
  selector: 'tx-suggest-input',
  standalone: true,
  imports: [TxIconComponent],
  templateUrl: './tx-suggest-input.component.html',
  styleUrl: './tx-suggest-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-suggest-input-host',
    '[class.tx-suggest-input-host--clearable]': 'showClear()',
    '[class.tx-suggest-input-host--ghost]': '!!inlineSuffix()',
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
  /** `token` completes the identifier at the caret instead of the whole value. */
  readonly matchMode = input<'full' | 'token'>('full');
  /**
   * `inline` (default) shows a gray remainder after the caret.
   * `popup` keeps a floating list (opt-in).
   */
  readonly completionStyle = input<'popup' | 'inline'>('inline');
  /** When true, `'` / `"` / `(` insert a matching closer. */
  readonly autoClose = input(false);
  readonly clearable = input(false);
  /** Fixed suggestion panel placement relative to the input. */
  readonly completionPlacement = input<TxCompletionPlacement>(TX_COMPLETION_PLACEMENT_DEFAULT);

  readonly submitted = output<void>();
  readonly cleared = output<void>();

  private static readonly COMPLETION_GAP_PX = 4;

  private readonly destroyRef = inject(DestroyRef);
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly nativeInput = viewChild<ElementRef<HTMLInputElement>>('nativeInput');
  private readonly completionPanel = viewChild<ElementRef<HTMLElement>>('completionPanel');
  private readonly previewEl = viewChild<ElementRef<HTMLElement>>('preview');

  constructor() {
    const onScroll = (): void => {
      if (this.completionOpen() && !this.isInlineCompletion()) {
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
  private readonly caret = signal(0);

  protected readonly showClear = computed(
    () => this.clearable() && this.value().length > 0 && !this.disabled(),
  );

  protected readonly isInlineCompletion = computed(() => this.completionStyle() === 'inline');

  /** Gray remainder shown after the typed token in inline mode. */
  protected readonly inlineSuffix = computed(() => {
    if (!this.isInlineCompletion() || !this.completionOpen()) {
      return '';
    }
    const item = this.completionItems()[this.completionIndex()];
    if (!item) {
      return '';
    }
    const token = lastIdentifierToken(this.value(), this.caret());
    if (!token.text || this.caret() !== token.end || token.end !== this.value().length) {
      return '';
    }
    return inlineCompletionSuffix(token.text, item);
  });

  private skipNextFocusRefresh = false;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.completionOpen() && !this.isInlineCompletion()) {
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
    const el = event.target as HTMLInputElement;
    this.value.set(el.value);
    this.caret.set(el.selectionStart ?? el.value.length);
    this.onChange(el.value);
    this.refreshCompletion();
  }

  protected handleScroll(): void {
    const inputEl = this.nativeInput()?.nativeElement;
    const preview = this.previewEl()?.nativeElement;
    if (!inputEl || !preview) {
      return;
    }
    preview.scrollLeft = inputEl.scrollLeft;
  }

  protected handleFocus(): void {
    this.syncCaret();
    if (this.skipNextFocusRefresh) {
      this.skipNextFocusRefresh = false;
      return;
    }
    this.refreshCompletion();
  }

  protected handleClick(): void {
    this.syncCaret();
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

    if (this.tryAutoClose(ev)) {
      return;
    }

    if (isSuggestTriggerKeydown(ev)) {
      ev.preventDefault();
      this.refreshCompletion();
      return;
    }

    if (ev.key === 'Enter' && !this.completionOpen()) {
      ev.preventDefault();
      ev.stopPropagation();
      this.submitted.emit();
      this.keepInputFocused();
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
    if (ev.key === 'ArrowRight' && this.inlineSuffix()) {
      const inputEl = this.nativeInput()?.nativeElement;
      if (inputEl && inputEl.selectionStart === this.value().length) {
        ev.preventDefault();
        this.acceptActiveCompletion();
      }
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      ev.stopPropagation();
      if (this.value().trim() !== '') {
        if (this.acceptActiveCompletion()) {
          return;
        }
      }
      this.closeCompletion();
      this.submitted.emit();
      this.keepInputFocused();
      return;
    }
    if (ev.key === 'Tab') {
      if (this.acceptActiveCompletion()) {
        ev.preventDefault();
      }
    }
  }

  protected handleClear(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.value.set('');
    this.onChange('');
    this.onTouched();
    this.cleared.emit();
    this.closeCompletion();
    this.nativeInput()?.nativeElement.focus({ preventScroll: true });
  }

  protected applyCompletion(item: string): void {
    const inputEl = this.nativeInput()?.nativeElement;
    const caret = inputEl?.selectionStart ?? this.value().length;
    const next =
      this.matchMode() === 'token'
        ? replaceToken(this.value(), caret, item)
        : { value: item, caret: item.length };
    this.commitValue(next.value, next.caret);
    this.closeCompletion();
  }

  private acceptActiveCompletion(): boolean {
    const item = this.completionItems()[this.completionIndex()];
    if (!item) {
      return false;
    }
    if (this.isInlineCompletion() && !this.inlineSuffix()) {
      return false;
    }
    this.applyCompletion(item);
    return true;
  }

  writeValue(value: unknown): void {
    const next = value == null ? '' : String(value);
    if (next === this.value()) {
      return;
    }
    this.value.set(next);
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

  private tryAutoClose(ev: KeyboardEvent): boolean {
    if (!this.autoClose() || ev.ctrlKey || ev.metaKey || ev.altKey) {
      return false;
    }
    const inputEl = this.nativeInput()?.nativeElement;
    if (!inputEl) {
      return false;
    }
    const start = inputEl.selectionStart ?? this.value().length;
    const end = inputEl.selectionEnd ?? start;
    if (ev.key === 'Backspace') {
      const result = resolveSuggestInputAutoCloseBackspace(this.value(), start);
      if (!result || start !== end) {
        return false;
      }
      ev.preventDefault();
      this.commitValue(result.value, result.caret);
      this.refreshCompletion(result.caret);
      return true;
    }
    const result = resolveSuggestInputAutoClose(ev.key, this.value(), start, end);
    if (!result) {
      return false;
    }
    ev.preventDefault();
    this.commitValue(result.value, result.caret);
    this.refreshCompletion(result.caret);
    return true;
  }

  private commitValue(next: string, caret: number): void {
    this.value.set(next);
    this.onChange(next);
    this.applyCaret(next, caret);
    queueMicrotask(() => this.applyCaret(next, caret));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.applyCaret(next, caret));
    });
  }

  private applyCaret(next: string, caret: number): void {
    const inputEl = this.nativeInput()?.nativeElement;
    if (!inputEl) {
      return;
    }
    if (inputEl.value !== next) {
      inputEl.value = next;
    }
    inputEl.focus({ preventScroll: true });
    const pos = Math.max(0, Math.min(caret, next.length));
    inputEl.setSelectionRange(pos, pos);
    this.caret.set(pos);
  }

  /** Keeps the caret in the field after Enter submits a search. */
  private keepInputFocused(): void {
    const restore = (): void => {
      const inputEl = this.nativeInput()?.nativeElement;
      if (!inputEl || inputEl.disabled) {
        return;
      }
      if (document.activeElement !== inputEl) {
        this.skipNextFocusRefresh = true;
        const start = inputEl.selectionStart;
        const end = inputEl.selectionEnd;
        inputEl.focus({ preventScroll: true });
        if (start !== null && end !== null) {
          inputEl.setSelectionRange(start, end);
        }
      }
    };
    queueMicrotask(restore);
    requestAnimationFrame(restore);
  }

  private syncCaret(): void {
    const inputEl = this.nativeInput()?.nativeElement;
    if (inputEl) {
      this.caret.set(inputEl.selectionStart ?? this.value().length);
    }
  }

  private refreshCompletion(caretOverride?: number): void {
    if (this.disabled()) {
      this.closeCompletion();
      return;
    }
    const inputEl = this.nativeInput()?.nativeElement;
    const caret = caretOverride ?? inputEl?.selectionStart ?? this.value().length;
    const query =
      this.matchMode() === 'token'
        ? lastIdentifierToken(this.value(), caret).text
        : this.value();
    if (this.matchMode() === 'token' && !canSuggestSqlColumn(this.value(), caret)) {
      this.closeCompletion();
      return;
    }
    const items = filterPrefixSuggestions(query, this.suggestions(), this.maxSuggestions());
    if (items.length === 0 || (this.isInlineCompletion() && !query.trim())) {
      this.closeCompletion();
      return;
    }
    this.completionItems.set(items);
    this.completionIndex.set(0);
    this.caret.set(caret);
    this.completionOpen.set(true);
    if (this.isInlineCompletion()) {
      this.completionPositioned.set(true);
      return;
    }
    this.completionPositioned.set(false);
    scheduleFixedCompletionPosition(() => {
      if (this.completionOpen() && !this.isInlineCompletion()) {
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

function replaceToken(
  value: string,
  caret: number,
  insert: string,
): { readonly value: string; readonly caret: number } {
  const token = lastIdentifierToken(value, caret);
  return {
    value: `${value.slice(0, token.start)}${insert}${value.slice(token.end)}`,
    caret: token.start + insert.length,
  };
}
