import { effect, inject, signal, type WritableSignal } from '@angular/core';

import { DevelopmentSessionService } from '@app/core/development/development-session.service';
import type { DevelopmentToolId, DevelopmentToolStateForId } from '@shared/config';

/**
 * Hydrates a tool state signal from session and debounces persistence on change.
 */
export function createDevToolStateBinding<T extends DevelopmentToolId>(
  toolId: T,
): WritableSignal<DevelopmentToolStateForId<T>> {
  const session = inject(DevelopmentSessionService);
  session.load();
  const state = signal(session.getToolState(toolId)) as WritableSignal<DevelopmentToolStateForId<T>>;

  effect(() => {
    const snapshot = state();
    session.patchToolState(toolId, snapshot);
  });

  return state;
}
