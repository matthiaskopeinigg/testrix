import { Directive, HostListener, inject } from '@angular/core';

import { DesktopApiService } from './desktop-api.service';
import { matchesShortcut } from './shortcut-match';
import { ShellStateService } from './shell-state.service';

@Directive({
  selector: '[txCommandHotkeys]',
  standalone: true,
})
export class CommandHotkeysDirective {
  private readonly shell = inject(ShellStateService);
  private readonly desktop = inject(DesktopApiService);

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
    if (event.key === 'F1') {
      event.preventDefault();
      this.shell.toggleHelp();
      return;
    }
    if (event.key === 'Escape' && !event.defaultPrevented) {
      this.shell.closeOverlays();
    }
  }
}
