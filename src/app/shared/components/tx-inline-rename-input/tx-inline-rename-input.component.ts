import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

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
    '(click)': 'handleHostClick($event)',
    '(dblclick)': 'handleHostClick($event)',
    '(pointerdown)': 'handleHostPointerDown($event)',
  },
})
export class TxInlineRenameInputComponent implements AfterViewInit {
  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('inputEl');

  readonly value = input.required<string>();
  readonly ariaLabel = input('Rename');

  readonly committed = output<string>();
  readonly cancelled = output<void>();

  protected readonly draft = signal('');

  ngAfterViewInit(): void {
    const initial = this.value();
    this.draft.set(initial);
    this.scheduleFocusAndSelectAll();
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
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    if (document.activeElement !== input) {
      input.focus({ preventScroll: true });
    }
    this.selectAll(input);
  }

  protected handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      this.commit();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelled.emit();
    }
  }

  protected handleBlur(): void {
    this.commit();
  }

  protected handleHostClick(event: Event): void {
    event.stopPropagation();
  }

  protected handleHostPointerDown(event: Event): void {
    event.stopPropagation();
  }

  private commit(): void {
    const trimmed = this.draft().trim();
    if (!trimmed) {
      this.cancelled.emit();
      return;
    }
    this.committed.emit(trimmed);
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
