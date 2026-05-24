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

import { ConfigService } from '@app/core/config/config.service';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { TxAutofocusDirective } from '@app/shared/directives/tx-autofocus.directive';
import { TxBrandLogoComponent } from '@app/shared/components/tx-brand-logo/tx-brand-logo.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxModalComponent } from '@app/shared/components/tx-modal/tx-modal.component';
import { TxHelpPopupComponent } from '@app/shared/components/tx-help-popup/tx-help-popup.component';
import { TxSidebarComponent } from '@app/shared/components/tx-sidebar/tx-sidebar.component';
import {
  WORKSPACE_SIDEBAR_MAIN_ITEMS,
  workspaceSidebarFooterItems,
} from '@app/features/shell/workspace/workspace-sidebar.constants';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { WorkspaceSidebarSessionService } from '@app/core/workspace/workspace-sidebar-session.service';
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
    TxButtonComponent,
    TxModalComponent,
    TxHelpPopupComponent,
    TxFormFieldComponent,
    TxAutofocusDirective,
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

  private readonly config = inject(ConfigService);
  private readonly uiPreferences = inject(UiPreferencesService);
  private readonly electron = inject(ElectronService);
  private readonly route = inject(ActivatedRoute);
  private readonly sidebarSession = inject(WorkspaceSidebarSessionService);

  protected readonly modalOpen = signal(false);
  protected readonly wikiOpen = signal(false);
  protected readonly toast = signal<WelcomeToast | null>(null);

  protected readonly activeSidebarId = computed(
    () => this.sidebarSession.activeSidebarPanelId() ?? undefined,
  );

  protected readonly sidebarPanelOpen = this.sidebarSession.sidebarPanelOpen;

  protected readonly sidebarMainItems = WORKSPACE_SIDEBAR_MAIN_ITEMS;

  protected readonly sidebarFooterItems = computed(() =>
    workspaceSidebarFooterItems(this.showDevToolkit() ?? false),
  );

  protected readonly longText = signal(
    'This scaffold connects Angular UI with Electron IPC, splash boot sequencing, SVG branding sync, and local-first JSON config envelopes guarded by shared Zod schemas.',
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

  protected readonly runtimeSummary = computed(() => {
    const bridge = window.testrix;
    if (!bridge) {
      return 'Renderer-only dev mode — preload bridge is unavailable (run `npm start` or `npm run dev` for Electron).';
    }
    const { platform, versions } = bridge;
    return `${platform} · renderer app v${versions.app} · electron ${versions.electron} · chromium ${versions.chrome}`;
  });

  protected handleOpenModal(): void {
    this.modalOpen.set(true);
  }

  protected handleCloseModal(): void {
    this.modalOpen.set(false);
  }

  protected handleCloseWiki(): void {
    this.wikiOpen.set(false);
  }

  protected handleSidebarSelect(id: string): void {
    if (id === 'help') {
      this.wikiOpen.set(true);
    }
  }

  protected handleOpenDebug(): void {
    if (!this.showDevToolkit()) {
      this.showToast('Run `npm run dev` to enable the design system debug panel.', 'error');
      return;
    }
    this.sidebarSession.setActiveSidebarPanelId('debug');
    this.sidebarSession.setSidebarPanelOpen(true);
  }

  protected async handleRefreshConfig(): Promise<void> {
    try {
      await this.config.refresh();
      this.showToast('Configuration reloaded from disk.');
    } catch {
      this.showToast('Could not reload configuration.', 'error');
    }
  }

  protected handleCopyRuntime(): void {
    const summary = this.runtimeSummary();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(summary).then(
        () => this.showToast('Runtime summary copied to clipboard.'),
        () => this.showToast(summary, 'success'),
      );
      return;
    }
    this.showToast(summary, 'success');
  }

  private showToast(message: string, tone: WelcomeToastTone = 'success'): void {
    this.toast.set({ message, tone });
    window.setTimeout(() => this.toast.set(null), 4200);
  }
}
