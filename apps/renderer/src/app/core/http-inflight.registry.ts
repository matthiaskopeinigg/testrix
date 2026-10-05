import { Injectable } from '@angular/core';

/**
 * Tracks in-flight HTTP abort ids per workbench tab so closing a tab can cancel sends.
 */
@Injectable({ providedIn: 'root' })
export class HttpInflightRegistry {
  private readonly byTabId = new Map<string, string>();

  register(tabId: string, abortId: string): void {
    if (!tabId || !abortId)
      return;
    this.byTabId.set(tabId, abortId);
  }

  clear(tabId: string): void {
    if (!tabId)
      return;
    this.byTabId.delete(tabId);
  }

  abortIdFor(tabId: string): string | null {
    return this.byTabId.get(tabId) ?? null;
  }
}
