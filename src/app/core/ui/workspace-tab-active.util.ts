import type { Signal } from '@angular/core';
import { computed, signal, untracked } from '@angular/core';

/**
 * Runs {@link compute} while the tab is active; returns the last value while inactive
 * so cached tabs do not re-walk large trees on unrelated collection edits.
 */
export function freezeWhileTabInactive<T>(active: Signal<boolean>, compute: () => T): Signal<T> {
  const cache = signal<T | undefined>(undefined);

  return computed(() => {
    if (active()) {
      const next = compute();
      untracked(() => cache.set(next));
      return next;
    }
    const cached = cache();
    if (cached !== undefined) {
      return cached;
    }
    return compute();
  });
}
