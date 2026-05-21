import type { Type } from '@angular/core';

import type { TestingSubpanelId } from '@shared/config';

export type TestingSidebarPanelComponent = Type<unknown>;

const programmaticLoaders: Record<
  Exclude<TestingSubpanelId, 'menu'>,
  () => Promise<{ readonly default: TestingSidebarPanelComponent }>
> = {
  regression: () =>
    import('@app/features/shell/testing/regression-sidebar-panel/regression-sidebar-panel.component').then(
      (m) => ({ default: m.RegressionSidebarPanelComponent }),
    ),
  'mock-server': () =>
    import('@app/features/shell/testing/mock-server-sidebar-panel/mock-server-sidebar-panel.component').then(
      (m) => ({ default: m.MockServerSidebarPanelComponent }),
    ),
  capture: () =>
    import('@app/features/shell/testing/capture-sidebar-panel/capture-sidebar-panel.component').then(
      (m) => ({ default: m.CaptureSidebarPanelComponent }),
    ),
  interceptor: () =>
    import('@app/features/shell/testing/interceptor-sidebar-panel/interceptor-sidebar-panel.component').then(
      (m) => ({ default: m.InterceptorSidebarPanelComponent }),
    ),
};

const hubLoader = () =>
  import('@app/features/shell/testing/testing-sidebar-panel/testing-sidebar-panel.component').then(
    (m) => ({ default: m.TestingSidebarPanelComponent }),
  );

const loadedByKey = new Map<string, TestingSidebarPanelComponent>();
const inflightByKey = new Map<string, Promise<TestingSidebarPanelComponent>>();

function cacheKey(subpanel: TestingSubpanelId): string {
  return subpanel === 'menu' ? 'hub' : subpanel;
}

/**
 * Loads the Testing rail panel component for hub or programmatic sub-panels.
 */
export function loadTestingSidebarPanel(
  subpanel: TestingSubpanelId,
): Promise<TestingSidebarPanelComponent> {
  const key = cacheKey(subpanel);
  const cached = loadedByKey.get(key);
  if (cached) {
    return Promise.resolve(cached);
  }
  const inflight = inflightByKey.get(key);
  if (inflight) {
    return inflight;
  }
  const loader = subpanel === 'menu' ? hubLoader : programmaticLoaders[subpanel];
  const promise = loader().then((m) => {
    loadedByKey.set(key, m.default);
    inflightByKey.delete(key);
    return m.default;
  });
  inflightByKey.set(key, promise);
  return promise;
}

export function peekTestingSidebarPanel(
  subpanel: TestingSubpanelId,
): TestingSidebarPanelComponent | null {
  return loadedByKey.get(cacheKey(subpanel)) ?? null;
}
