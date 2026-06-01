import { NgComponentOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { CollectionsService } from '@app/core/collections/collections.service';
import { ImportExportFlowService } from '@app/core/import-export/import-export-flow.service';
import { HelpPopupService } from '@app/core/ui/help-popup.service';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { FileDialogService } from '@app/core/platform/file-dialog.service';
import { TxBrandLogoComponent } from '@app/shared/components/tx-brand-logo/tx-brand-logo.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxSidebarComponent } from '@app/shared/components/tx-sidebar/tx-sidebar.component';
import {
  WORKSPACE_SIDEBAR_MAIN_ITEMS,
  workspaceSidebarFooterItems,
} from '@app/features/shell/workspace/workspace-sidebar.constants';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import {
  WorkspaceSidebarSessionService,
  type WorkspaceSidebarPanelId,
} from '@app/core/workspace/workspace-sidebar-session.service';
import { WorkspaceEditorComponent } from '@app/features/shell/workspace/workspace-editor/workspace-editor.component';
import { workspaceSidebarPanelSearch } from '@app/features/shell/workspace/workspace-sidebar-panel-search';
import { TxSpinnerComponent } from '@app/shared/components/tx-spinner/tx-spinner.component';
import {
  isHomeSidebarPanelId,
  loadHomeSidebarPanel,
  peekHomeSidebarPanel,
  type HomeSidebarPanelComponent,
  type HomeSidebarPanelId,
} from './home-sidebar-panel-loader';

type WelcomeToastTone = 'success' | 'error';

interface WelcomeToast {
  readonly message: string;
  readonly tone: WelcomeToastTone;
}

@Component({
  standalone: true,
  selector: 'app-home',
  imports: [
    NgComponentOutlet,
    RouterLink,
    TxBrandLogoComponent,
    TxIconComponent,
    TxSidebarComponent,
    TxSpinnerComponent,
    WorkspaceEditorComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  protected readonly workspaceEditor = inject(WorkspaceEditorService);

  private readonly collections = inject(CollectionsService);
  private readonly importExportFlow = inject(ImportExportFlowService);
  private readonly fileDialog = inject(FileDialogService);
  private readonly helpPopup = inject(HelpPopupService);
  private readonly uiPreferences = inject(UiPreferencesService);
  private readonly electron = inject(ElectronService);
  private readonly route = inject(ActivatedRoute);
  private readonly sidebarSession = inject(WorkspaceSidebarSessionService);

  protected readonly toast = signal<WelcomeToast | null>(null);

  protected readonly activeSidebarId = computed(
    () => this.sidebarSession.activeSidebarPanelId() ?? undefined,
  );

  protected readonly sidebarPanelOpen = this.sidebarSession.sidebarPanelOpen;

  protected readonly sidebarMainItems = WORKSPACE_SIDEBAR_MAIN_ITEMS;

  protected readonly sidebarFooterItems = computed(() =>
    workspaceSidebarFooterItems(this.showDevToolkit() ?? false),
  );

  protected readonly showDevToolkit = computed(
    () => typeof ngDevMode !== 'undefined' && ngDevMode && this.electron.isDevToolkit(),
  );

  protected readonly closeSidebarPanelOnOutsideClick = this.uiPreferences.closeSidebarPanelOnOutsideClick;

  protected readonly panelSearch = workspaceSidebarPanelSearch;

  private readonly sidebarPanelComponents = signal<
    Partial<Record<HomeSidebarPanelId, HomeSidebarPanelComponent>>
  >({});

  constructor() {
    afterNextRender(() => {
      this.sanitizeSidebarSessionForRuntime();
      this.applyDebugPanelFromRoute();
    });

    effect(() => {
      const panelId = this.activeSidebarId();
      const open = this.sidebarPanelOpen();
      if (!open || !isHomeSidebarPanelId(panelId)) {
        return;
      }
      const peeked = peekHomeSidebarPanel(panelId);
      if (peeked) {
        untracked(() =>
          this.sidebarPanelComponents.update((current) =>
            current[panelId] === peeked ? current : { ...current, [panelId]: peeked },
          ),
        );
        return;
      }
      void loadHomeSidebarPanel(panelId).then((cmp) => {
        this.sidebarPanelComponents.update((current) => ({ ...current, [panelId]: cmp }));
      });
    });
  }

  protected isSidebarPanelId(panelId: string | undefined): panelId is HomeSidebarPanelId {
    return isHomeSidebarPanelId(panelId);
  }

  protected sidebarPanelComponent(panelId: HomeSidebarPanelId): HomeSidebarPanelComponent | null {
    return this.sidebarPanelComponents()[panelId] ?? peekHomeSidebarPanel(panelId);
  }

  protected sidebarPanelInputs(panelId: HomeSidebarPanelId): Record<string, unknown> {
    if (panelId === 'debug') {
      return {};
    }
    const search = this.panelSearch(panelId);
    return {
      searchPlaceholder: search.placeholder,
      searchAriaLabel: search.ariaLabel,
    };
  }

  protected handleActiveSidebarIdChange(id: string | undefined): void {
    this.sidebarSession.setActiveSidebarPanelId(id ?? null);
  }

  protected handleSidebarPanelOpenChange(open: boolean): void {
    this.sidebarSession.setSidebarPanelOpen(open);
  }

  private applyDebugPanelFromRoute(): void {
    const panel = this.route.snapshot.queryParamMap.get('panel');
    if (panel !== 'debug' || !this.showDevToolkit()) {
      return;
    }
    this.sidebarSession.setActiveSidebarPanelId('debug');
    this.sidebarSession.setSidebarPanelOpen(true);
  }

  private sanitizeSidebarSessionForRuntime(): void {
    if (this.sidebarSession.activeSidebarPanelId() !== 'debug' || this.showDevToolkit()) {
      return;
    }
    this.sidebarSession.setActiveSidebarPanelId(null);
    this.sidebarSession.setSidebarPanelOpen(false);
  }

  protected readonly appVersion = computed(() => {
    const bridge = window.testrix;
    return bridge?.versions.app ?? '0.1.0';
  });

  protected handleCreateCollection(): void {
    const id = this.collections.createFolder(null, 'New collection');
    this.openSidebarPanel('collections');
    if (id) {
      this.workspaceEditor.openResource({ resourceId: id, kind: 'folder' });
    }
  }

  protected handleNewRequest(): void {
    const id = this.collections.createRequest(null);
    this.openSidebarPanel('collections');
    if (id) {
      this.workspaceEditor.openResource({ resourceId: id, kind: 'request' });
    }
  }

  protected async handleImportWorkspace(): Promise<void> {
    if (!this.electron.hasBridge()) {
      this.showToast('Import is only available in the desktop app.', 'error');
      return;
    }

    try {
      const files = await this.fileDialog.pickFiles([
        'json',
        'yaml',
        'yml',
        'har',
        'ndjson',
        'gelf',
        'jsonl',
      ]);
      if (!files?.length) {
        return;
      }
      this.importExportFlow.openBatchReview(files);
    } catch {
      this.showToast('Import failed.', 'error');
    }
  }

  protected handleOpenEnvironments(): void {
    this.openSidebarPanel('environments');
  }

  protected handleOpenHelpGuide(): void {
    this.helpPopup.show();
  }

  protected handleSidebarSelect(id: string): void {
    if (id === 'help') {
      this.helpPopup.show();
    }
  }

  private openSidebarPanel(panelId: WorkspaceSidebarPanelId): void {
    this.sidebarSession.setActiveSidebarPanelId(panelId);
    this.sidebarSession.setSidebarPanelOpen(true);
  }

  private showToast(message: string, tone: WelcomeToastTone = 'success'): void {
    this.toast.set({ message, tone });
    window.setTimeout(() => this.toast.set(null), 4200);
  }
}
