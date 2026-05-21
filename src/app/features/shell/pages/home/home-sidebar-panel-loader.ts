import type { Type } from '@angular/core';

export type HomeSidebarPanelId =
  | 'collections'
  | 'environments'
  | 'testing'
  | 'development'
  | 'history'
  | 'debug';

export type HomeSidebarPanelComponent = Type<unknown>;

const panelLoaders: Record<
  HomeSidebarPanelId,
  () => Promise<{ readonly default: HomeSidebarPanelComponent }>
> = {
  collections: () =>
    import('@app/features/shell/collections/collections-sidebar-panel.component').then((m) => ({
      default: m.CollectionsSidebarPanelComponent,
    })),
  environments: () =>
    import('@app/features/shell/environments/environments-sidebar-panel.component').then((m) => ({
      default: m.EnvironmentsSidebarPanelComponent,
    })),
  testing: () =>
    import('@app/features/shell/testing/testing-sidebar-panel/testing-sidebar-panel.component').then(
      (m) => ({ default: m.TestingSidebarPanelComponent }),
    ),
  development: () =>
    import('@app/features/shell/development/development-sidebar-panel/development-sidebar-panel.component').then(
      (m) => ({ default: m.DevelopmentSidebarPanelComponent }),
    ),
  history: () =>
    import('@app/features/shell/history/history-sidebar-panel.component').then((m) => ({
      default: m.HistorySidebarPanelComponent,
    })),
  debug: () =>
    import('@app/features/dev/design-system-sidebar-panel/design-system-sidebar-panel.component').then(
      (m) => ({ default: m.DesignSystemSidebarPanelComponent }),
    ),
};

const loadedById = new Map<HomeSidebarPanelId, HomeSidebarPanelComponent>();
const inflightById = new Map<HomeSidebarPanelId, Promise<HomeSidebarPanelComponent>>();

export function loadHomeSidebarPanel(id: HomeSidebarPanelId): Promise<HomeSidebarPanelComponent> {
  const cached = loadedById.get(id);
  if (cached) {
    return Promise.resolve(cached);
  }

  const inflight = inflightById.get(id);
  if (inflight) {
    return inflight;
  }

  const promise = panelLoaders[id]().then((m) => {
    loadedById.set(id, m.default);
    inflightById.delete(id);
    return m.default;
  });
  inflightById.set(id, promise);
  return promise;
}

export function peekHomeSidebarPanel(id: HomeSidebarPanelId): HomeSidebarPanelComponent | null {
  return loadedById.get(id) ?? null;
}

export function isHomeSidebarPanelId(id: string | undefined): id is HomeSidebarPanelId {
  return (
    id === 'collections' ||
    id === 'environments' ||
    id === 'testing' ||
    id === 'development' ||
    id === 'history' ||
    id === 'debug'
  );
}
