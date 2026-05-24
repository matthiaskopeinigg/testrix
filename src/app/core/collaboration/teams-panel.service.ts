import { Injectable, inject, signal } from '@angular/core';

import { ShellOverlayCoordinatorService } from '@app/core/ui/shell-overlay-coordinator.service';

@Injectable({ providedIn: 'root' })
export class TeamsPanelService {
  private readonly coordinator = inject(ShellOverlayCoordinatorService);
  private readonly openState = signal(false);

  readonly open = this.openState.asReadonly();

  constructor() {
    this.coordinator.register('teams', () => this.hide());
  }

  show(): void {
    this.coordinator.closeOthers('teams');
    this.openState.set(true);
  }

  hide(): void {
    this.openState.set(false);
  }

  toggle(): void {
    if (this.openState()) {
      this.hide();
      return;
    }
    this.show();
  }
}
