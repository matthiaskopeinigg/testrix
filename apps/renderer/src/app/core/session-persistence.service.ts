import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { parseSessionFile, sanitizeSessionForWorkspace, validDatabaseTabNodeIds, flattenDatabaseConnections, flattenSavedQueries, collectPlantumlArtifactIds, type SessionFile } from '@testrix/contracts';

import { DesktopApiService } from './desktop-api.service';
import { ShellStateService } from './shell-state.service';
import { CollectionsStore } from '../features/collections/collections.store';
import { DatabaseStore } from '../features/database/database.store';
import { EnvironmentsStore } from '../features/environments/environments.store';
import { ToolsStore } from '../features/tools/tools.store';
import { PlantumlStore } from '../features/tools/plantuml/plantuml.store';
import { HistoryStore } from '../features/history/history.store';
import { FlowTemplatesStore } from '../features/services/flows/flow-templates.store';
import { ServicesStore } from '../features/services/services.store';
import { CookieJarStore } from '../features/workbench/request/cookie-jar.store';
import { WorkbenchStore } from '../features/workbench/workbench.store';
import { WorkspacesStore } from '../features/workspaces/workspaces.store';

const SESSION_DEBOUNCE_MS = 250;

function isSameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Restores session/environments after IPC hydrate, then writes session.json on chrome changes.
 */
@Injectable({ providedIn: 'root' })
export class SessionPersistenceService {
  private readonly desktop = inject(DesktopApiService);
  private readonly shell = inject(ShellStateService);
  private readonly workbench = inject(WorkbenchStore);
  private readonly environments = inject(EnvironmentsStore);
  private readonly collections = inject(CollectionsStore);
  private readonly database = inject(DatabaseStore);
  private readonly workspaces = inject(WorkspacesStore);
  private readonly tools = inject(ToolsStore);
  private readonly plantuml = inject(PlantumlStore);
  private readonly history = inject(HistoryStore);
  private readonly services = inject(ServicesStore);
  private readonly flowTemplates = inject(FlowTemplatesStore);
  private readonly cookies = inject(CookieJarStore);

  private readonly armed = signal(false);
  private readonly sessionPatch = computed(() => this.buildPatch(), { equal: isSameJson });
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      if (!this.armed()) {
        return;
      }
      const patch = this.sessionPatch();
      untracked(() => this.schedule(patch));
    });
    effect(() => {
      const generation = this.desktop.configGeneration();
      if (!this.armed() || generation === 0) {
        return;
      }
      untracked(() => this.applyHydratedState());
    });
    this.desktop.api.window.onWorkspaceFilesChanged(() => {
      if (!this.armed())
        return;
      void this.reloadSharedWorkspaceFiles();
    });
  }

  /** Reload shared workspace JSON without wiping this window’s unsaved tab drafts. */
  private async reloadSharedWorkspaceFiles(): Promise<void> {
    try {
      const [
        collections,
        environments,
        flows,
        mocks,
        load,
        listeners,
        intercept,
        regressions,
        databases,
        queries,
        plantuml,
        flowTemplates,
        session,
      ] = await Promise.all([
        this.desktop.api.collections.get(),
        this.desktop.api.environments.get(),
        this.desktop.api.services.flows.get(),
        this.desktop.api.services.mocks.get(),
        this.desktop.api.services.load.get(),
        this.desktop.api.services.listeners.get(),
        this.desktop.api.services.intercept.get(),
        this.desktop.api.services.regressions.get(),
        this.desktop.api.databases.get(),
        this.desktop.api.queries.get(),
        this.desktop.api.plantuml.get(),
        this.desktop.api.services.flowTemplates.get(),
        this.desktop.api.session.get(),
      ]);
      this.desktop.collections.set(collections);
      this.desktop.environments.set(environments);
      this.desktop.flows.set(flows);
      this.desktop.mocks.set(mocks);
      this.desktop.load.set(load);
      this.desktop.listeners.set(listeners);
      this.desktop.intercept.set(intercept);
      this.desktop.regressions.set(regressions);
      this.desktop.databases.set(databases);
      this.desktop.queries.set(queries);
      this.desktop.plantuml.set(plantuml);
      this.desktop.flowTemplates.set(flowTemplates);
      this.database.hydrate(databases, queries, this.workspaces.activeId());
      // Keep this window’s tabs/layout; only sync shared pins from the peer write.
      this.desktop.session.update((current) =>
        parseSessionFile({
          ...current,
          palettePinsByWorkspace: session.palettePinsByWorkspace ?? {},
        }),
      );
      this.collections.hydrate(collections, this.workspaces.activeId());
      this.environments.hydrate(environments);
    } catch {
      // ignore transient IPC errors while a peer window is saving
    }
  }

  applyHydratedState(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.workspaces.hydrate(this.desktop.workspaces());
    this.bindWorkspace(this.desktop.session(), true);
    this.armed.set(true);
  }

  applyActiveWorkspace(): void {
    this.bindWorkspace(parseSessionFile({ ...this.desktop.session(), ...this.buildPatch() }), false);
  }

  private bindWorkspace(session: SessionFile, restoreShell: boolean): void {
    const workspaceId = this.workspaces.activeId();
    this.environments.hydrate(this.desktop.environments());
    this.collections.hydrate(this.desktop.collections(), workspaceId);
    this.database.hydrate(this.desktop.databases(), this.desktop.queries(), workspaceId);
    this.tools.hydrate();
    this.history.hydrate(this.desktop.history(), session.historyGroupBy);
    this.cookies.hydrate(this.desktop.cookies());
    this.services.hydrateFromSession(
      session.activeService ?? null,
      session.serviceSidebar ?? {},
      session.flowUiById ?? {},
      session.flowInspectorWidth,
      session.flowInspectorWideWidth,
    );
    this.services.hydrateRunCheckpoints(session.runCheckpointsByArtifactId ?? {});
    this.flowTemplates.hydrateFromSession(session.flowTemplatesSidebar);
    const databaseIds = validDatabaseTabNodeIds(this.desktop.databases(), this.desktop.queries());
    const connectionIds = new Set(flattenDatabaseConnections(this.desktop.databases().nodes).map((item) => item.id));
    const queryIds = new Set(flattenSavedQueries(this.desktop.queries().nodes).map((item) => item.id));
    const serviceIds = this.services.artifactIds();
    const plantumlIds = collectPlantumlArtifactIds(this.desktop.plantuml().items);
    const emulatorDeviceIds = new Set(this.desktop.emulator().devices.map((item) => item.id));
    const sanitized = sanitizeSessionForWorkspace(
      session,
      this.collections.allNodeIds(),
      new Set(this.environments.items().map((item) => item.id)),
      databaseIds,
      connectionIds,
      queryIds,
      this.history.ids(),
      serviceIds,
      plantumlIds,
      emulatorDeviceIds,
    );
    if (restoreShell) {
      this.shell.restoreSession(sanitized);
    }
    this.workbench.restoreSession(sanitized);
    this.environments.restoreSelection(sanitized);
    this.collections.restoreSelection(sanitized);
    this.database.restoreSelection(sanitized);
    this.plantuml.hydrateActiveFromWorkbench();
    this.desktop.session.set(sanitized);
    if (this.armed()) {
      void this.desktop.saveSession(sanitized);
    }
    void this.desktop.api.database.warmBoot();
  }

  private buildPatch(): Partial<Omit<SessionFile, 'schemaVersion'>> {
    const environmentSelection = this.environments.toSessionPatch();
    return {
      ...this.shell.toSessionPatch(),
      ...this.workbench.toSessionPatch(),
      ...this.services.sessionPatch(),
      ...this.tools.sessionPatch(),
      flowTemplatesSidebar: this.flowTemplates.sessionPatch(),
      selection: {
        collections: this.collections.toSessionPatch(),
        environments: environmentSelection.environments,
        environmentNodes: environmentSelection.environmentNodes,
        databaseConnections: this.database.connectionSelectionPatch(),
        databaseQueries: this.database.querySelectionPatch(),
      },
      historyGroupBy: this.history.groupBy(),
    };
  }

  /** Writes a pending debounced save now, before the app quits. */
  async flush(): Promise<void> {
    if (!this.timer)
      return;
    clearTimeout(this.timer);
    this.timer = null;
    await this.desktop.saveSession(this.sessionPatch());
  }

  private schedule(patch: Partial<Omit<SessionFile, 'schemaVersion'>>): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.desktop.saveSession(patch);
    }, SESSION_DEBOUNCE_MS);
  }
}
