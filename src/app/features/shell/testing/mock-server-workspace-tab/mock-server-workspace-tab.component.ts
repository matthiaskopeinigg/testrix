import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  HTTP_METHOD_IDS,
  coerceMockServerTabSectionId,
  resolveMockServerTabUi,
  type HttpMethodId,
  type MockServerTabSectionId,
  type WorkspaceEditorLayoutId,
} from '@shared/config';
import {
  createDefaultMockRuleMatcher,
  mockServerTabResourceId,
  type MockRuleMatcher,
  type MockServerEndpoint,
} from '@shared/testing';

import { ConfigService } from '@app/core/config/config.service';
import { MockServerService } from '@app/core/testing/mock-server.service';
import { newTestingId } from '@app/core/testing/testing-id';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { mockServerTabSectionBlockCount } from '@app/core/ui/workspace-tab-section-stagger';
import { WorkspaceTabMotionController } from '@app/core/ui/workspace-tab-motion';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { WorkspaceSectionNavSliderDirective } from '@app/features/shell/workspace/workspace-section-nav-slider.directive';
import { syncMockMatcherPriorities } from './mock-server-matcher.utils';
import { MsTabMatchersPanelComponent } from './ms-tab-matchers-panel.component';
import { MsTabOverviewPanelComponent } from './ms-tab-overview-panel.component';
import { MsTabResponsePanelComponent } from './ms-tab-response-panel.component';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';
import { TxToggleComponent } from '@app/shared/components/tx-toggle/tx-toggle.component';

const METHOD_OPTIONS: readonly TxDropdownOption[] = [
  { value: 'ANY', label: 'Any' },
  ...HTTP_METHOD_IDS.map((value) => ({ value, label: value })),
];

const NAV_ITEMS: readonly {
  readonly id: MockServerTabSectionId;
  readonly label: string;
  readonly icon: string;
}[] = [
  { id: 'overview', label: 'Overview', icon: 'info' },
  { id: 'matchers', label: 'Matchers', icon: 'filter' },
  { id: 'response', label: 'Response', icon: 'api' },
  { id: 'advanced', label: 'Advanced', icon: 'settings' },
];

@Component({
  selector: 'app-mock-server-workspace-tab',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxButtonComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxToggleComponent,
    TxIconComponent,
    WorkspaceSectionNavSliderDirective,
    MsTabOverviewPanelComponent,
    MsTabMatchersPanelComponent,
    MsTabResponsePanelComponent,
  ],
  templateUrl: './mock-server-workspace-tab.component.html',
  styleUrl: './mock-server-workspace-tab.component.scss',
  host: { class: 'testing-workspace-tab-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MockServerWorkspaceTabComponent {
  private readonly mockServer = inject(MockServerService);
  private readonly configService = inject(ConfigService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly uiPreferences = inject(UiPreferencesService);

  protected readonly tabMotion = new WorkspaceTabMotionController(
    this.uiPreferences,
    this.destroyRef,
  );

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  protected readonly navItems = NAV_ITEMS;
  protected readonly methodOptions = METHOD_OPTIONS;
  protected readonly activeSection = signal<MockServerTabSectionId>('overview');

  protected readonly editorLayout = computed(
    (): WorkspaceEditorLayoutId =>
      this.configService.settings()?.collections.editorLayout ?? 'sidebar',
  );

  protected readonly useSidebarLayout = computed(() => this.editorLayout() === 'sidebar');

  protected readonly useTitlebarLayout = computed(() => this.editorLayout() === 'titlebar');

  protected readonly isMismatchTab = computed(() =>
    this.resourceId().startsWith('ms-mismatch:'),
  );

  protected readonly endpointId = computed(() => {
    const id = this.resourceId();
    if (id.startsWith('ms:')) {
      return id.slice(3);
    }
    return '';
  });

  protected readonly endpoint = computed(() => {
    const id = this.endpointId();
    return id ? this.mockServer.findEndpoint(id) : null;
  });

  protected readonly mismatch = computed(() => {
    const id = this.resourceId();
    if (!id.startsWith('ms-mismatch:')) {
      return null;
    }
    return this.mockServer.findMismatch(id.slice('ms-mismatch:'.length));
  });

  protected readonly missing = computed(
    () => !this.isMismatchTab() && !!this.endpointId() && !this.endpoint(),
  );

  protected readonly title = computed(() => this.mockServer.labelForResource(this.resourceId()));

  protected readonly toolbarMethodValue = computed(() => {
    const matcher = this.routeMatcher();
    if (!matcher || matcher.methods.length === 0) {
      return 'ANY';
    }
    return matcher.methods[0]!;
  });

  protected readonly toolbarPathValue = computed(() => this.routeMatcher()?.path.value ?? '/');

  /** Human-readable route hint from the toolbar route matcher (overview). */
  protected readonly routeSummary = computed(() => {
    const matcher = this.routeMatcher();
    if (!matcher) {
      return null;
    }
    const methods = matcher.methods.length > 0 ? matcher.methods.join(', ') : 'ANY';
    return `${methods} ${matcher.path.value}`;
  });

  protected readonly routeMethod = computed(() => {
    const summary = this.routeSummary();
    if (!summary) {
      return 'ANY';
    }
    const space = summary.indexOf(' ');
    return space > 0 ? summary.slice(0, space) : 'ANY';
  });

  protected readonly routePath = computed(() => {
    const summary = this.routeSummary();
    if (!summary) {
      return '/';
    }
    const space = summary.indexOf(' ');
    return space > 0 ? summary.slice(space + 1) : summary;
  });

  constructor() {
    effect(() => {
      const section = resolveMockServerTabUi(
        this.configService.session()?.workspace.testing.mockServerTabsById,
        this.resourceId(),
      ).activeSection;
      this.activeSection.set(coerceMockServerTabSectionId(section));
    });

    this.tabMotion.settleLoadImmediately();
    this.tabMotion.bindLoadReplay(
      () => `${this.configService.sessionRevision()}:${this.resourceId()}`,
      () => this.loadChromeChildCount(),
      { tabActive: () => this.active() },
    );
  }

  protected isSectionContentAnimating(sectionId: MockServerTabSectionId): boolean {
    return this.tabMotion.isSectionContentAnimating(sectionId);
  }

  protected isSectionContentSettled(sectionId: MockServerTabSectionId): boolean {
    return this.tabMotion.isSectionContentSettled(sectionId);
  }

  private loadChromeChildCount(): number {
    return this.useTitlebarLayout() ? 2 : 1;
  }

  /** Route + method are always stored on the first matcher (toolbar). */
  private routeMatcher(): MockRuleMatcher | null {
    return this.endpoint()?.matchers[0] ?? null;
  }

  protected handleSectionSelect(id: MockServerTabSectionId): void {
    if (id === this.activeSection()) {
      return;
    }
    this.activeSection.set(id);
    this.tabMotion.onSectionChange(id, {
      contentBlockCount: mockServerTabSectionBlockCount(id),
    });
    void this.configService.patchSession({
      workspace: {
        testing: {
          mockServerTabsById: {
            [this.resourceId()]: { activeSection: id },
          },
        },
      },
    });
  }

  protected handleToolbarMethodChange(value: string): void {
    const index = this.ensureRouteMatcherIndex();
    if (index < 0) {
      return;
    }
    const methods =
      value === 'ANY' || !HTTP_METHOD_IDS.includes(value as HttpMethodId)
        ? []
        : [value as HttpMethodId];
    this.handleMatcherPatch(index, { methods });
  }

  protected handleToolbarPathChange(value: string): void {
    const index = this.ensureRouteMatcherIndex();
    if (index < 0) {
      return;
    }
    this.handleMatcherPathChange(index, value);
  }

  protected handleMatchersChange(matchers: readonly MockRuleMatcher[]): void {
    this.patchEndpoint({ matchers: syncMockMatcherPriorities(matchers) });
  }

  protected handleDescriptionChange(description: string): void {
    this.patchEndpoint({ description });
  }

  protected handleEnabledChange(enabled: boolean): void {
    this.patchEndpoint({ enabled });
  }

  protected handlePriorityChange(value: string | number): void {
    const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    if (Number.isFinite(n)) {
      this.patchEndpoint({ priority: n });
    }
  }

  protected handleTagsChange(tags: readonly string[]): void {
    this.patchEndpoint({ tags: [...tags] });
  }

  protected handleResponseChange(response: MockServerEndpoint['response']): void {
    this.patchEndpoint({ response });
  }

  protected handleMatcherPatch(index: number, patch: Partial<MockRuleMatcher>): void {
    const e = this.endpoint();
    if (!e) {
      return;
    }
    const matchers = e.matchers.map((m, i) => (i === index ? { ...m, ...patch } : m));
    this.patchEndpoint({ matchers });
  }

  protected handleMatcherPathChange(index: number, value: string): void {
    const e = this.endpoint();
    if (!e) {
      return;
    }
    const matchers = e.matchers.map((m, i) =>
      i === index ? { ...m, path: { ...m.path, value } } : m,
    );
    this.patchEndpoint({ matchers });
  }

  protected handleAddMatcher(): void {
    const e = this.endpoint();
    if (!e) {
      return;
    }
    const matcher = createDefaultMockRuleMatcher(newTestingId());
    this.patchEndpoint({
      matchers: syncMockMatcherPriorities([...e.matchers, matcher]),
    });
  }

  private ensureRouteMatcherIndex(): number {
    const e = this.endpoint();
    if (!e) {
      return -1;
    }
    if (e.matchers.length > 0) {
      return 0;
    }
    const matcher = createDefaultMockRuleMatcher(newTestingId());
    this.patchEndpoint({ matchers: syncMockMatcherPriorities([matcher]) });
    return 0;
  }

  protected handleCreateEndpointFromMismatch(): void {
    const m = this.mismatch();
    if (!m) {
      return;
    }
    const endpoint = this.mockServer.addEndpointFromMismatch(m);
    this.workspaceEditor.openResource({
      resourceId: mockServerTabResourceId(endpoint.id),
      kind: 'mock-server',
    });
  }

  protected async handleClearMismatch(): Promise<void> {
    await this.mockServer.clearMismatches();
    this.workspaceEditor.closeTabsForResourceIds([this.resourceId()]);
  }

  private patchEndpoint(patch: Parameters<MockServerService['patchEndpoint']>[1]): void {
    const id = this.endpointId();
    if (id) {
      this.mockServer.patchEndpoint(id, patch);
    }
  }
}
