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

import { resolveTestSuiteTabUi, type WorkspaceEditorLayoutId } from '@shared/config';
import {
  buildInitialFlowRunStatuses,
  findFirstFailedFlowStepId,
  flattenEnabledFlowSteps,
  getFlowRunBlockingReason,
  normalizeFlowStepNodes,
} from '@shared/testing';
import type { TestSuiteFlowNode, TestSuiteFlowStep, TestSuiteStepStatus, TestSuiteStepType } from '@shared/testing';
import { parseTestSuiteTabResourceId } from '@shared/testing';

import { ConfigService } from '@app/core/config/config.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import { WorkspaceTabMotionController } from '@app/core/ui/workspace-tab-motion';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxConfirmDialogComponent } from '@app/shared/components/tx-confirm-dialog/tx-confirm-dialog.component';
import { TxContextMenuComponent } from '@app/shared/components/tx-context-menu/tx-context-menu.component';
import type { TxContextMenuItem } from '@app/shared/components/tx-context-menu/tx-context-menu.types';
import { TxDropdownComponent } from '@app/shared/components/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxHorizontalSplitPaneComponent } from '@app/shared/components/tx-horizontal-split-pane/tx-horizontal-split-pane.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxTagsInputComponent } from '@app/shared/components/tx-tags-input/tx-tags-input.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';
import { TxToggleComponent } from '@app/shared/components/tx-toggle/tx-toggle.component';
import { TxVerticalSplitPaneComponent } from '@app/shared/components/tx-vertical-split-pane/tx-vertical-split-pane.component';
import type { TxTreeRowContextMenuEvent } from '@app/shared/components/tx-tree/tx-tree.types';

import { TestingWorkspaceTabShellComponent } from '../testing-workspace-tab-shell/testing-workspace-tab-shell.component';
import { buildFlowRunProgress, buildFlowRunSummary } from './flow-run-summary';
import { flowHasE2eSteps } from './flow-has-e2e-steps';
import { findFlowNodeById } from './flow-step-run-order';
import {
  buildEmptyFlowStepContextMenu,
  buildFlowStepContextMenu,
} from './test-suite-flow-context-menu';
import {
  fromFlowStepTreeNodesWithExisting,
  toFlowStepTreeNodes,
  type FlowStepTreeNode,
} from './test-suite-flow-tree.adapter';
import {
  findFlowStepTreeNode,
} from './test-suite-flow-tree.mutations';
import { TsAddFlowStepModalComponent } from './ts-add-flow-step-modal.component';
import { TsFlowRunPanelComponent } from './ts-flow-run-panel/ts-flow-run-panel.component';
import { TsFlowSettingsPanelComponent } from './ts-flow-settings-panel.component';
import { TsFlowStepEditorComponent } from './ts-flow-step-editor.component';
import { TsFlowStepTreeComponent } from './ts-flow-step-tree.component';
import {
  TestSuiteFolderTabComponent,
  folderCardResourceId,
  type TestSuiteFolderCard,
} from './test-suite-folder-tab.component';

const SESSION_UI_DEBOUNCE_MS = 150;
const PANEL_SIZE_SAVE_DEBOUNCE_MS = 300;
const DEFAULT_STEPS_PANEL_WIDTH_PX = 288;
const DEFAULT_RESULTS_PANEL_HEIGHT_PX = 280;

@Component({
  selector: 'app-test-suite-workspace-tab',
  standalone: true,
  imports: [
    FormsModule,
    TestingWorkspaceTabShellComponent,
    TxBannerComponent,
    TxButtonComponent,
    TxConfirmDialogComponent,
    TxContextMenuComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxHorizontalSplitPaneComponent,
    TxIconComponent,
    TxInputComponent,
    TxTagsInputComponent,
    TxTagComponent,
    TxTextareaComponent,
    TxVerticalSplitPaneComponent,
    TestSuiteFolderTabComponent,
    TsFlowStepTreeComponent,
    TsFlowStepEditorComponent,
    TsFlowSettingsPanelComponent,
    TsFlowRunPanelComponent,
    TsAddFlowStepModalComponent,
  ],
  templateUrl: './test-suite-workspace-tab.component.html',
  styleUrl: './test-suite-workspace-tab.component.scss',
  host: { class: 'testing-workspace-tab-host' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestSuiteWorkspaceTabComponent {
  private readonly testSuite = inject(TestSuiteService);
  private readonly electron = inject(ElectronService);
  private readonly configService = inject(ConfigService);
  private readonly testingSession = inject(TestingSessionService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
  private readonly notifier = inject(ErrorNotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly uiPreferences = inject(UiPreferencesService);

  protected readonly tabMotion = new WorkspaceTabMotionController(
    this.uiPreferences,
    this.destroyRef,
  );

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  protected readonly stepFailureDismissed = signal(false);

  protected readonly selectedStepId = signal<string | null>(null);
  protected readonly addStepModalOpen = signal(false);
  protected readonly running = signal(false);
  protected readonly liveStepStatuses = signal<Record<string, TestSuiteStepStatus>>({});
  protected readonly liveStepErrors = signal<Record<string, string>>({});
  protected readonly lastRunMessage = signal<string | null>(null);
  protected readonly stepsPanelWidth = signal(DEFAULT_STEPS_PANEL_WIDTH_PX);
  protected readonly resultsPanelHeight = signal(DEFAULT_RESULTS_PANEL_HEIGHT_PX);
  protected readonly resultsPanelHidden = signal(false);

  protected readonly contextMenuOpen = signal(false);
  protected readonly contextMenuPosition = signal({ x: 0, y: 0 });
  protected readonly contextMenuItems = signal<readonly TxContextMenuItem[]>([]);
  protected readonly contextNodeId = signal<string | null>(null);

  protected readonly deleteOpen = signal(false);
  protected readonly deleteNodeId = signal<string | null>(null);
  protected readonly deleteMessage = signal('');

  private sessionUiTimer: ReturnType<typeof setTimeout> | null = null;
  private panelSizeSaveTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly parsed = computed(() => parseTestSuiteTabResourceId(this.resourceId()));

  protected readonly editorLayout = computed(
    (): WorkspaceEditorLayoutId =>
      this.configService.settings()?.collections.editorLayout ?? 'sidebar',
  );

  protected readonly useSidebarLayout = computed(() => this.editorLayout() === 'sidebar');

  protected readonly useTitlebarLayout = computed(() => this.editorLayout() === 'titlebar');

  protected readonly flow = computed(() => {
    const p = this.parsed();
    return p?.kind === 'flow' ? this.testSuite.findFlow(p.id) : null;
  });

  protected readonly folder = computed(() => {
    const p = this.parsed();
    return p?.kind === 'folder' ? this.testSuite.findFolder(p.id) : null;
  });

  protected readonly title = computed(() => this.testSuite.labelForResource(this.resourceId()));

  protected readonly description = computed(() => {
    const p = this.parsed();
    if (p?.kind === 'folder') {
      return this.folder()?.description || 'Open a child folder or flow below.';
    }
    return this.flow()?.description || 'Build and run HTTP and browser test flows.';
  });

  protected readonly flowMissing = computed(() => {
    const parsed = this.parsed();
    return parsed?.kind === 'flow' && !this.flow();
  });

  protected readonly suiteItems = computed(() => this.testSuite.flows());

  protected readonly showResultsPanel = computed(() => {
    const flow = this.flow();
    if (!flow) {
      return false;
    }
    return (
      this.running() ||
      Boolean(flow.lastRunAt) ||
      Object.keys(this.liveStepStatuses()).length > 0
    );
  });

  protected readonly runBlockReason = computed(() => getFlowRunBlockingReason(this.flow()));

  protected readonly canRun = computed(() => !this.runBlockReason() && !this.running());

  protected readonly runLabel = computed(() => {
    if (!this.flow()) {
      return '';
    }
    return this.running() ? 'Cancel run' : 'Run flow';
  });

  protected readonly runButtonVariant = computed((): 'primary' | 'secondary' =>
    this.running() ? 'secondary' : 'primary',
  );

  protected readonly runSummary = computed(() => {
    const flow = this.flow();
    return flow ? buildFlowRunSummary(flow) : null;
  });

  protected readonly runProgress = computed(() => {
    const flow = this.flow();
    if (!flow || !this.running()) {
      return null;
    }
    return buildFlowRunProgress(flow.nodes, this.liveStepStatuses());
  });

  protected readonly flowStatusVariant = computed(() => {
    const flow = this.flow();
    if (!flow?.lastRunAt) {
      return 'default' as const;
    }
    const summary = this.runSummary();
    return summary?.statusVariant ?? 'default';
  });

  protected readonly flowStatusLabel = computed(() => {
    const summary = this.runSummary();
    return summary?.statusLabel ?? 'Not run';
  });

  protected readonly flowHasE2eSteps = computed(() => flowHasE2eSteps(this.flow()?.nodes));

  protected readonly environmentOptions = computed((): readonly TxDropdownOption[] => {
    const options: TxDropdownOption[] = [{ value: '', label: 'No environment' }];
    for (const environment of this.environmentsService.environments()) {
      options.push({ value: environment.id, label: environment.name });
    }
    return options;
  });

  protected readonly selectedStep = computed(() => {
    const flow = this.flow();
    const stepId = this.selectedStepId();
    if (!flow || !stepId) {
      return null;
    }
    return this.testSuite.findFlowStep(flow.id, stepId);
  });

  protected readonly selectedStepLiveError = computed(() => {
    const stepId = this.selectedStepId();
    if (!stepId) {
      return null;
    }
    return this.liveStepErrors()[stepId] ?? null;
  });

  protected readonly folderChildren = computed(() => this.folder()?.children ?? []);

  constructor() {
    this.tabMotion.startLoadAfterRender(
      () => this.loadEntranceChildCount(),
      () => !this.active(),
    );
    this.tabMotion.bindLoadReplay(
      () => `${this.configService.sessionRevision()}:${this.resourceId()}`,
      () => this.loadEntranceChildCount(),
      { tabActive: () => this.active() },
    );

    effect(() => {
      if (!this.active()) {
        return;
      }
      const resourceId = this.resourceId();
      void this.configService.sessionRevision();
      untracked(() => {
        const session = this.configService.session();
        if (!session) {
          return;
        }
        const ui = resolveTestSuiteTabUi(session.workspace.testing.testSuiteTabsById, resourceId);
        this.selectedStepId.set(ui.selectedStepId);
        this.addStepModalOpen.set(ui.addStepModalOpen);
        this.stepsPanelWidth.set(ui.stepsPanelWidthPx ?? DEFAULT_STEPS_PANEL_WIDTH_PX);
        if (ui.resultsPanelHeightPx) {
          this.resultsPanelHeight.set(ui.resultsPanelHeightPx);
        }
        this.resultsPanelHidden.set(ui.isResultsPanelHidden);
      });
    });

    effect(() => {
      if (!this.active() || this.parsed()?.kind !== 'flow') {
        return;
      }
      const flow = this.flow();
      if (!flow) {
        return;
      }
      untracked(() => {
        const current = this.selectedStepId();
        if (current && findFlowNodeById(flow.nodes, current)) {
          return;
        }
        const saved = this.configService.session()
          ? resolveTestSuiteTabUi(
              this.configService.session()!.workspace.testing.testSuiteTabsById,
              this.resourceId(),
            ).selectedStepId
          : null;
        if (saved && findFlowNodeById(flow.nodes, saved)) {
          this.selectedStepId.set(saved);
          return;
        }
        const first = flattenEnabledFlowSteps(flow.nodes)[0];
        if (first) {
          this.selectedStepId.set(first.id);
          void this.persistTabUi({ selectedStepId: first.id });
        }
      });
    });

    this.destroyRef.onDestroy(() => {
      if (this.sessionUiTimer !== null) {
        clearTimeout(this.sessionUiTimer);
      }
      if (this.panelSizeSaveTimer !== null) {
        clearTimeout(this.panelSizeSaveTimer);
      }
    });
  }

  protected handleFlowNameChange(name: string): void {
    const flow = this.flow();
    if (!flow) {
      return;
    }
    this.testSuite.patchFlow(flow.id, { name: name.trim() || flow.name });
  }

  protected handleFlowEnvironmentChange(value: string): void {
    const flow = this.flow();
    if (!flow) {
      return;
    }
    this.testSuite.patchFlow(flow.id, { environmentId: value || null });
  }

  protected handleFlowCriticalChange(critical: boolean): void {
    const flow = this.flow();
    if (!flow) {
      return;
    }
    this.testSuite.patchFlow(flow.id, { isCritical: critical });
  }

  protected handleFlowTagsChange(tags: readonly string[]): void {
    const flow = this.flow();
    if (!flow) {
      return;
    }
    this.testSuite.patchFlow(flow.id, { tags: [...tags] });
  }

  protected handleFlowE2eShowWindowChange(show: boolean): void {
    const flow = this.flow();
    if (!flow) {
      return;
    }
    this.testSuite.patchFlow(flow.id, { e2eShowWindow: show });
  }

  protected handleFlowE2eKeepWindowOpenChange(keepOpen: boolean): void {
    const flow = this.flow();
    if (!flow) {
      return;
    }
    this.testSuite.patchFlow(flow.id, { e2eKeepWindowOpen: keepOpen });
  }

  protected handleFlowDescriptionChange(description: string): void {
    const flow = this.flow();
    if (!flow) {
      return;
    }
    this.testSuite.patchFlow(flow.id, { description });
  }

  protected handleFolderDescriptionChange(description: string): void {
    const folder = this.folder();
    if (!folder) {
      return;
    }
    this.testSuite.patchFolder(folder.id, { description });
  }

  protected handleFolderTagsChange(tags: readonly string[]): void {
    const folder = this.folder();
    if (!folder) {
      return;
    }
    this.testSuite.patchFolder(folder.id, { tags: [...tags] });
  }

  protected handleTreeStepSelected(nodeId: string | null): void {
    this.handleSelectedStepChange(nodeId);
  }

  protected handleRunPanelStepSelect(stepId: string): void {
    this.handleSelectedStepChange(stepId);
  }

  protected handleSelectedStepChange(stepId: string | null): void {
    this.selectedStepId.set(stepId);
    this.stepFailureDismissed.set(false);
    void this.persistTabUi({ selectedStepId: stepId });
  }

  protected handleFailureDismissed(): void {
    this.stepFailureDismissed.set(true);
  }

  protected handleFailureReopened(): void {
    this.stepFailureDismissed.set(false);
  }

  protected handleFlowNodesChange(treeNodes: readonly FlowStepTreeNode[]): void {
    const flow = this.flow();
    if (!flow) {
      return;
    }
    const nodes = normalizeFlowStepNodes(
      fromFlowStepTreeNodesWithExisting(treeNodes, flow.nodes),
    );
    this.testSuite.patchFlow(flow.id, { nodes });
  }

  protected handleStepChange(patch: Partial<TestSuiteFlowStep>): void {
    const flow = this.flow();
    const stepId = this.selectedStepId();
    if (!flow || !stepId) {
      return;
    }
    this.testSuite.updateFlowStep(flow.id, stepId, patch);
  }

  protected handleRemoveStep(): void {
    const flow = this.flow();
    const stepId = this.selectedStepId();
    if (!flow || !stepId) {
      return;
    }
    this.testSuite.deleteFlowNode(flow.id, stepId);
    this.selectedStepId.set(null);
    void this.persistTabUi({ selectedStepId: null });
  }

  protected handleCloneStep(stepId: string): void {
    const flow = this.flow();
    if (!flow) {
      return;
    }
    const clone = this.testSuite.cloneFlowStep(flow.id, stepId);
    if (!clone) {
      return;
    }
    this.selectedStepId.set(clone.id);
    this.stepFailureDismissed.set(true);
    void this.persistTabUi({ selectedStepId: clone.id });
  }

  protected handleAddStepRequest(): void {
    this.addStepModalOpen.set(true);
    void this.persistTabUi({ addStepModalOpen: true });
  }

  protected handleAddStepModalClosed(): void {
    this.addStepModalOpen.set(false);
    void this.persistTabUi({ addStepModalOpen: false });
  }

  protected handleAddStepType(type: TestSuiteStepType): void {
    const flow = this.flow();
    if (!flow) {
      return;
    }
    const step = this.testSuite.addFlowStep(flow.id, type, null);
    this.addStepModalOpen.set(false);
    void this.persistTabUi({ addStepModalOpen: false, selectedStepId: step?.id ?? null });
    if (step) {
      this.selectedStepId.set(step.id);
    }
  }

  protected handleTreeAreaContextMenu(event: MouseEvent): void {
    event.preventDefault();
    this.openContextMenu(event.clientX, event.clientY, null);
  }

  protected handleRowContextMenu(event: TxTreeRowContextMenuEvent): void {
    this.openContextMenu(event.clientX, event.clientY, event.nodeId);
  }

  protected handleContextMenuSelect(actionId: string): void {
    const nodeId = this.contextNodeId();
    this.contextMenuOpen.set(false);

    switch (actionId) {
      case 'add-step':
        this.handleAddStepRequest();
        break;
      case 'clone':
        if (nodeId) {
          this.handleCloneStep(nodeId);
        }
        break;
      case 'delete':
        if (nodeId) {
          this.openDeleteDialog(nodeId);
        }
        break;
    }
  }

  protected handleContextMenuClosed(): void {
    this.contextMenuOpen.set(false);
  }

  protected handleDeleteConfirmed(): void {
    const flow = this.flow();
    const nodeId = this.deleteNodeId();
    if (!flow || !nodeId) {
      return;
    }
    const selected = this.selectedStepId();
    if (selected === nodeId) {
      this.selectedStepId.set(null);
      void this.persistTabUi({ selectedStepId: null });
    }
    this.testSuite.deleteFlowNode(flow.id, nodeId);
    this.deleteOpen.set(false);
  }

  protected handleDeleteClosed(): void {
    this.deleteOpen.set(false);
  }

  protected handleOpenFolderCard(card: TestSuiteFolderCard): void {
    this.workspaceEditor.openResource({
      resourceId: folderCardResourceId(card),
      kind: 'test-suite',
    });
  }

  protected handleResultsPanelHeight(height: number): void {
    this.resultsPanelHeight.set(height);
  }

  protected handleResultsPanelHidden(hidden: boolean): void {
    this.resultsPanelHidden.set(hidden);
    void this.persistTabUi({ isResultsPanelHidden: hidden });
  }

  protected handleResultsPanelHeightCommit(height: number): void {
    this.resultsPanelHeight.set(height);
    this.schedulePanelSizePersist({ resultsPanelHeightPx: height });
  }

  protected handleStepsPanelWidth(width: number): void {
    this.stepsPanelWidth.set(width);
  }

  protected handleStepsPanelWidthCommit(width: number): void {
    this.stepsPanelWidth.set(width);
    this.schedulePanelSizePersist({ stepsPanelWidthPx: width });
  }

  protected async handleRun(): Promise<void> {
    const p = this.parsed();
    if (!p || p.kind !== 'flow') {
      return;
    }

    if (this.running()) {
      this.running.set(false);
      await this.electron.bridge()?.testing.e2eCancel();
      return;
    }

    const block = this.runBlockReason();
    if (block) {
      this.notifier.reportUnknown(new Error(block));
      return;
    }

    const flow = this.flow();
    const enabledSteps = flow ? flattenEnabledFlowSteps(flow.nodes) : [];

    this.liveStepStatuses.set(buildInitialFlowRunStatuses(enabledSteps.map((step) => step.id)));
    this.liveStepErrors.set({});
    this.lastRunMessage.set(null);
    this.running.set(true);

    const bridge = this.electron.bridge();
    const unsubscribeProgress = bridge?.testing.onFlowRunProgress?.((event) => {
      if (event.flowId === p.id) {
        this.liveStepStatuses.set({ ...event.stepStatuses });
      }
    });

    try {
      const result = await bridge?.testing.e2eExecuteFlow(p.id);
      if (result?.stepStatuses) {
        this.liveStepStatuses.set({ ...result.stepStatuses });
        this.liveStepErrors.set({ ...(result.stepErrors ?? {}) });
        this.testSuite.applyFlowRunStatuses(
          p.id,
          result.stepStatuses,
          result.ok,
          result.stepCaptures ?? {},
          result.stepDurations ?? {},
          result.stepErrors ?? {},
          result.durationMs ?? 0,
        );
        if (!result.ok) {
          const failedStepId = findFirstFailedFlowStepId(enabledSteps, result.stepStatuses);
          if (failedStepId) {
            this.handleSelectedStepChange(failedStepId);
          }
        }
      }
      if (result && !result.ok) {
        this.lastRunMessage.set(result.message);
      } else {
        this.lastRunMessage.set(null);
      }
    } catch (error: unknown) {
      this.notifier.reportUnknown(error);
    } finally {
      unsubscribeProgress?.();
      this.running.set(false);
    }
  }

  private openContextMenu(x: number, y: number, nodeId: string | null): void {
    this.contextNodeId.set(nodeId);
    this.contextMenuPosition.set({ x, y });

    if (!nodeId) {
      this.contextMenuItems.set(buildEmptyFlowStepContextMenu());
      this.contextMenuOpen.set(true);
      return;
    }

    const flow = this.flow();
    if (flow && findFlowStepTreeNode(toFlowStepTreeNodes(flow.nodes), nodeId)) {
      this.contextMenuItems.set(buildFlowStepContextMenu());
    } else {
      this.contextMenuItems.set(buildEmptyFlowStepContextMenu());
    }
    this.contextMenuOpen.set(true);
  }

  private openDeleteDialog(nodeId: string): void {
    const flow = this.flow();
    if (!flow) {
      return;
    }
    const loc = findFlowStepTreeNode(toFlowStepTreeNodes(flow.nodes), nodeId);
    if (!loc) {
      return;
    }
    this.deleteMessage.set(`Delete step "${loc.node.label}"?`);
    this.deleteNodeId.set(nodeId);
    this.deleteOpen.set(true);
  }

  private async persistTabUi(
    patch: Partial<ReturnType<typeof resolveTestSuiteTabUi>>,
  ): Promise<void> {
    if (this.sessionUiTimer !== null) {
      clearTimeout(this.sessionUiTimer);
    }
    this.sessionUiTimer = setTimeout(() => {
      this.sessionUiTimer = null;
      void this.flushTabUi(patch);
    }, SESSION_UI_DEBOUNCE_MS);
  }

  private async flushTabUi(
    patch: Partial<ReturnType<typeof resolveTestSuiteTabUi>>,
  ): Promise<void> {
    const resourceId = this.resourceId();
    const session = this.configService.session();
    const current = resolveTestSuiteTabUi(session?.workspace.testing.testSuiteTabsById, resourceId);
    await this.configService.patchSession({
      workspace: {
        testing: {
          ...this.testingSession.navigationFields(),
          testSuiteTabsById: {
            [resourceId]: {
              ...current,
              selectedStepId: this.selectedStepId(),
              addStepModalOpen: this.addStepModalOpen(),
              stepsPanelWidthPx: this.stepsPanelWidth(),
              resultsPanelHeightPx: this.resultsPanelHeight(),
              isResultsPanelHidden: this.resultsPanelHidden(),
              ...patch,
            },
          },
        },
      },
    });
  }

  private schedulePanelSizePersist(
    patch: Partial<ReturnType<typeof resolveTestSuiteTabUi>>,
  ): void {
    if (this.panelSizeSaveTimer !== null) {
      clearTimeout(this.panelSizeSaveTimer);
    }
    this.panelSizeSaveTimer = setTimeout(() => {
      this.panelSizeSaveTimer = null;
      void this.persistTabUi(patch);
    }, PANEL_SIZE_SAVE_DEBOUNCE_MS);
  }

  /** Toolbar rows + steps/editor/run panels for entrance stagger settle timing. */
  private loadEntranceChildCount(): number {
    return 5;
  }
}
