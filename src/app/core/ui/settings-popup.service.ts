import { Injectable, inject, signal } from '@angular/core';

import { ShellOverlayCoordinatorService } from './shell-overlay-coordinator.service';

/**
 * Global open state for the settings overlay.
 * Rendered from shell layout so the titlebar stays above the backdrop (same as Help).
 */
@Injectable({ providedIn: 'root' })
export class SettingsPopupService {
  private readonly coordinator = inject(ShellOverlayCoordinatorService);
  private readonly openState = signal(false);

  readonly open = this.openState.asReadonly();

  constructor() {
    this.coordinator.register('settings', () => this.hide());
  }

  /** Opens the settings overlay and closes other shell overlays. */
  show(): void {
    this.coordinator.closeOthers('settings');
    this.openState.set(true);
  }

  /** Closes the settings overlay. */
  hide(): void {
    this.openState.set(false);
  }
}
