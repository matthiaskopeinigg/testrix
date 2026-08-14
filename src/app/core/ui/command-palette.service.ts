import { Injectable, inject, signal } from '@angular/core';

import { LayoutOnboardingService } from './layout-onboarding.service';
import { ShellOverlayCoordinatorService } from './shell-overlay-coordinator.service';

/**
 * Global open state for the command palette overlay.
 * Rendered from shell layout alongside settings, help, and teams.
 */
@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  private readonly coordinator = inject(ShellOverlayCoordinatorService);
  private readonly layoutOnboarding = inject(LayoutOnboardingService);
  private readonly openState = signal(false);

  readonly open = this.openState.asReadonly();

  constructor() {
    this.coordinator.register('commandPalette', () => this.hide());
  }

  /** Opens the command palette and closes other shell overlays. */
  show(): void {
    if (this.layoutOnboarding.isActive()) {
      return;
    }
    this.coordinator.closeOthers('commandPalette');
    this.openState.set(true);
  }

  /** Closes the command palette. */
  hide(): void {
    this.openState.set(false);
  }

  /** Toggles the command palette. */
  toggle(): void {
    if (this.layoutOnboarding.isActive()) {
      return;
    }
    if (this.openState()) {
      this.hide();
      return;
    }
    this.show();
  }
}
