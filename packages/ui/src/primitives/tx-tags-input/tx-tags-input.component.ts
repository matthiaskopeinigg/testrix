import { booleanAttribute, ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

/**
 * Chip-style tags field. Enter or comma commits the draft; Backspace removes the last tag.
 */
@Component({
  selector: 'tx-tags-input',
  standalone: true,
  templateUrl: './tx-tags-input.component.html',
  styleUrl: './tx-tags-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxTagsInputComponent {
  readonly id = input('tags');
  readonly label = input<string | null>('Tags');
  readonly tags = input<readonly string[]>([]);
  readonly placeholder = input('Add a tag');
  readonly hint = input('Press Enter or comma. Backspace removes the last tag.');
  readonly readonly = input(false, { transform: booleanAttribute });
  readonly tagsChange = output<readonly string[]>();

  readonly draft = signal('');

  handleInput(event: Event): void {
    if (this.readonly())
      return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    const value = target.value;
    if (value.includes(',')) {
      this.commit(value, target);
      return;
    }
    this.draft.set(value);
  }

  handleKey(event: KeyboardEvent): void {
    if (this.readonly())
      return;
    const target = event.target;
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      this.commit(this.draft(), target instanceof HTMLInputElement ? target : null);
      return;
    }
    if (event.key === 'Backspace' && !this.draft() && this.tags().length > 0) {
      event.preventDefault();
      this.emitTags(this.tags().slice(0, -1));
    }
  }

  handleBlur(): void {
    if (this.readonly() || !this.draft().trim())
      return;
    this.commit(this.draft());
  }

  removeTag(tag: string): void {
    if (this.readonly())
      return;
    this.emitTags(this.tags().filter((item) => item !== tag));
  }

  private commit(raw: string, input: HTMLInputElement | null = null): void {
    const next = raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    this.draft.set('');
    if (input)
      input.value = '';
    if (next.length === 0)
      return;
    const seen = new Set(this.tags());
    const merged = [...this.tags()];
    for (const tag of next) {
      if (seen.has(tag))
        continue;
      seen.add(tag);
      merged.push(tag);
    }
    if (merged.length === this.tags().length)
      return;
    this.emitTags(merged);
  }

  private emitTags(tags: readonly string[]): void {
    this.tagsChange.emit(tags);
  }
}
