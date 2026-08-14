import { APP_INITIALIZER, inject, type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { Router, type Routes } from '@angular/router';

import { ElectronService } from '../electron/electron.service';

function appendShellChildren(router: Router, extraChildren: Routes): void {
  const config = router.config.map((route) => ({
    ...route,
    children: route.children ? [...route.children] : undefined,
  }));
  const shell = config.find((route) => route.path === '');
  if (!shell) {
    return;
  }
  const children = shell.children ?? [];
  const paths = new Set(children.map((child) => child.path));
  const merged = [...children];
  for (const child of extraChildren) {
    if (!paths.has(child.path)) {
      merged.push(child);
    }
  }
  shell.children = merged;
  router.resetConfig(config);
}

async function registerDevRoutes(router: Router, electron: ElectronService): Promise<void> {
  if (typeof ngDevMode === 'undefined' || !ngDevMode) {
    return;
  }
  if (!electron.isDevToolkit()) {
    return;
  }

  const { DEV_SHELL_ROUTES } = await import('../../app.routes.dev');
  appendShellChildren(router, DEV_SHELL_ROUTES);
}

export function provideDevRoutes(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: () => {
        const router = inject(Router);
        const electron = inject(ElectronService);
        return () => registerDevRoutes(router, electron);
      },
    },
  ]);
}
