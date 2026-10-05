import '@angular/compiler';
import { Injector, ɵChangeDetectionScheduler, ɵEffectScheduler, type Provider, type Type } from '@angular/core';

import { DesktopApiService } from '../app/core/desktop-api.service';

/**
 * Builds a root-style injector for a store under test. The real desktop bridge is
 * swapped for `desktop`, so stores run without Electron.
 */
export function createStoreHarness<T>(store: Type<T>, desktop: Partial<DesktopApiService>, providers: Provider[] = []): {
  readonly store: T;
  readonly injector: Injector;
} {
  const injector = Injector.create({
    providers: [
      { provide: ɵChangeDetectionScheduler, useValue: { notify: () => undefined } },
      {
        provide: ɵEffectScheduler,
        useValue: { add: () => undefined, remove: () => undefined, schedule: () => undefined, flush: () => undefined },
      },
      { provide: DesktopApiService, useValue: desktop },
      ...providers,
      { provide: store, useClass: store },
    ],
  });
  return { store: injector.get(store), injector };
}
