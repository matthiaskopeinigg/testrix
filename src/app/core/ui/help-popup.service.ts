import { Injectable, inject, signal } from '@angular/core';

import { LayoutOnboardingService } from './layout-onboarding.service';
import { ShellOverlayCoordinatorService } from './shell-overlay-coordinator.service';

/**
 * Global open state for the help wiki overlay.
 * Rendered from shell layout so the titlebar stays above the backdrop.
 */
@Injectable({ providedIn: 'root' })
export class HelpPopupService {
  private readonly coordinator = inject(ShellOverlayCoordinatorService);
  private readonly layoutOnboarding = inject(LayoutOnboardingService);
  private readonly openState = signal(false);

  readonly open = this.openState.asReadonly();

  constructor() {
    this.coordinator.register('help', () => this.hide());
  }

  /** Opens the help overlay and closes other shell overlays. */
  show(): void {
    if (this.layoutOnboarding.isActive()) {
      return;
    }
    this.coordinator.closeOthers('help');
    this.openState.set(true);
  }

  /** Closes the help overlay. */
  hide(): void {
    this.openState.set(false);
  }
}
