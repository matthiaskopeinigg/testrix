import { Injectable, computed, inject, signal } from '@angular/core';

import { ConfigService } from '@app/core/config/config.service';

const PATCH_DEBOUNCE_MS = 300;

const WORKSPACE_SIDEBAR_PANEL_IDS = [
  'collections',
  'environments',
  'testing',
  'development',
  'history',
  'debug',
] as const;

export type WorkspaceSidebarPanelId = (typeof WORKSPACE_SIDEBAR_PANEL_IDS)[number];

interface WorkspaceSidebarSessionState {
  readonly activeSidebarPanelId: string | null;
  readonly sidebarPanelOpen: boolean;
}

/**
 * Persists workspace icon-rail sidebar panel selection in {@link SessionFile.workspace}.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceSidebarSessionService {
  private readonly config = inject(ConfigService);

  private patchTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPatch: Partial<WorkspaceSidebarSessionState> | null = null;

  private readonly state = signal<WorkspaceSidebarSessionState>({
    activeSidebarPanelId: null,
    sidebarPanelOpen: false,
  });

  readonly activeSidebarPanelId = computed(() => this.state().activeSidebarPanelId);

  readonly sidebarPanelOpen = computed(() => this.state().sidebarPanelOpen);

  /** Hydrates sidebar panel state from the current session file. */
  load(): void {
    this.syncFromSession();
  }

  /** Re-reads sidebar state after profile switch or session reload. */
  rehydrateFromSession(): void {
    if (this.patchTimer !== null || this.pendingPatch) {
      return;
    }
    this.syncFromSession();
  }

  setActiveSidebarPanelId(id: string | null | undefined): void {
    const nextId = normalizeSidebarPanelId(id);
    this.state.update((current) => ({ ...current, activeSidebarPanelId: nextId }));
    this.queuePatch({ activeSidebarPanelId: nextId });
  }

  setSidebarPanelOpen(open: boolean): void {
    this.state.update((current) => ({ ...current, sidebarPanelOpen: open }));
    this.queuePatch({ sidebarPanelOpen: open });
  }

  /** Flushes debounced session writes before profile switch. */
  async flushPending(): Promise<void> {
    if (this.patchTimer !== null) {
      clearTimeout(this.patchTimer);
      this.patchTimer = null;
    }
    const patch = this.pendingPatch;
    this.pendingPatch = null;
    if (!patch) {
      return;
    }
    await this.persist(patch);
  }

  private syncFromSession(): void {
    const workspace = this.config.session()?.workspace;
    if (!workspace) {
      return;
    }
    this.state.set({
      activeSidebarPanelId: normalizeSidebarPanelId(workspace.activeSidebarPanelId),
      sidebarPanelOpen: workspace.sidebarPanelOpen === true,
    });
  }

  private queuePatch(patch: Partial<WorkspaceSidebarSessionState>): void {
    this.pendingPatch = { ...this.pendingPatch, ...patch };
    if (this.patchTimer !== null) {
      clearTimeout(this.patchTimer);
    }
    this.patchTimer = setTimeout(() => {
      this.patchTimer = null;
      const pending = this.pendingPatch;
      this.pendingPatch = null;
      if (!pending) {
        return;
      }
      void this.persist(pending);
    }, PATCH_DEBOUNCE_MS);
  }

  private async persist(patch: Partial<WorkspaceSidebarSessionState>): Promise<void> {
    await this.config.patchSession({
      workspace: patch,
    });
  }
}

function normalizeSidebarPanelId(id: string | null | undefined): string | null {
  if (!id) {
    return null;
  }
  return (WORKSPACE_SIDEBAR_PANEL_IDS as readonly string[]).includes(id) ? id : null;
}
