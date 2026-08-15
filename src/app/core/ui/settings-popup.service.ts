import { Injectable, inject, signal } from '@angular/core';

import { LayoutOnboardingService } from './layout-onboarding.service';
import { ShellOverlayCoordinatorService } from './shell-overlay-coordinator.service';

/**
 * Global open state for the settings overlay.
 * Rendered from shell layout so the titlebar stays above the backdrop (same as Help).
 */
@Injectable({ providedIn: 'root' })
export class SettingsPopupService {
  private readonly coordinator = inject(ShellOverlayCoordinatorService);
  private readonly layoutOnboarding = inject(LayoutOnboardingService);
  private readonly openState = signal(false);

  private readonly requestedSectionState = signal<string | null>(null);

  readonly open = this.openState.asReadonly();
  readonly requestedSection = this.requestedSectionState.asReadonly();

  constructor() {
    this.coordinator.register('settings', () => this.hide());
  }

  /** Opens the settings overlay and closes other shell overlays. */
  show(section?: string): void {
    if (this.layoutOnboarding.isActive()) {
      return;
    }
    this.coordinator.closeOthers('settings');
    this.requestedSectionState.set(section ?? null);
    this.openState.set(true);
  }

  /** Closes the settings overlay. */
  hide(): void {
    this.openState.set(false);
  }
}
