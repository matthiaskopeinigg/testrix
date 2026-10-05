import { Injectable, signal } from '@angular/core';

/**
 * Opens the export workspace overlay. Hosted once on the shell overlay stack.
 */
@Injectable({ providedIn: 'root' })
export class ExportWorkspaceDialogService {
  readonly open = signal(false);
  /** Bumped after a successful export so Settings can flash the Data row. */
  readonly settingsFlashTick = signal(0);

  show(): void {
    this.open.set(true);
  }

  hide(): void {
    this.open.set(false);
  }

  notifyExportSuccess(): void {
    this.settingsFlashTick.update((value) => value + 1);
  }
}
