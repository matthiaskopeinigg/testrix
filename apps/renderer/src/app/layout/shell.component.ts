import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { assessDropImportability, isImportableDropName } from '@testrix/contracts';
import {
  TxActivityRailComponent,
  TxConfirmDialogComponent,
  TxPromptDialogComponent,
  TxDndService,
  TxDragLayerComponent,
  TxHintLayerComponent,
  TxToastLayerComponent,
  TxToastService,
  TxSidebarComponent,
  TxWindowTitlebarComponent,
  ensureWindowChrome,
  resetOverlayWindowDrag,
  type TxRailItemId,
} from '@testrix/ui';

import { CommandHotkeysDirective } from '../core/command-hotkeys.directive';
import { ConfirmDialogService } from '../core/confirm-dialog.service';
import { DesktopApiService } from '../core/desktop-api.service';
import { PromptDialogService } from '../core/prompt-dialog.service';
import { SessionPersistenceService } from '../core/session-persistence.service';
import { COLLAB_DOCK_MAX_WIDTH, COLLAB_DOCK_MIN_WIDTH, ShellStateService } from '../core/shell-state.service';
import { CookieAuthDialogComponent } from '../features/cookie-auth/cookie-auth-dialog.component';
import { CookieAuthDialogService } from '../features/cookie-auth/cookie-auth-dialog.service';
import { ExportWorkspaceDialogComponent } from '../features/workspace-transfer/export-workspace-dialog.component';
import { ExportWorkspaceDialogService } from '../features/workspace-transfer/export-workspace-dialog.service';
import { ImportWorkspaceDialogComponent } from '../features/workspace-transfer/import-workspace-dialog.component';
import { ImportWorkspaceDialogService } from '../features/workspace-transfer/import-workspace-dialog.service';
import { ServicesStore } from '../features/services/services.store';
import { CollabAttentionComponent } from '../features/collab/collab-attention.component';
import { CollabConnectDialogComponent } from '../features/collab/collab-connect-dialog.component';
import { CollabPanelComponent } from '../features/collab/collab-panel.component';
import { CollabStore } from '../features/collab/collab.store';
import { CollectionsSidebarComponent } from '../features/collections/collections-sidebar.component';
import { DatabaseSidebarComponent } from '../features/database/database-sidebar.component';
import { EnvironmentsSidebarComponent } from '../features/environments/environments-sidebar.component';
import { HistorySidebarComponent } from '../features/history/history-sidebar.component';
import { ServicesSidebarComponent } from '../features/services/services-sidebar.component';
import { ToolsSidebarComponent } from '../features/tools/tools-sidebar.component';
import { CommandPaletteComponent } from '../features/command-palette/command-palette.component';
import { CollectionHealthDialogComponent } from '../features/collections/collection-health-dialog.component';
import { UpdateStore } from '../features/updates/update.store';
import { WhatsNewDialogComponent } from '../features/updates/whats-new-dialog.component';
import { CollectionHealthDialogService } from '../features/collections/collection-health-dialog.service';
import { HelpContextService } from '../features/help/help-context.service';
import { HelpOverlayComponent } from '../features/help/help-overlay.component';
import { SettingsOverlayComponent } from '../features/settings/settings-overlay.component';
import { WorkbenchComponent } from '../features/workbench/workbench.component';
import { WorkbenchStore } from '../features/workbench/workbench.store';
import { WorkspaceManagerComponent } from '../features/workspaces/workspace-manager.component';
import { EnvironmentSwitcherComponent } from './environment-switcher.component';
import { DirtyStatusStripComponent } from './dirty-status-strip.component';
import { WorkspaceSwitcherComponent } from './workspace-switcher.component';

@Component({
  selector: 'tx-shell',
  standalone: true,
  imports: [
    TxWindowTitlebarComponent,
    TxActivityRailComponent,
    TxDragLayerComponent,
    TxHintLayerComponent,
    TxToastLayerComponent,
    TxSidebarComponent,
    CollabAttentionComponent,
    CollabConnectDialogComponent,
    CollabPanelComponent,
    CollectionsSidebarComponent,
    DatabaseSidebarComponent,
    EnvironmentsSidebarComponent,
    HistorySidebarComponent,
    ServicesSidebarComponent,
    ToolsSidebarComponent,
    WorkbenchComponent,
    EnvironmentSwitcherComponent,
    DirtyStatusStripComponent,
    WorkspaceSwitcherComponent,
    CommandPaletteComponent,
    CollectionHealthDialogComponent,
    WhatsNewDialogComponent,
    SettingsOverlayComponent,
    HelpOverlayComponent,
    WorkspaceManagerComponent,
    TxConfirmDialogComponent,
    TxPromptDialogComponent,
    CookieAuthDialogComponent,
    ExportWorkspaceDialogComponent,
    ImportWorkspaceDialogComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [CommandHotkeysDirective],
})
export class ShellComponent {
  readonly desktop = inject(DesktopApiService);
  readonly shell = inject(ShellStateService);
  readonly collabDockMinWidth = COLLAB_DOCK_MIN_WIDTH;
  readonly collabDockMaxWidth = COLLAB_DOCK_MAX_WIDTH;
  private readonly helpContext = inject(HelpContextService);
  readonly confirm = inject(ConfirmDialogService);
  readonly prompt = inject(PromptDialogService);
  readonly collectionHealth = inject(CollectionHealthDialogService);
  readonly cookieAuth = inject(CookieAuthDialogService);
  readonly exportWorkspace = inject(ExportWorkspaceDialogService);
  readonly importWorkspace = inject(ImportWorkspaceDialogService);
  private readonly toasts = inject(TxToastService);
  readonly isDropHover = signal(false);
  /** null = unknown yet; true/false from name + MIME during drag. */
  readonly dropImportValid = signal<boolean | null>(null);
  readonly dropImportLabel = signal<string | null>(null);
  private readonly services = inject(ServicesStore);
  private dropDragDepth = 0;
  private readonly dnd = inject(TxDndService);
  private readonly session = inject(SessionPersistenceService);
  private readonly workbench = inject(WorkbenchStore);
  private readonly destroyRef = inject(DestroyRef);
  readonly collab = inject(CollabStore);
  private readonly updates = inject(UpdateStore);
  readonly updateNotice = computed(() => this.updates.noticeLabel());

  constructor() {
    effect(() => {
      if (this.shell.sidebarCollapsed()) {
        this.dnd.abort();
      }
    });
    effect(() => {
      const tab = this.workbench.activeTab();
      if (!tab) {
        this.shell.setSoftRailHighlight(null);
        return;
      }
      if (tab.kind === 'history') {
        this.shell.setSoftRailHighlight('history');
        return;
      }
      if (tab.kind === 'environment') {
        this.shell.setSoftRailHighlight('environments');
        return;
      }
      this.shell.setSoftRailHighlight(null);
    });
    const onPointerDown = (event: PointerEvent | MouseEvent) => {
      this.handleOutsideSidebar(event);
    };
    const clearDropHover = () => this.clearDropHover();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        this.clearDropHover();
    };
    // Electron only fires drop if dragover calls preventDefault on the path.
    const allowWindowFileDrop = (event: DragEvent) => {
      if (!this.dragHasFiles(event))
        return;
      event.preventDefault();
      if (event.dataTransfer)
        event.dataTransfer.dropEffect = 'copy';
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('mousedown', onPointerDown, true);
    window.addEventListener('dragover', allowWindowFileDrop);
    window.addEventListener('dragend', clearDropHover);
    window.addEventListener('drop', clearDropHover);
    window.addEventListener('keydown', onKeyDown, true);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('mousedown', onPointerDown, true);
      window.removeEventListener('dragover', allowWindowFileDrop);
      window.removeEventListener('dragend', clearDropHover);
      window.removeEventListener('drop', clearDropHover);
      window.removeEventListener('keydown', onKeyDown, true);
    });

    const stopManual = this.desktop.api.services.onFlowManualPrompt((request) => {
      void this.handleManualPrompt(request);
    });
    this.destroyRef.onDestroy(stopManual);

    afterNextRender(() => {
      void this.bootstrap();
    });
  }

  private async handleManualPrompt(request: {
    readonly requestId: string;
    readonly title: string;
    readonly prompt: string;
    readonly variable: string;
    readonly placeholder?: string;
  }): Promise<void> {
    const value = await this.prompt.ask({
      title: request.title,
      body: request.prompt,
      inputLabel: request.variable.trim() || 'Value',
      placeholder: request.placeholder ?? '',
      confirmLabel: 'Continue',
      cancelLabel: 'Cancel',
    });
    await this.desktop.api.services.flows.replyManualPrompt({
      requestId: request.requestId,
      ok: value != null && value.trim().length > 0,
      value: value?.trim() ?? '',
    });
  }

  async bootstrap(): Promise<void> {
    await this.desktop.hydrate();
    const failed = this.desktop.hydrateFailures();
    if (failed.length > 0)
      this.toasts.show({
        message: `Could not load ${failed.join(', ')}. Showing defaults until the next restart.`,
        durationMs: 12_000,
      });
    this.session.applyHydratedState();
    this.desktop.notifyReady();
  }

  handleRail(id: TxRailItemId): void {
    this.shell.selectRail(id);
  }

  handleOutsideSidebar(event: Event): void {
    if (event instanceof PointerEvent && event.button !== 0)
      return;
    if (event instanceof MouseEvent && event.button !== 0)
      return;
    if (
      this.shell.paletteOpen() ||
      this.shell.settingsOpen() ||
      this.shell.helpOpen() ||
      this.shell.workspaceManagerOpen() ||
      this.confirm.request() ||
      this.prompt.request()
    )
      return;
    const target = event.target;
    if (!(target instanceof Element))
      return;
    if (
      target.closest(
        'tx-overlay, tx-confirm-dialog, tx-prompt-dialog, tx-cookie-auth-dialog, tx-export-workspace-dialog, tx-import-workspace-dialog, tx-workspace-manager, .cdk-overlay-pane, tx-drag-layer',
      )
    )
      return;

    if (
      this.shell.collabDockOpen() &&
      !target.closest('.tx-shell__collab-dock, .tx-titlebar__collab, tx-collab-attention')
    )
      this.shell.collabDockOpen.set(false);

    if (this.shell.sidebarCollapsed())
      return;
    if (
      target.closest(
        'tx-sidebar, tx-activity-rail, tx-window-titlebar, .tx-sidebar__resize',
      )
    )
      return;
    this.shell.hideSidebar();
  }

  sidebarPaneEnter(): string | undefined {
    return this.shell.railSlideDir() ? 'tx-sidebar-pane-in' : undefined;
  }

  handleWindowMinimize(): void {
    ensureWindowChrome();
    void this.desktop.api.window.minimize();
  }

  handleWindowMaximize(): void {
    ensureWindowChrome();
    void this.desktop.api.window.maximize();
  }

  handleWindowClose(): void {
    this.clearDropHover();
    this.shell.closeOverlays();
    this.exportWorkspace.hide();
    this.importWorkspace.hide();
    this.cookieAuth.hide();
    resetOverlayWindowDrag();
    void this.desktop.api.window.setMovable(true);
    void this.desktop.api.window.close();
  }

  sidebarTitle(): string {
    switch (this.shell.activeRail()) {
      case 'services':
        return this.services.title();
      case 'database':
        return 'Database';
      case 'environments':
        return 'Environments';
      case 'history':
        return 'History';
      case 'tools':
        return 'Tools';
      default:
        return 'Collections';
    }
  }

  handleDragEnter(event: DragEvent): void {
    if (!this.dragHasFiles(event))
      return;
    event.preventDefault();
    this.dropDragDepth += 1;
    this.isDropHover.set(true);
    this.updateDropValidity(event);
  }

  handleDragOver(event: DragEvent): void {
    if (!this.dragHasFiles(event))
      return;
    event.preventDefault();
    this.updateDropValidity(event);
    // Always allow drop so we can open the import dialog (or an error state).
    // dropEffect 'none' would cancel the drop event entirely.
    if (event.dataTransfer)
      event.dataTransfer.dropEffect = 'copy';
  }

  handleDragLeave(event: DragEvent): void {
    if (!this.dragHasFiles(event))
      return;
    this.dropDragDepth -= 1;
    if (this.dropDragDepth <= 0)
      this.clearDropHover();
  }

  handleDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    // Capture File before the drop event ends — dataTransfer can clear afterward.
    const file = event.dataTransfer?.files?.[0] ?? null;
    this.clearDropHover();
    if (!file)
      return;
    void this.importDroppedFile(file);
  }

  private clearDropHover(): void {
    this.dropDragDepth = 0;
    this.isDropHover.set(false);
    this.dropImportValid.set(null);
    this.dropImportLabel.set(null);
  }

  private updateDropValidity(event: DragEvent): void {
    const snapshot = readDragSnapshot(event);
    const assessed = assessDropImportability(snapshot);
    this.dropImportValid.set(assessed.valid);
    this.dropImportLabel.set(assessed.label);
  }

  private dragHasFiles(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;
    if (!types)
      return false;
    return [...types].includes('Files');
  }

  private async importDroppedFile(file: File): Promise<void> {
    const assessed = assessDropImportability({
      names: [file.name],
      mimes: file.type ? [file.type] : [],
    });
    if (assessed.valid === false || !isImportableDropName(file.name))
      return;

    try {
      const inspected = await this.inspectDroppedFile(file);
      if (inspected.format === 'unsupported') {
        this.importWorkspace.show(inspected);
        return;
      }
      this.importWorkspace.show(inspected);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not read the dropped file.';
      this.importWorkspace.show({
        format: 'unsupported',
        path: file.name,
        warnings: [message],
      });
    }
  }

  private async inspectDroppedFile(file: File) {
    const path = this.desktop.api.workspace.pathForFile(file)?.trim() || null;
    if (path) {
      try {
        const inspected = await this.desktop.api.workspace.importInspect(path);
        if (inspected.format !== 'unsupported')
          return inspected;
      } catch {
        // Fall through to in-memory bytes (path may be stale / OneDrive placeholder).
      }
    }
    return this.inspectDroppedFileBytes(file);
  }

  private async inspectDroppedFileBytes(file: File) {
    // Folders often have size 0 and no readable bytes without a filesystem path.
    if (file.size === 0 && !file.type) {
      return {
        format: 'unsupported' as const,
        path: file.name,
        warnings: [
          'Could not read this drop (folder path unavailable). Use Settings → Data → Import… and pick the folder.',
        ],
      };
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) {
      return {
        format: 'unsupported' as const,
        path: file.name,
        warnings: ['Dropped file was empty or could not be read.'],
      };
    }
    return this.desktop.api.workspace.importInspectBytes(file.name, bytes);
  }

  handleOpenHelp(): void {
    if (this.shell.helpOpen()) {
      this.shell.closeOverlays();
      return;
    }
    this.helpContext.openContextualHelp();
  }

  sidebarBody(): string {
    switch (this.shell.activeRail()) {
      case 'services':
        return 'Regression, Flows, Emulator, and Load.';
      case 'database':
        return 'Local SQLite browsers and query tools will land here next.';
      case 'environments':
        return 'Named variable sets will live here in 2.0.';
      case 'history':
        return 'Sent requests are listed here.';
      default:
        return 'Collections and folders will land here next. Use the command palette to move around.';
    }
  }
}

function readDragSnapshot(event: DragEvent): { names: string[]; mimes: string[] } {
  const transfer = event.dataTransfer;
  if (!transfer)
    return { names: [], mimes: [] };

  const names: string[] = [];
  const mimes: string[] = [];

  if (transfer.files?.length) {
    for (const file of transfer.files) {
      names.push(file.name);
      if (file.type)
        mimes.push(file.type);
    }
    return { names, mimes };
  }

  if (transfer.items?.length) {
    for (const item of transfer.items) {
      if (item.kind !== 'file')
        continue;
      if (item.type)
        mimes.push(item.type);
      const entry = (
        item as DataTransferItem & {
          webkitGetAsEntry?: () => FileSystemEntry | null;
        }
      ).webkitGetAsEntry?.();
      if (entry?.name) {
        names.push(entry.name);
        continue;
      }
      const file = item.getAsFile();
      if (file?.name)
        names.push(file.name);
      if (file?.type)
        mimes.push(file.type);
    }
  }

  return { names, mimes };
}
