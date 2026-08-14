import type { Type } from '@angular/core';

import type { WorkspaceTabKind } from '@shared/config';

export type WorkspaceTabComponentType = Type<unknown>;

const tabKindLoaders: Record<
  WorkspaceTabKind,
  () => Promise<{ readonly default: WorkspaceTabComponentType }>
> = {
  request: () =>
    import('../request-workspace-tab/request-workspace-tab.component').then((m) => ({
      default: m.RequestWorkspaceTabComponent,
    })),
  history: () =>
    import('../../history/history-workspace-tab/history-workspace-tab.component').then((m) => ({
      default: m.HistoryWorkspaceTabComponent,
    })),
  websocket: () =>
    import('../websocket-workspace-tab/websocket-workspace-tab.component').then((m) => ({
      default: m.WebsocketWorkspaceTabComponent,
    })),
  environment: () =>
    import('../environment-workspace-tab/environment-workspace-tab.component').then((m) => ({
      default: m.EnvironmentWorkspaceTabComponent,
    })),
  folder: () =>
    import('../collection-folder-workspace-tab/collection-folder-workspace-tab.component').then(
      (m) => ({ default: m.CollectionFolderWorkspaceTabComponent }),
    ),
  'design-system': () =>
    import('../design-system-workspace-tab/design-system-workspace-tab.component').then((m) => ({
      default: m.DesignSystemWorkspaceTabComponent,
    })),
  'dev-tool': () =>
    import('../../development/dev-tool-workspace-tab/dev-tool-workspace-tab.component').then(
      (m) => ({ default: m.DevToolWorkspaceTabComponent }),
    ),
  'test-suite': () =>
    import('../../testing/test-suite-workspace-tab/test-suite-workspace-tab.component').then((m) => ({
      default: m.TestSuiteWorkspaceTabComponent,
    })),
  'load-test': () =>
    import('../../testing/load-test-workspace-tab/load-test-workspace-tab.component').then((m) => ({
      default: m.LoadTestWorkspaceTabComponent,
    })),
  regression: () =>
    import('../../testing/regression-workspace-tab/regression-workspace-tab.component').then((m) => ({
      default: m.RegressionWorkspaceTabComponent,
    })),
  'mock-server': () =>
    import('../../testing/mock-server-workspace-tab/mock-server-workspace-tab.component').then((m) => ({
      default: m.MockServerWorkspaceTabComponent,
    })),
  capture: () =>
    import('../../testing/capture-workspace-tab/capture-workspace-tab.component').then((m) => ({
      default: m.CaptureWorkspaceTabComponent,
    })),
  'interceptor-rule': () =>
    import('../../testing/interceptor-rule-workspace-tab/interceptor-rule-workspace-tab.component').then(
      (m) => ({ default: m.InterceptorRuleWorkspaceTabComponent }),
    ),
};

const loadedByKind = new Map<WorkspaceTabKind, WorkspaceTabComponentType>();
const inflightByKind = new Map<WorkspaceTabKind, Promise<WorkspaceTabComponentType>>();

/** Registers a tab component synchronously (e.g. eager request tab for instant open). */
export function seedWorkspaceTabComponent(
  kind: WorkspaceTabKind,
  component: WorkspaceTabComponentType,
): void {
  loadedByKind.set(kind, component);
}

/** Warms lazy tab chunks without mounting a tab. */
export function preloadWorkspaceTabKinds(...kinds: readonly WorkspaceTabKind[]): void {
  for (const kind of kinds) {
    void loadWorkspaceTabComponent(kind);
  }
}

/** Loads a workspace tab component class on demand (one chunk per kind). */
export function loadWorkspaceTabComponent(
  kind: WorkspaceTabKind,
): Promise<WorkspaceTabComponentType> {
  const cached = loadedByKind.get(kind);
  if (cached) {
    return Promise.resolve(cached);
  }

  const inflight = inflightByKind.get(kind);
  if (inflight) {
    return inflight;
  }

  const promise = tabKindLoaders[kind]().then((m) => {
    loadedByKind.set(kind, m.default);
    inflightByKind.delete(kind);
    return m.default;
  });
  inflightByKind.set(kind, promise);
  return promise;
}

/** Returns a synchronously cached tab component, if already loaded. */
export function peekWorkspaceTabComponent(kind: WorkspaceTabKind): WorkspaceTabComponentType | null {
  return loadedByKind.get(kind) ?? null;
}
