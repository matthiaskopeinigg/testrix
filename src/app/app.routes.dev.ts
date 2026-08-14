import type { Routes } from '@angular/router';

import { devToolkitGuard } from './core/dev/dev-toolkit.guard';

/**
 * Dev-only routes. Loaded at runtime via `registerDevRoutes()` when `TESTRIX_DEV=1`.
 */
export const DEV_SHELL_ROUTES: Routes = [
  {
    path: 'dev',
    canActivate: [devToolkitGuard],
    loadComponent: async () =>
      (await import('./features/dev/debug-redirect.component')).DebugRedirectComponent,
  },
];
