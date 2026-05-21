import { Injectable, computed, inject, signal } from '@angular/core';

import { ConfigService } from '@app/core/config/config.service';
import {
  createDefaultWorkspaceTesting,
  mergeWorkspaceTesting,
  workspaceTestingSchema,
  type TestingActiveViewId,
  type TestingSubpanelId,
  type WorkspaceTestingState,
} from '@shared/config';

const PATCH_DEBOUNCE_MS = 300;

/**
 * Persists Testing sidebar navigation in {@link SessionFile.workspace.testing}.
 * Navigation updates apply optimistically; disk writes stay debounced.
 */
@Injectable({ providedIn: 'root' })
export class TestingSessionService {
  private readonly config = inject(ConfigService);

  private patchTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: Partial<WorkspaceTestingState> | null = null;

  /** Optimistic overlay until debounced session patch lands on disk. */
  private readonly localOverride = signal<WorkspaceTestingState | null>(null);

  private readonly mergedState = computed((): WorkspaceTestingState => {
    const local = this.localOverride();
    if (local) {
      return local;
    }
    return mergeWorkspaceTesting(this.config.session()?.workspace.testing ?? undefined, {});
  });

  readonly activeView = computed((): TestingActiveViewId => this.mergedState().activeView);

  readonly subpanel = computed((): TestingSubpanelId => this.mergedState().subpanel);

  /** Ensures the testing session slice exists. */
  load(): void {
    if (this.readSlice()) {
      return;
    }
    void this.flushPatch(createDefaultWorkspaceTesting());
  }

  patch(partial: Partial<WorkspaceTestingState>): void {
    this.applyOptimistic(partial);
    this.pending = { ...this.pending, ...partial };
    this.schedulePatch();
  }

  setActiveView(view: TestingActiveViewId): void {
    this.patch({ activeView: view, subpanel: 'menu' });
  }

  setSubpanel(subpanel: TestingSubpanelId): void {
    this.patch({ subpanel, activeView: 'menu' });
  }

  backToTestingMenu(): void {
    this.patch({ activeView: 'menu', subpanel: 'menu' });
  }

  private applyOptimistic(partial: Partial<WorkspaceTestingState>): void {
    const base = this.localOverride() ?? mergeWorkspaceTesting(this.readSlice() ?? undefined, {});
    this.localOverride.set(mergeWorkspaceTesting(base, partial));
  }

  private readSlice(): WorkspaceTestingState | null {
    return this.config.session()?.workspace.testing ?? null;
  }

  private schedulePatch(): void {
    if (this.patchTimer !== null) {
      clearTimeout(this.patchTimer);
    }
    this.patchTimer = setTimeout(() => {
      this.patchTimer = null;
      const partial = this.pending;
      this.pending = null;
      if (!partial) {
        return;
      }
      void this.flushPatch(partial);
    }, PATCH_DEBOUNCE_MS);
  }

  private async flushPatch(partial: Partial<WorkspaceTestingState>): Promise<void> {
    const next = mergeWorkspaceTesting(this.readSlice() ?? undefined, partial);
    await this.config.patchSession({
      workspace: {
        testing: workspaceTestingSchema.parse(next),
      },
    });
    this.localOverride.set(null);
  }
}
