import { Injectable, signal } from '@angular/core';

import type { CollectionHealthIssue } from './collection-health';

@Injectable({ providedIn: 'root' })
export class CollectionHealthDialogService {
  readonly issues = signal<readonly CollectionHealthIssue[] | null>(null);

  open(issues: readonly CollectionHealthIssue[]): void {
    this.issues.set(issues);
  }

  close(): void {
    this.issues.set(null);
  }
}
