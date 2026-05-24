import { Injectable } from '@angular/core';

/** Mutually exclusive shell overlays (help, settings, teams). */
export type ShellOverlayId = 'help' | 'settings' | 'teams';

/**
 * Ensures only one shell overlay is open at a time.
 * Popups register a close callback; opening one closes the others.
 */
@Injectable({ providedIn: 'root' })
export class ShellOverlayCoordinatorService {
  private readonly closers = new Map<ShellOverlayId, () => void>();

  /** Registers the close handler for an overlay. */
  register(id: ShellOverlayId, close: () => void): void {
    this.closers.set(id, close);
  }

  /** Closes every registered overlay except {@link except}. */
  closeOthers(except: ShellOverlayId): void {
    for (const [id, close] of this.closers) {
      if (id !== except) {
        close();
      }
    }
  }
}
