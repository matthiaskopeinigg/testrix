import { DestroyRef, Directive, HostListener, inject } from '@angular/core';

import { DesktopApiService } from './desktop-api.service';
import { matchesShortcut } from './shortcut-match';
import { CollectionsStore } from '../features/collections/collections.store';
import { HelpContextService } from '../features/help/help-context.service';
import { WorkbenchStore } from '../features/workbench/workbench.store';
import { ShellStateService } from './shell-state.service';

const ZOOM_WHEEL_PX = 100;
const ZOOM_WHEEL_LOCK_MS = 80;

@Directive({
  selector: '[txCommandHotkeys]',
  standalone: true,
})
export class CommandHotkeysDirective {
  private readonly shell = inject(ShellStateService);
  private readonly helpContext = inject(HelpContextService);
  private readonly desktop = inject(DesktopApiService);
  private readonly collections = inject(CollectionsStore);
  private readonly workbench = inject(WorkbenchStore);
  private wheelCarry = 0;
  private zoomLockUntil = 0;

  constructor() {
    const onWheel = (event: WheelEvent) => this.handleWheel(event);
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    inject(DestroyRef).onDestroy(() => window.removeEventListener('wheel', onWheel, true));
  }

  @HostListener('window:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented)
      return;
    const chords = this.desktop.settings().shortcuts;
    if (matchesShortcut(chords.palette, event)) {
      event.preventDefault();
      if (this.shell.paletteOpen()) {
        this.shell.closeOverlays();
        return;
      }
      this.shell.openPalette();
      return;
    }
    if (matchesShortcut(chords.settings, event)) {
      event.preventDefault();
      this.shell.openSettings();
      return;
    }
    if (matchesShortcut(chords.sidebar, event)) {
      event.preventDefault();
      this.shell.toggleSidebar();
      return;
    }
    if (matchesShortcut(chords.help, event)) {
      event.preventDefault();
      if (this.shell.helpOpen()) {
        this.shell.closeOverlays();
        return;
      }
      this.helpContext.openContextualHelp();
      return;
    }
    if (matchesShortcut(chords.newRequest, event)) {
      event.preventDefault();
      this.shell.closeOverlays();
      this.shell.openRail('collections');
      this.shell.showSidebar();
      this.collections.setSearchQuery('');
      this.collections.clearFilters();
      const node = this.collections.create('http', null);
      this.workbench.openFromNode(node);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'n' && !event.altKey) {
      event.preventDefault();
      void this.desktop.api.window.openWorkbench();
      return;
    }
    if (matchesShortcut(chords.zoomIn, event)) {
      event.preventDefault();
      this.desktop.nudgeUiZoom(1);
      return;
    }
    if (matchesShortcut(chords.zoomOut, event)) {
      event.preventDefault();
      this.desktop.nudgeUiZoom(-1);
      return;
    }
    if (matchesShortcut(chords.zoomReset, event)) {
      event.preventDefault();
      this.desktop.setUiZoom(1, true);
      return;
    }
    if (event.key === 'Escape' && !event.defaultPrevented) {
      this.shell.closeOverlays();
    }
  }

  private handleWheel(event: WheelEvent): void {
    if (!event.ctrlKey || event.altKey || event.shiftKey)
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const unit =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? 800
          : 1;
    this.wheelCarry += event.deltaY * unit;
    const now = performance.now();
    if (now < this.zoomLockUntil)
      return;
    if (Math.abs(this.wheelCarry) < ZOOM_WHEEL_PX)
      return;
    const dir: 1 | -1 = this.wheelCarry < 0 ? 1 : -1;
    this.wheelCarry += dir * ZOOM_WHEEL_PX;
    this.zoomLockUntil = now + ZOOM_WHEEL_LOCK_MS;
    this.desktop.nudgeUiZoom(dir);
  }
}
