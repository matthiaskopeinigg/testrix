import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import {
  classifySqlColumnType,
  isCompleteSqlColumnValue,
  isPartialSqlColumnValue,
  sqlColumnInputMode,
  type SqlColumnEditKind,
} from '@shared/database';

/**
 * Single-line inline rename field: focuses on mount and selects the full value.
 */
@Component({
  selector: 'tx-inline-rename-input',
  standalone: true,
  templateUrl: './tx-inline-rename-input.component.html',
  styleUrl: './tx-inline-rename-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-inline-rename-input-host',
    '[class.tx-inline-rename-input-host--cell]': "density() === 'cell'",
    '(click)': 'handleHostClick($event)',
    '(dblclick)': 'handleHostClick($event)',
    '(pointerdown)': 'handleHostPointerDown($event)',
  },
})
export class TxInlineRenameInputComponent implements AfterViewInit {
  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('inputEl');

  readonly value = input.required<string>();
  readonly ariaLabel = input('Rename');
  /**
   * `cell` fills a table cell without changing row height.
   * Default keeps the tree-rename chrome.
   */
  readonly density = input<'default' | 'cell'>('default');
  /** When true, committing an empty draft emits `committed` instead of `cancelled`. */
  readonly allowEmpty = input(false);
  /** When true, leading and trailing whitespace are removed on commit. */
  readonly trimValue = input(true);
  /** Driver type name used to restrict typed characters in cell editors. */
  readonly sqlType = input<string>('');

  readonly committed = output<string>();
  readonly cancelled = output<void>();

  protected readonly draft = signal('');

  protected readonly editKind = computed((): SqlColumnEditKind => classifySqlColumnType(this.sqlType()));

  protected readonly inputMode = computed(() => sqlColumnInputMode(this.editKind()));

  ngAfterViewInit(): void {
    const initial = this.value();
    this.draft.set(initial);
    this.scheduleFocusAndSelectAll();
  }

  protected handleBeforeInput(event: InputEvent): void {
    const kind = this.editKind();
    if (kind === 'text' || kind === 'json' || kind === 'boolean') {
      return;
    }
    if (event.inputType.startsWith('delete') || event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      return;
    }
    const insert = event.data;
    if (insert == null) {
      return;
    }
    const input = event.target as HTMLInputElement;
    const next = nextInputValue(input, insert);
    if (!isPartialSqlColumnValue(kind, next)) {
      event.preventDefault();
    }
  }

  protected handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.draft.set(input.value);
  }

  protected handleFocus(event: FocusEvent): void {
    this.selectAll(event.target as HTMLInputElement);
  }

  /** Keeps the full value selected when the field is clicked (Explorer-style rename). */
  protected handleMouseDown(event: MouseEvent): void {
    const input = event.target as HTMLInputElement;
    if (this.density() === 'cell' && document.activeElement === input) {
      return;
    }
    event.preventDefault();
    if (document.activeElement !== input) {
      input.focus({ preventScroll: true });
    }
    this.selectAll(input);
  }

  protected handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      this.commit({ revertIfInvalid: false });
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelled.emit();
    }
  }

  protected handleBlur(): void {
    this.commit({ revertIfInvalid: true });
  }

  protected handleHostClick(event: Event): void {
    event.stopPropagation();
  }

  protected handleHostPointerDown(event: Event): void {
    event.stopPropagation();
  }

  private commit(options: { readonly revertIfInvalid: boolean }): void {
    const next = this.trimValue() ? this.draft().trim() : this.draft();
    if (!next && !this.allowEmpty()) {
      this.cancelled.emit();
      return;
    }
    if (!isCompleteSqlColumnValue(this.editKind(), next)) {
      if (options.revertIfInvalid) {
        this.cancelled.emit();
      }
      return;
    }
    this.committed.emit(next);
  }

  private scheduleFocusAndSelectAll(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const input = this.inputRef().nativeElement;
        input.value = this.draft();
        input.focus({ preventScroll: true });
        this.selectAll(input);
      });
    });
  }

  private selectAll(input: HTMLInputElement): void {
    const length = input.value.length;
    if (length === 0) {
      return;
    }
    try {
      input.setSelectionRange(0, length);
    } catch {
      input.select();
    }
  }
}

function nextInputValue(input: HTMLInputElement, insert: string): string {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  return `${input.value.slice(0, start)}${insert}${input.value.slice(end)}`;
}
