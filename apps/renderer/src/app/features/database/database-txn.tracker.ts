import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class DatabaseTxnTracker {
  readonly uncommitted = signal<Readonly<Record<string, number | null>>>({});

  isUncommitted(tabId: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.uncommitted(), tabId);
  }

  rollbackAt(tabId: string): number | null {
    return this.uncommitted()[tabId] ?? null;
  }

  mark(tabId: string, rollbackAt: number | null): void {
    this.uncommitted.update((current) => ({ ...current, [tabId]: rollbackAt }));
  }

  clear(tabId: string): void {
    this.uncommitted.update((current) => {
      if (!(tabId in current))
        return current;
      const next = { ...current };
      delete next[tabId];
      return next;
    });
  }

  uncommittedIds(ids: readonly string[]): string[] {
    return ids.filter((id) => this.isUncommitted(id));
  }
}
