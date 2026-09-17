import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, effect, inject } from '@angular/core';
import {
  TxActivityRailComponent,
  TxConfirmDialogComponent,
  TxDndService,
  TxDragLayerComponent,
  TxHintLayerComponent,
  TxSidebarComponent,
  TxWindowTitlebarComponent,
  type TxRailItemId,
} from '@testrix/ui';

import { CommandHotkeysDirective } from '../core/command-hotkeys.directive';
import { ConfirmDialogService } from '../core/confirm-dialog.service';
import { DesktopApiService } from '../core/desktop-api.service';
import { SessionPersistenceService } from '../core/session-persistence.service';
import { ShellStateService } from '../core/shell-state.service';
import { CollectionsSidebarComponent } from '../features/collections/collections-sidebar.component';
import { DatabaseSidebarComponent } from '../features/database/database-sidebar.component';
import { EnvironmentsSidebarComponent } from '../features/environments/environments-sidebar.component';
import { ToolsSidebarComponent } from '../features/tools/tools-sidebar.component';
import { CommandPaletteComponent } from '../features/command-palette/command-palette.component';
import { HelpOverlayComponent } from '../features/help/help-overlay.component';
import { SettingsOverlayComponent } from '../features/settings/settings-overlay.component';
import { WorkbenchComponent } from '../features/workbench/workbench.component';
import { WorkspaceManagerComponent } from '../features/workspaces/workspace-manager.component';
import { EnvironmentSwitcherComponent } from './environment-switcher.component';
import { WorkspaceSwitcherComponent } from './workspace-switcher.component';

@Component({
  selector: 'tx-shell',
  standalone: true,
  imports: [
    TxWindowTitlebarComponent,
    TxActivityRailComponent,
    TxDragLayerComponent,
    TxHintLayerComponent,
    TxSidebarComponent,
    CollectionsSidebarComponent,
    DatabaseSidebarComponent,
    EnvironmentsSidebarComponent,
    ToolsSidebarComponent,
    WorkbenchComponent,
    EnvironmentSwitcherComponent,
    WorkspaceSwitcherComponent,
    CommandPaletteComponent,
    SettingsOverlayComponent,
    HelpOverlayComponent,
    WorkspaceManagerComponent,
    TxConfirmDialogComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [CommandHotkeysDirective],
})
export class ShellComponent {
  readonly desktop = inject(DesktopApiService);
  readonly shell = inject(ShellStateService);
  readonly confirm = inject(ConfirmDialogService);
  private readonly dnd = inject(TxDndService);
  private readonly session = inject(SessionPersistenceService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect(() => {
      if (this.shell.sidebarCollapsed()) {
        this.dnd.abort();
      }
    });
    const onPointerDown = (event: PointerEvent | MouseEvent) => {
      this.handleOutsideSidebar(event);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('mousedown', onPointerDown, true);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('mousedown', onPointerDown, true);
    });
    afterNextRender(() => {
      void this.bootstrap();
    });
  }

  async bootstrap(): Promise<void> {
    await this.desktop.hydrate();
    this.session.applyHydratedState();
    this.desktop.notifyReady();
  }

  handleRail(id: TxRailItemId): void {
    this.shell.selectRail(id);
  }

  handleOutsideSidebar(event: Event): void {
    if (this.shell.sidebarCollapsed())
      return;
    if (event instanceof PointerEvent && event.button !== 0)
      return;
    if (event instanceof MouseEvent && event.button !== 0)
      return;
    if (
      this.shell.paletteOpen() ||
      this.shell.settingsOpen() ||
      this.shell.helpOpen() ||
      this.shell.workspaceManagerOpen() ||
      this.confirm.request()
    )
      return;
    const target = event.target;
    if (!(target instanceof Element))
      return;
    if (
      target.closest(
        'tx-sidebar, tx-activity-rail, tx-window-titlebar, tx-overlay, tx-confirm-dialog, tx-workspace-manager, .cdk-overlay-pane, tx-drag-layer, .tx-sidebar__resize',
      )
    )
      return;
    this.shell.hideSidebar();
  }

  sidebarPaneEnter(): string | undefined {
    return this.shell.railSlideDir() ? 'tx-sidebar-pane-in' : undefined;
  }

  sidebarTitle(): string {
    switch (this.shell.activeRail()) {
      case 'services':
        return 'Services';
      case 'database':
        return 'Database';
      case 'environments':
        return 'Environments';
      case 'tools':
        return 'Tools';
      default:
        return 'Collections';
    }
  }

  sidebarBody(): string {
    switch (this.shell.activeRail()) {
      case 'services':
        return 'Service catalogs and mocks will live here in 2.0.';
      case 'database':
        return 'Local SQLite browsers and query tools will land here next.';
      case 'environments':
        return 'Named variable sets will live here in 2.0.';
      default:
        return 'Collections and folders will land here next. Use the command palette to move around.';
    }
  }
}
