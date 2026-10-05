import { Injectable, computed, signal } from '@angular/core'

/** Tracks manual-save dirty editors for the titlebar strip. */
@Injectable({ providedIn: 'root' })
export class DirtyTabsRegistry {
  private readonly dirtyIds = signal<ReadonlySet<string>>(new Set())

  readonly count = computed(() => this.dirtyIds().size)

  isDirty(tabId: string): boolean {
    return this.dirtyIds().has(tabId)
  }

  setDirty(tabId: string, dirty: boolean): void {
    this.dirtyIds.update((prev) => {
      const next = new Set(prev)
      if (dirty)
        next.add(tabId)
      else
        next.delete(tabId)
      return next
    })
  }

  clear(tabId: string): void {
    this.setDirty(tabId, false)
  }

  ids(): readonly string[] {
    return [...this.dirtyIds()]
  }
}
