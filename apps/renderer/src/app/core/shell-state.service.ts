import { Injectable, signal } from '@angular/core';
import {
  clampSidebarWidth,
  railSlideDirection,
  TX_SIDEBAR_DEFAULT_WIDTH,
  type TxRailItemId,
  type TxRailSlideDir,
} from '@testrix/ui';
import {
  FOCUS_EDIT_COLLAPSE_WIDTH_PX,
  type CollabDockTab,
  type SessionFile,
  type SessionRailId,
} from '@testrix/contracts';

import type { HelpOpenTarget } from '../features/help/help-context.service';
import type { SettingsCategory } from '../features/settings/settings-registry';

/** The Collab header and its five tabs need this much room. */
export const COLLAB_DOCK_MIN_WIDTH = 320;
export const COLLAB_DOCK_MAX_WIDTH = 560;

function clampCollabDockWidth(width: number): number {
  return clampSidebarWidth(width, COLLAB_DOCK_MIN_WIDTH, COLLAB_DOCK_MAX_WIDTH);
}

@Injectable({ providedIn: 'root' })
export class ShellStateService {
  readonly sidebarCollapsed = signal(false);
  readonly sidebarWidth = signal(TX_SIDEBAR_DEFAULT_WIDTH);
  /** Collab dock on the right edge, toggled from the rail footer. */
  readonly collabDockOpen = signal(false);
  readonly collabDockWidth = signal(360);
  readonly collabDockTab = signal<CollabDockTab>('overview');
  readonly paletteOpen = signal(false);
  readonly settingsOpen = signal(false);
  readonly workspaceManagerOpen = signal(false);
  readonly helpOpen = signal(false);
  readonly helpTarget = signal<HelpOpenTarget | null>(null);
  readonly settingsCategory = signal<SettingsCategory | null>(null);
  readonly settingsHighlight = signal<string | null>(null);
  readonly activeRail = signal<TxRailItemId>('collections');
  /** Tint the rail when a related editor is focused but the sidebar stays collapsed. */
  readonly softRailHighlight = signal<TxRailItemId | null>(null);
  readonly railSlideDir = signal<TxRailSlideDir | null>(null);
  readonly sceneNonce = signal(0);

  restoreSession(session: SessionFile): void {
    this.sidebarCollapsed.set(session.sidebarCollapsed);
    this.sidebarWidth.set(clampSidebarWidth(session.sidebarWidth));
    this.collabDockOpen.set(session.collabDockOpen);
    this.collabDockWidth.set(clampCollabDockWidth(session.collabDockWidth));
    this.collabDockTab.set(session.collabDockTab);
    this.activeRail.set(session.activeRail);
  }

  /** Opens the Collab dock on a specific tab. */
  openCollabDockTab(tab: CollabDockTab): void {
    this.collabDockTab.set(tab);
    this.collabDockOpen.set(true);
  }

  toggleCollabDock(): void {
    this.collabDockOpen.update((open) => !open);
  }

  openCollabDock(): void {
    this.collabDockOpen.set(true);
  }

  setCollabDockWidth(width: number): void {
    this.collabDockWidth.set(clampCollabDockWidth(width));
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update((value) => !value);
  }

  hideSidebar(): void {
    this.sidebarCollapsed.set(true);
  }

  showSidebar(): void {
    this.sidebarCollapsed.set(false);
  }

  setSoftRailHighlight(id: TxRailItemId | null): void {
    this.softRailHighlight.set(id);
  }

  /**
   * Collapses the sidebar when focus mode is on or the window is narrow.
   */
  maybeCollapseSidebarForRequest(focusWhileEditing: boolean): void {
    if (this.sidebarCollapsed())
      return;
    const narrow =
      typeof window !== 'undefined' && window.innerWidth < FOCUS_EDIT_COLLAPSE_WIDTH_PX;
    if (focusWhileEditing || narrow)
      this.hideSidebar();
  }

  setSidebarWidth(width: number): void {
    this.sidebarWidth.set(Math.max(0, Math.round(width)));
  }

  openPalette(): void {
    this.setOverlay('palette');
  }

  closeOverlays(): void {
    this.setOverlay(null);
  }

  openSettings(category?: SettingsCategory, highlightId?: string): void {
    this.settingsCategory.set(category ?? null);
    this.settingsHighlight.set(highlightId ?? null);
    this.setOverlay('settings');
  }

  openWorkspaceManager(): void {
    this.setOverlay('workspace');
  }

  openHelp(target?: HelpOpenTarget | null): void {
    this.helpTarget.set(target ?? null);
    this.setOverlay('help');
  }

  toggleHelp(openWith?: HelpOpenTarget | null): void {
    if (this.helpOpen()) {
      this.closeOverlays();
      return;
    }
    this.openHelp(openWith ?? null);
  }

  private setOverlay(which: 'palette' | 'settings' | 'workspace' | 'help' | null): void {
    this.paletteOpen.set(which === 'palette');
    this.settingsOpen.set(which === 'settings');
    this.workspaceManagerOpen.set(which === 'workspace');
    this.helpOpen.set(which === 'help');
    if (which !== 'help')
      this.helpTarget.set(null);
  }

  playScene(): void {
    this.sceneNonce.update((value) => value + 1);
  }

  /**
   * Open a rail page without collapsing when it is already active (palette / deep links).
   */
  openRail(id: TxRailItemId): void {
    if (this.sidebarCollapsed()) {
      this.railSlideDir.set(null);
      this.activeRail.set(id);
      this.sidebarCollapsed.set(false);
      this.playScene();
      return;
    }
    if (this.activeRail() === id)
      return;
    this.railSlideDir.set(railSlideDirection(this.activeRail(), id));
    this.activeRail.set(id);
  }

  /**
   * Rail click: open when collapsed, toggle closed on the active page, otherwise switch page.
   */
  selectRail(id: TxRailItemId): void {
    if (this.sidebarCollapsed()) {
      this.railSlideDir.set(null);
      this.activeRail.set(id);
      this.sidebarCollapsed.set(false);
      this.playScene();
      return;
    }
    if (this.activeRail() === id) {
      this.sidebarCollapsed.set(true);
      return;
    }
    this.railSlideDir.set(railSlideDirection(this.activeRail(), id));
    this.activeRail.set(id);
  }

  toSessionPatch(): Pick<
    SessionFile,
    'sidebarCollapsed' | 'sidebarWidth' | 'activeRail' | 'collabDockOpen' | 'collabDockWidth' | 'collabDockTab'
  > {
    return {
      sidebarCollapsed: this.sidebarCollapsed(),
      sidebarWidth: clampSidebarWidth(this.sidebarWidth()),
      collabDockOpen: this.collabDockOpen(),
      collabDockWidth: clampCollabDockWidth(this.collabDockWidth()),
      collabDockTab: this.collabDockTab(),
      activeRail: this.activeRail() as SessionRailId,
    };
  }
}
