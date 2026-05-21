import {
  ChangeDetectionStrategy,
  Component,
  forwardRef,
  input,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { TxTagComponent } from '../tx-tag/tx-tag.component';

@Component({
  selector: 'tx-tags-input',
  standalone: true,
  imports: [TxTagComponent],
  templateUrl: './tx-tags-input.component.html',
  styleUrl: './tx-tags-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-tags-input-host',
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

  readonly controlId = input('');
  readonly placeholder = input('Type a tag and press Enter');
  readonly maxTags = input(16);
  readonly disabled = input(false);

  readonly tagsChange = output<readonly string[]>();

  protected readonly autoId = `tx-tags-input-${TxTagsInputComponent.nextId++}`;
  protected readonly tags = signal<readonly string[]>([]);
  protected readonly draft = signal('');

  private onChange: (value: readonly string[]) => void = () => {};
  private onTouched: () => void = () => {};

  protected effectiveId(): string {
    return this.controlId().trim() || this.autoId;
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
    if (event.key === 'Backspace' && this.draft().length === 0 && this.tags().length > 0) {
      this.removeTag(this.tags()[this.tags().length - 1]!);
    }
  }

  protected handleRemoveTag(tag: string): void {
    this.removeTag(tag);
  }

  protected handleBlur(): void {
    this.onTouched();
    if (this.draft().trim()) {
      this.commitDraft();
    }
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
  }

  private removeTag(tag: string): void {
    this.setTags(this.tags().filter((t) => t !== tag));
  }

  private setTags(tags: readonly string[]): void {
    this.tags.set(tags);
    this.onChange(tags);
    this.tagsChange.emit(tags);
  }

  writeValue(value: readonly string[] | null): void {
    this.tags.set(Array.isArray(value) ? value : []);
    this.draft.set('');
  }

  registerOnChange(fn: (value: readonly string[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    void isDisabled;
  }
}
