import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { collabChangeKindFromFile, type CollabChangeKind, type CollabReview } from '@testrix/contracts';
import { TxButtonComponent } from '@testrix/ui';

import { CollabKindIconComponent } from './collab-kind-icon.component';
import { CollabStore, relativeTime } from './collab.store';

interface ReviewChip {
  readonly label: string;
  readonly value: string;
}

/**
 * One review at a time: keep mine or keep theirs, with a richer preview of both sides.
 */
@Component({
  selector: 'tx-collab-review',
  standalone: true,
  imports: [TxButtonComponent, CollabKindIconComponent],
  templateUrl: './collab-review.component.html',
  styleUrl: './collab-review.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollabReviewComponent {
  readonly collab = inject(CollabStore);
  readonly index = signal(0);

  readonly reviews = computed(() => this.collab.status().reviews);
  readonly current = computed(() => {
    const items = this.reviews();
    if (items.length === 0)
      return null;
    return items[Math.min(this.index(), items.length - 1)] ?? null;
  });
  readonly position = computed(() => {
    const total = this.reviews().length;
    if (total === 0)
      return '';
    return `${Math.min(this.index(), total - 1) + 1} of ${total}`;
  });

  constructor() {
    effect(() => {
      const total = this.reviews().length;
      if (this.index() >= total)
        this.index.set(Math.max(0, total - 1));
    });
  }

  kind(review: CollabReview): CollabChangeKind {
    return collabChangeKindFromFile(review.file);
  }

  when(at: string | null): string {
    return at ? relativeTime(at) : '';
  }

  cardTitle(value: unknown, fallback: string): string {
    if (!value || typeof value !== 'object')
      return fallback;
    const record = value as Record<string, unknown>;
    const name = stringField(record, 'name') || stringField(record, 'key') || fallback;
    const method = stringField(record, 'method');
    return method ? `${method} ${name}` : name;
  }

  chips(value: unknown): readonly ReviewChip[] {
    if (!value || typeof value !== 'object')
      return [];
    const record = value as Record<string, unknown>;
    const chips: ReviewChip[] = [];
    addChip(chips, 'Method', stringField(record, 'method'));
    addChip(chips, 'URL', stringField(record, 'url') || stringField(record, 'path'));
    addChip(chips, 'Key', stringField(record, 'key'));
    addChip(chips, 'Status', stringField(record, 'status'));
    addChip(chips, 'Environment', stringField(record, 'environment'));
    return chips.slice(0, 4);
  }

  removed(value: unknown): boolean {
    return value == null;
  }

  showPrevious(): void {
    this.index.update((current) => Math.max(0, current - 1));
  }

  showNext(): void {
    this.index.update((current) => Math.min(this.reviews().length - 1, current + 1));
  }
}

function addChip(chips: ReviewChip[], label: string, value: string): void {
  if (value)
    chips.push({ label, value });
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}
