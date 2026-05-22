import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
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

import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxTagComponent } from '../tx-tag/tx-tag.component';

@Component({
  selector: 'tx-tags-input',
  standalone: true,
  imports: [TxTagComponent, TxIconComponent],
  templateUrl: './tx-tags-input.component.html',
  styleUrl: './tx-tags-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-tags-input-host',
    '[class.tx-tags-input-host--open]': 'panelOpen()',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TxTagsInputComponent),
      multi: true,
    },
  ],
})
export class TxTagsInputComponent implements ControlValueAccessor {
  private static nextId = 0;

  private readonly hostRef = inject(ElementRef<HTMLElement>);

  readonly controlId = input('');
  readonly placeholder = input('Add a tag…');
  readonly maxTags = input(16);
  readonly disabled = input(false);
  /** Compact single-line layout for toolbars. */
  readonly compact = input(false);

  readonly tagsChange = output<readonly string[]>();

  protected readonly autoId = `tx-tags-input-${TxTagsInputComponent.nextId++}`;
  protected readonly tags = signal<readonly string[]>([]);
  protected readonly draft = signal('');
  protected readonly panelOpen = signal(false);

  private readonly draftInputRef = viewChild<ElementRef<HTMLInputElement>>('draftInput');

  protected readonly canAddMore = computed(
    () => !this.disabled() && this.tags().length < this.maxTags(),
  );

  protected readonly triggerLabel = computed(() => {
    const count = this.tags().length;
    if (count === 0) {
      return 'Add tags…';
    }
    if (count === 1) {
      return '1 tag';
    }
    return `${count} tags`;
  });

  constructor() {
    fromEvent<MouseEvent>(document, 'click', { capture: true })
      .pipe(
        filter(() => this.panelOpen()),
        filter((event) => {
          const target = event.target;
          return target instanceof Node && !this.hostRef.nativeElement.contains(target);
        }),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closePanel());

    effect(() => {
      if (!this.panelOpen()) {
        return;
      }
      const inputRef = this.draftInputRef();
      if (!inputRef) {
        return;
      }
      queueMicrotask(() => this.focusElement(inputRef.nativeElement));
    });
  }

  protected effectiveId(): string {
    return this.controlId().trim() || this.autoId;
  }

  protected handleTogglePanel(event: MouseEvent): void {
    event.stopPropagation();
    if (this.disabled()) {
      return;
    }
    if (this.panelOpen()) {
      this.closePanel();
      return;
    }
    this.panelOpen.set(true);
  }

  protected handlePanelKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
  }

  protected handleDraftInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draft.set(value);
  }

  protected handleDraftKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitDraft();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closePanel();
    }
  }

  protected handleRemoveTag(tag: string): void {
    this.removeTag(tag);
  }

  private commitDraft(): void {
    const raw = this.draft().trim();
    this.draft.set('');
    if (!raw || this.disabled()) {
      return;
    }
    const next = raw
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    if (next.length === 0) {
      return;
    }
    const merged = [...this.tags()];
    for (const tag of next) {
      if (merged.length >= this.maxTags()) {
        break;
      }
      if (!merged.some((t) => t.toLowerCase() === tag.toLowerCase())) {
        merged.push(tag);
      }
    }
    this.setTags(merged);
    if (merged.length >= this.maxTags()) {
      this.closePanel();
      return;
    }
    queueMicrotask(() => this.focusDraftInput());
  }

  private removeTag(tag: string): void {
    this.setTags(this.tags().filter((t) => t !== tag));
  }

  private setTags(tags: readonly string[]): void {
    this.tags.set(tags);
    this.onChange(tags);
    this.tagsChange.emit(tags);
  }

  private closePanel(): void {
    this.panelOpen.set(false);
    this.draft.set('');
    this.onTouched();
  }

  private focusDraftInput(): void {
    const input = this.draftInputRef()?.nativeElement;
    if (!input) {
      return;
    }
    this.focusElement(input);
  }

  private focusElement(input: HTMLInputElement): void {
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
  }

  private onChange: (value: readonly string[]) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: readonly string[] | null): void {
    this.tags.set(Array.isArray(value) ? value : []);
    this.draft.set('');
    if (this.tags().length >= this.maxTags()) {
      this.panelOpen.set(false);
    }
  }

  registerOnChange(fn: (value: readonly string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    if (isDisabled) {
      this.panelOpen.set(false);
      this.draft.set('');
    }
  }
}
