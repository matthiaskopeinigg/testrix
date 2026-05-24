import { Injectable, signal } from '@angular/core';

/**
 * Global open state for the settings overlay.
 * Rendered from shell layout so the titlebar stays above the backdrop (same as Help).
 */
@Injectable({ providedIn: 'root' })
export class SettingsPopupService {
  readonly open = signal(false);

  /** Opens the settings overlay. */
  show(): void {
    this.open.set(true);
  }

  /** Closes the settings overlay. */
  hide(): void {
    this.open.set(false);
  }
}
