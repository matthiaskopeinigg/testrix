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

type TestingNavigationState = Pick<WorkspaceTestingState, 'activeView' | 'subpanel'>;

/**
 * Persists Testing sidebar navigation in {@link SessionFile.workspace.testing}.
 * Navigation is held in-memory as the UI source of truth so tree/tab prefs patches
 * cannot snap the sidebar back to the hub menu.
 */
@Injectable({ providedIn: 'root' })
export class TestingSessionService {
  private readonly config = inject(ConfigService);

  private patchTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingNav: Partial<TestingNavigationState> | null = null;

  /** Authoritative in-memory navigation; session prefs patches must not overwrite this. */
  private readonly nav = signal<TestingNavigationState>({
    activeView: 'menu',
    subpanel: 'menu',
  });

  readonly activeView = computed((): TestingActiveViewId => this.nav().activeView);

  readonly subpanel = computed((): TestingSubpanelId => this.nav().subpanel);

  /** Ensures the testing session slice exists and hydrates navigation from session once. */
  load(): void {
    const slice = this.readSlice();
    if (!slice) {
      void this.persistNavigation({ activeView: 'menu', subpanel: 'menu' }, createDefaultWorkspaceTesting());
      return;
    }
    this.syncNavFromSession();
  }

  /** Re-reads navigation after a workspace profile switch or session reload. */
  rehydrateFromSession(): void {
    this.syncNavFromSession();
  }

  setActiveView(view: TestingActiveViewId): void {
    this.applyNavigation({ activeView: view, subpanel: 'menu' });
  }

  setSubpanel(subpanel: TestingSubpanelId): void {
    this.applyNavigation({ subpanel, activeView: 'menu' });
  }

  backToTestingMenu(): void {
    this.applyNavigation({ activeView: 'menu', subpanel: 'menu' });
  }

  /** Flushes debounced navigation writes before profile switch. */
  async flushPending(): Promise<void> {
    if (this.patchTimer !== null) {
      clearTimeout(this.patchTimer);
      this.patchTimer = null;
    }
    const nav = this.pendingNav;
    this.pendingNav = null;
    if (!nav) {
      return;
    }
    await this.persistNavigation(nav);
  }

  /**
   * Spread into direct {@link ConfigService.patchSession} testing patches so
   * concurrent tree/tab UI writes keep the current drill-in view.
   */
  navigationFields(): TestingNavigationState {
    return { ...this.nav() };
  }

  private applyNavigation(partial: Partial<TestingNavigationState>): void {
    this.nav.update((current) => ({ ...current, ...partial }));
    this.pendingNav = { ...this.pendingNav, ...partial };
    this.schedulePersist();
  }

  private readSlice(): WorkspaceTestingState | null {
    return this.config.session()?.workspace.testing ?? null;
  }

  private syncNavFromSession(): void {
    const slice = this.readSlice();
    if (!slice) {
      return;
    }
    if (this.patchTimer !== null || this.pendingNav) {
      return;
    }
    this.nav.set(this.normalizeNavigation(slice.activeView, slice.subpanel));
  }

  /** Migrates legacy subpanel:regression sessions to activeView drill-in. */
  private normalizeNavigation(
    activeView: TestingActiveViewId,
    subpanel: TestingSubpanelId,
  ): TestingNavigationState {
    if (activeView === 'menu' && subpanel === 'regression') {
      return { activeView: 'regression', subpanel: 'menu' };
    }
    return { activeView, subpanel };
  }

  private schedulePersist(): void {
    if (this.patchTimer !== null) {
      clearTimeout(this.patchTimer);
    }
    this.patchTimer = setTimeout(() => {
      this.patchTimer = null;
      const nav = this.pendingNav;
      this.pendingNav = null;
      if (!nav) {
        return;
      }
      void this.persistNavigation(nav);
    }, PATCH_DEBOUNCE_MS);
  }

  private async persistNavigation(
    nav: Partial<TestingNavigationState>,
    seed?: Partial<WorkspaceTestingState>,
  ): Promise<void> {
    const next = mergeWorkspaceTesting(this.readSlice() ?? undefined, {
      ...seed,
      ...nav,
    });
    await this.config.patchSession({
      workspace: {
        testing: workspaceTestingSchema.parse(next),
      },
    });
  }
}
