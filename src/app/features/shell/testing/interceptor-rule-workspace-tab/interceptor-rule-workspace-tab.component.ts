import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  resolveInterceptorTabUi,
  type InterceptorTabSectionId,
  type WorkspaceEditorLayoutId,
} from '@shared/config';
import type { CollectionRequestBody } from '@shared/config';

import { ConfigService } from '@app/core/config/config.service';
import { resolveTabEditorLayout } from '@app/core/config/workspace-tab-editor-layout';
import { InterceptorWorkspaceStore } from '@app/core/testing/interceptor-workspace.store';
import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { interceptorRuleTabSectionBlockCount } from '@app/core/ui/workspace-tab-section-stagger';
import { WorkspaceTabMotionController } from '@app/core/ui/workspace-tab-motion';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { WorkspaceSectionNavSliderDirective } from '../../workspace/workspace-section-nav-slider.directive';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxToggleComponent } from '@app/shared/components/tx-toggle/tx-toggle.component';

import { IntTabActionPanelComponent } from './int-tab-action-panel.component';
import { IntTabMatchPanelComponent } from './int-tab-match-panel.component';
import { IntTabOverviewPanelComponent } from './int-tab-overview-panel.component';

interface IntTabNavItem {
  readonly id: InterceptorTabSectionId;
  readonly label: string;
  readonly icon: string;
}

const NAV_ITEMS: readonly IntTabNavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'info' },
  { id: 'match', label: 'Match', icon: 'filter' },
  { id: 'action', label: 'Action', icon: 'api' },
];

const SESSION_UI_DEBOUNCE_MS = 150;

@Component({
  selector: 'app-interceptor-rule-workspace-tab',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxToggleComponent,
    IntTabOverviewPanelComponent,
    IntTabMatchPanelComponent,
    IntTabActionPanelComponent,
    WorkspaceSectionNavSliderDirective,
  ],
  templateUrl: './interceptor-rule-workspace-tab.component.html',
  styleUrl: './interceptor-rule-workspace-tab.component.scss',
  host: { class: 'testing-workspace-tab-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InterceptorRuleWorkspaceTabComponent {
  private readonly interceptor = inject(InterceptorWorkspaceStore);
  private readonly configService = inject(ConfigService);
  private readonly testingSession = inject(TestingSessionService);
  private readonly uiPreferences = inject(UiPreferencesService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly tabMotion = new WorkspaceTabMotionController(
    this.uiPreferences,
    this.destroyRef,
  );

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  protected readonly navItems = NAV_ITEMS;
  protected readonly activeSection = signal<InterceptorTabSectionId>('overview');

  private sessionUiLoadKey: string | null = null;
  private sessionUiSaveTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly editorLayout = computed((): WorkspaceEditorLayoutId =>
    resolveTabEditorLayout(this.configService.settings(), 'interceptor'),
  );

  protected readonly useSidebarLayout = computed(() => this.editorLayout() === 'sidebar');

  protected readonly useTitlebarLayout = computed(() => this.editorLayout() === 'titlebar');

  protected readonly ruleId = computed(() =>
    this.resourceId().startsWith('int-rule:') ? this.resourceId().slice('int-rule:'.length) : '',
  );

  protected readonly rule = computed(() => {
    const id = this.ruleId();
    return id ? this.interceptor.findRule(id) : null;
  });

  protected readonly missing = computed(() => !!this.ruleId() && !this.rule());

  protected readonly title = computed(() => this.interceptor.labelForResource(this.resourceId()));

  protected readonly interceptorRunning = computed(() => this.interceptor.running());

  constructor() {
    this.tabMotion.settleLoadImmediately();
    this.tabMotion.bindLoadReplay(
      () => `${this.configService.sessionRevision()}:${this.resourceId()}`,
      () => this.loadChromeChildCount(),
      { tabActive: () => this.active() },
    );

    effect(() => {
      if (!this.active()) {
        return;
      }
      const resourceId = this.resourceId();
      const revision = this.configService.sessionRevision();
      const session = untracked(() => this.configService.session());
      if (!session) {
        return;
      }
      const loadKey = `${revision}:${resourceId}`;
      if (this.sessionUiLoadKey === loadKey) {
        return;
      }
      this.sessionUiLoadKey = loadKey;
      const ui = resolveInterceptorTabUi(session.workspace.testing.interceptorTabsById, resourceId);
      this.activeSection.set(ui.activeSection);
    });

    this.destroyRef.onDestroy(() => {
      if (this.sessionUiSaveTimer !== null) {
        clearTimeout(this.sessionUiSaveTimer);
      }
    });
  }

  protected isSectionContentAnimating(sectionId: InterceptorTabSectionId): boolean {
    return this.tabMotion.isSectionContentAnimating(sectionId);
  }

  protected isSectionContentSettled(sectionId: InterceptorTabSectionId): boolean {
    return this.tabMotion.isSectionContentSettled(sectionId);
  }

  protected handleSectionSelect(section: InterceptorTabSectionId): void {
    if (section === this.activeSection()) {
      return;
    }
    this.activeSection.set(section);
    this.tabMotion.onSectionChange(section, {
      contentBlockCount: interceptorRuleTabSectionBlockCount(section),
    });
    this.scheduleTabUiPersist();
  }

  protected handleNameChange(name: string): void {
    const id = this.ruleId();
    if (!id) {
      return;
    }
    this.interceptor.patchRule(id, { name: name.trim() || 'New rule' });
  }

  protected handleMatchUrlChange(matchUrl: string): void {
    const id = this.ruleId();
    if (!id) {
      return;
    }
    this.interceptor.patchRule(id, { matchUrl: matchUrl.trim() || '*' });
  }

  protected handleEnabledChange(enabled: boolean): void {
    const id = this.ruleId();
    if (!id) {
      return;
    }
    this.interceptor.patchRule(id, { enabled });
  }

  protected handleActionChange(action: string): void {
    const id = this.ruleId();
    if (!id) {
      return;
    }
    if (action === 'proxy' || action === 'mock' || action === 'block') {
      this.interceptor.patchRule(id, { action });
    }
  }

  protected handleMockStatusChange(mockStatus: number | undefined): void {
    const id = this.ruleId();
    if (!id) {
      return;
    }
    this.interceptor.patchRule(id, { mockStatus });
  }

  protected handleMockBodyChange(mockBody: CollectionRequestBody): void {
    const id = this.ruleId();
    if (!id) {
      return;
    }
    this.interceptor.patchRule(id, { mockBody });
  }

  private loadChromeChildCount(): number {
    let count = 1;
    if (this.useTitlebarLayout()) {
      count += 1;
    }
    return count;
  }

  private scheduleTabUiPersist(): void {
    if (this.sessionUiSaveTimer !== null) {
      clearTimeout(this.sessionUiSaveTimer);
    }
    this.sessionUiSaveTimer = setTimeout(() => {
      this.sessionUiSaveTimer = null;
      void this.persistTabUi();
    }, SESSION_UI_DEBOUNCE_MS);
  }

  private async persistTabUi(): Promise<void> {
    const resourceId = this.resourceId();
    const session = this.configService.session();
    const existing = resolveInterceptorTabUi(
      session?.workspace.testing.interceptorTabsById,
      resourceId,
    );
    await this.configService.patchSession({
      workspace: {
        testing: {
          ...this.testingSession.navigationFields(),
          interceptorTabsById: {
            [resourceId]: {
              ...existing,
              activeSection: this.activeSection(),
            },
          },
        },
      },
    });
  }
}
