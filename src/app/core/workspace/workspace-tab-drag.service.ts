import { Injectable, signal } from '@angular/core';

import type { WorkspaceTabDragPayload } from './workspace-tab-drag';

/**
 * Holds the active tab drag payload because {@link DataTransfer#getData} is
 * unavailable during `dragover` for custom MIME types.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceTabDragService {
  readonly payload = signal<WorkspaceTabDragPayload | null>(null);

  /** Records a tab drag session. */
  begin(payload: WorkspaceTabDragPayload): void {
    this.payload.set(payload);
  }

  /** Clears the active tab drag session. */
  end(): void {
    this.payload.set(null);
  }
}
