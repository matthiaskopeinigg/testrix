import { Injectable, signal } from '@angular/core';
import {
  clampSidebarWidth,
  railSlideDirection,
  TX_SIDEBAR_DEFAULT_WIDTH,
  type TxRailItemId,
  type TxRailSlideDir,
} from '@testrix/ui';
import type { SessionFile, SessionRailId } from '@testrix/contracts';

@Injectable({ providedIn: 'root' })
export class ShellStateService {
  readonly sidebarCollapsed = signal(false);
  readonly sidebarWidth = signal(TX_SIDEBAR_DEFAULT_WIDTH);
  readonly paletteOpen = signal(false);
  readonly settingsOpen = signal(false);
  readonly workspaceManagerOpen = signal(false);
  readonly helpOpen = signal(false);
  readonly activeRail = signal<TxRailItemId>('collections');
  readonly railSlideDir = signal<TxRailSlideDir | null>(null);
  readonly sceneNonce = signal(0);

  restoreSession(session: SessionFile): void {
    this.sidebarCollapsed.set(session.sidebarCollapsed);
    this.sidebarWidth.set(clampSidebarWidth(session.sidebarWidth));
    this.activeRail.set(session.activeRail);
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

  setSidebarWidth(width: number): void {
    this.sidebarWidth.set(Math.max(0, Math.round(width)));
  }

  openPalette(): void {
    this.setOverlay('palette');
  }

  closeOverlays(): void {
    this.setOverlay(null);
  }

  openSettings(): void {
    this.setOverlay('settings');
  }

  openWorkspaceManager(): void {
    this.setOverlay('workspace');
  }

  openHelp(): void {
    this.setOverlay('help');
  }

  toggleHelp(): void {
    if (this.helpOpen()) {
      this.closeOverlays();
      return;
    }
    this.openHelp();
  }

  private setOverlay(which: 'palette' | 'settings' | 'workspace' | 'help' | null): void {
    this.paletteOpen.set(which === 'palette');
    this.settingsOpen.set(which === 'settings');
    this.workspaceManagerOpen.set(which === 'workspace');
    this.helpOpen.set(which === 'help');
  }

  playScene(): void {
    this.sceneNonce.update((value) => value + 1);
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

  toSessionPatch(): Pick<SessionFile, 'sidebarCollapsed' | 'sidebarWidth' | 'activeRail'> {
    return {
      sidebarCollapsed: this.sidebarCollapsed(),
      sidebarWidth: clampSidebarWidth(this.sidebarWidth()),
      activeRail: this.activeRail() as SessionRailId,
    };
  }
}
