import type { Type } from '@angular/core';

import type { HttpRequestSectionId } from '@shared/config';

/** Request tab sections backed by lazy-loaded panel components (excludes response split). */
export type RequestTabSectionPanelId = Exclude<HttpRequestSectionId, 'response'>;

const sectionLoaders: Record<
  RequestTabSectionPanelId,
  () => Promise<{ readonly default: Type<unknown> }>
> = {
  overview: () =>
    import('./request-tab-overview-panel.component').then((m) => ({
      default: m.RequestTabOverviewPanelComponent,
    })),
  params: () =>
    import('./request-tab-params-panel.component').then((m) => ({
      default: m.RequestTabParamsPanelComponent,
    })),
  auth: () =>
    import('../collection-folder-workspace-tab/folder-tab-auth-panel.component').then((m) => ({
      default: m.FolderTabAuthPanelComponent,
    })),
  headers: () =>
    import('./request-tab-headers-panel.component').then((m) => ({
      default: m.RequestTabHeadersPanelComponent,
    })),
  body: () =>
    import('./request-tab-body-panel.component').then((m) => ({
      default: m.RequestTabBodyPanelComponent,
    })),
  scripts: () =>
    import('./request-tab-scripts-panel.component').then((m) => ({
      default: m.RequestTabScriptsPanelComponent,
    })),
  settings: () =>
    import('./request-tab-settings-panel.component').then((m) => ({
      default: m.RequestTabSettingsPanelComponent,
    })),
  docs: () =>
    import('./request-tab-docs-panel.component').then((m) => ({
      default: m.RequestTabDocsPanelComponent,
    })),
};

const loadedBySection = new Map<RequestTabSectionPanelId, Type<unknown>>();
const inflightBySection = new Map<RequestTabSectionPanelId, Promise<Type<unknown>>>();

/** Returns a synchronously cached section panel, if already loaded. */
export function peekRequestTabSection(section: RequestTabSectionPanelId): Type<unknown> | null {
  return loadedBySection.get(section) ?? null;
}

/** Loads a request tab section panel (one lazy chunk per section). */
export function loadRequestTabSection(section: RequestTabSectionPanelId): Promise<Type<unknown>> {
  const cached = loadedBySection.get(section);
  if (cached) {
    return Promise.resolve(cached);
  }

  const inflight = inflightBySection.get(section);
  if (inflight) {
    return inflight;
  }

  const promise = sectionLoaders[section]().then((module) => {
    loadedBySection.set(section, module.default);
    inflightBySection.delete(section);
    return module.default;
  });
  inflightBySection.set(section, promise);
  return promise;
}

/** Warms section panel chunks without mounting them. */
export function prefetchRequestTabSections(...sections: readonly RequestTabSectionPanelId[]): void {
  for (const section of sections) {
    void loadRequestTabSection(section);
  }
}

/** Waits for in-flight lazy section loads (Vitest teardown helper). */
export async function drainRequestTabSectionLoadsForTests(): Promise<void> {
  if (inflightBySection.size === 0) {
    return;
  }
  await Promise.allSettled([...inflightBySection.values()]);
}

/** Clears cached lazy section loads between Vitest cases. */
export function resetRequestTabSectionLoadsForTests(): void {
  loadedBySection.clear();
  inflightBySection.clear();
}
