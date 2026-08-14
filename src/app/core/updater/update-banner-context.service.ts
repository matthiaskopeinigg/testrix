import { Injectable, signal } from '@angular/core';

/**
 * When Settings → About is active, the global update banner is hidden to avoid duplicate UI.
 */
@Injectable({ providedIn: 'root' })
export class UpdateBannerContextService {
  private readonly updatesPanelActive = signal(false);

  readonly hideGlobalBanner = this.updatesPanelActive.asReadonly();

  setUpdatesPanelActive(active: boolean): void {
    this.updatesPanelActive.set(active);
  }

  /** Ensures the global banner can show (e.g. dev simulation from Debug sidebar). */
  clearPanelSuppression(): void {
    this.updatesPanelActive.set(false);
  }
}
