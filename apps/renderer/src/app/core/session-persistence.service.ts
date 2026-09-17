import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { parseSessionFile, sanitizeSessionForWorkspace, validDatabaseTabNodeIds, flattenDatabaseConnections, flattenSavedQueries, type SessionFile } from '@testrix/contracts';

import { DesktopApiService } from './desktop-api.service';
import { ShellStateService } from './shell-state.service';
import { CollectionsStore } from '../features/collections/collections.store';
import { DatabaseStore } from '../features/database/database.store';
import { EnvironmentsStore } from '../features/environments/environments.store';
import { ToolsStore } from '../features/tools/tools.store';
import { WorkbenchStore } from '../features/workbench/workbench.store';
import { WorkspacesStore } from '../features/workspaces/workspaces.store';

const SESSION_DEBOUNCE_MS = 250;

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

  private readonly armed = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      if (!this.armed()) {
        return;
      }
      this.shell.sidebarCollapsed();
      this.shell.sidebarWidth();
      this.shell.activeRail();
      this.collections.selectedIds();
      this.collections.selectionAnchorId();
      this.database.connectionSelectedIds();
      this.database.querySelectedIds();
      this.environments.selectedIds();
      this.environments.selectionAnchorId();
      this.environments.nodeSelection();
      const patch = this.buildPatch();
      untracked(() => this.schedule(patch));
    });
    effect(() => {
      const generation = this.desktop.configGeneration();
      if (!this.armed() || generation === 0) {
        return;
      }
      untracked(() => this.applyHydratedState());
    });
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
    const databaseIds = validDatabaseTabNodeIds(this.desktop.databases(), this.desktop.queries());
    const connectionIds = new Set(flattenDatabaseConnections(this.desktop.databases().nodes).map((item) => item.id));
    const queryIds = new Set(flattenSavedQueries(this.desktop.queries().nodes).map((item) => item.id));
    const sanitized = sanitizeSessionForWorkspace(
      session,
      this.collections.allNodeIds(),
      new Set(this.environments.items().map((item) => item.id)),
      databaseIds,
      connectionIds,
      queryIds,
    );
    if (restoreShell) {
      this.shell.restoreSession(sanitized);
    }
    this.workbench.restoreSession(sanitized);
    this.environments.restoreSelection(sanitized);
    this.collections.restoreSelection(sanitized);
    this.database.restoreSelection(sanitized);
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
      selection: {
        collections: this.collections.toSessionPatch(),
        environments: environmentSelection.environments,
        environmentNodes: environmentSelection.environmentNodes,
        databaseConnections: this.database.connectionSelectionPatch(),
        databaseQueries: this.database.querySelectionPatch(),
      },
    };
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
