import { Injectable, signal } from '@angular/core';

/** Optional override for the active workspace sidebar panel header. */
export interface WorkspaceSidebarPanelHeaderState {
  readonly title?: string;
  /** When set, renders a back control that invokes this callback. */
  readonly onBack?: () => void;
}

/**
 * Lets a sidebar panel override the title and optional back action shown in {@link TxSidebarComponent}.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceSidebarPanelHeaderService {
  private readonly stateSignal = signal<WorkspaceSidebarPanelHeaderState | null>(null);

  readonly state = this.stateSignal.asReadonly();

  /** Overrides the active panel header. Pass `null` to use the rail item label. */
  set(state: WorkspaceSidebarPanelHeaderState | null): void {
    this.stateSignal.set(state);
  }

  clear(): void {
    this.stateSignal.set(null);
  }
}
