import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TxHintComponent, TxOverlayComponent, TxOverlayHostDirective } from '@testrix/ui';

import { DesktopApiService } from '../../core/desktop-api.service';
import { ShellStateService } from '../../core/shell-state.service';
import { DatabaseQueryActionsService } from '../database/database-query-actions.service';
import { WorkbenchStore } from '../workbench/workbench.store';

interface PaletteCommand {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly shortcut?: string;
  readonly run: () => void;
}

@Component({
  selector: 'tx-command-palette',
  standalone: true,
  imports: [TxOverlayComponent, TxHintComponent],
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [TxOverlayHostDirective],
})
export class CommandPaletteComponent {
  readonly shell = inject(ShellStateService);
  private readonly desktop = inject(DesktopApiService);
  private readonly workbench = inject(WorkbenchStore);
  private readonly queryActions = inject(DatabaseQueryActionsService);
  readonly query = signal('');

  readonly commands = computed((): readonly PaletteCommand[] => {
    const chords = this.desktop.settings().shortcuts;
    const commands: PaletteCommand[] = [
      {
        id: 'help',
        label: 'Open help',
        hint: 'Features, shortcuts, and tips',
        shortcut: 'F1',
        run: () => this.shell.openHelp(),
      },
      {
        id: 'settings',
        label: 'Open settings',
        hint: 'Preferences window',
        shortcut: chords.settings,
        run: () => this.shell.openSettings(),
      },
      {
        id: 'sidebar',
        label: 'Toggle sidebar',
        hint: 'Show or hide the tree',
        shortcut: chords.sidebar,
        run: () => {
          this.shell.toggleSidebar();
          this.shell.closeOverlays();
        },
      },
      {
        id: 'reload',
        label: 'Reload window',
        hint: 'Restart the renderer',
        run: () => void this.desktop.api.app.reload(),
      },
    ];
    const focused = this.workbench.focusedGroup();
    const tab = focused?.tabs.find((item) => item.id === focused.activeTabId);
    if (tab?.kind === 'database-query') {
      commands.unshift({
        id: 'run-database-query',
        label: 'Run database query',
        hint: 'Execute at caret, or choose all when several exist',
        shortcut: 'Ctrl Enter',
        run: () => {
          this.queryActions.run();
          this.shell.closeOverlays();
        },
      });
    }
    return commands;
  });

  filtered(): readonly PaletteCommand[] {
    const q = this.query().trim().toLowerCase();
    const commands = this.commands();
    if (!q) {
      return commands;
    }
    return commands.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(q));
  }

  handleInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
  }
}
