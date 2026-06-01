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
  resolveRegressionTabUi,
  type RegressionTabSectionId,
  type RegressionTabUi,
  type WorkspaceEditorLayoutId,
} from '@shared/config';
import type { RegressionProfile, RegressionRun, RegressionThresholds } from '@shared/testing';
import {
  collectFailedFlowIdsFromRun,
  createIdleRegressionRunMetrics,
  createStartingRegressionRunMetrics,
  filterFailedFlowIdsStillLinked,
  regressionRunProgressEventSchema,
  resolveRegressionFlowIds,
  type RegressionFlowResult,
  type RegressionFlowTimelineEntry,
  type RegressionRunMetrics,
  type RegressionStartOptions,
} from '@shared/testing';

import { ConfigService } from '@app/core/config/config.service';
import { resolveTabEditorLayout } from '@app/core/config/workspace-tab-editor-layout';
import { EnvironmentsService } from '@app/core/environments/environments.service';
import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import { RegressionRunRequestService } from '@app/core/testing/regression-run-request.service';
import { RegressionService } from '@app/core/testing/regression.service';
import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { freezeWhileTabInactive } from '@app/core/ui/workspace-tab-active.util';
import { WorkspaceTabMotionController } from '@app/core/ui/workspace-tab-motion';
import { regressionTabSectionBlockCount } from '@app/core/ui/workspace-tab-section-stagger';
import { WorkspaceSectionNavSliderDirective } from '../../workspace/workspace-section-nav-slider.directive';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import type { TxDropdownOption } from '@app/shared/components/tx-dropdown/tx-dropdown.types';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxVerticalSplitPaneComponent } from '@app/shared/components/tx-vertical-split-pane/tx-vertical-split-pane.component';

import { RgTabDocsPanelComponent } from './rg-tab-docs-panel.component';
import { RgTabFlowsPanelComponent } from './rg-tab-flows-panel.component';
import { RgTabOverviewPanelComponent } from './rg-tab-overview-panel.component';
import { RgTabResultsPanelComponent, type RgRunState } from './rg-tab-results-panel.component';
import { RgTabSettingsPanelComponent } from './rg-tab-settings-panel.component';

interface RgTabNavItem {
  readonly id: RegressionTabSectionId;
  readonly label: string;
  readonly icon: string;
}

const NAV_ITEMS: readonly RgTabNavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'info' },
  { id: 'flows', label: 'Flows', icon: 'testing' },
  { id: 'settings', label: 'Settings', icon: 'sliders' },
  { id: 'docs', label: 'Docs', icon: 'file-text' },
  { id: 'results', label: 'Results', icon: 'barChart' },
];

const ARTIFACT_SAVE_DEBOUNCE_MS = 300;
const SESSION_UI_DEBOUNCE_MS = 150;

@Component({
  selector: 'app-regression-workspace-tab',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxButtonComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxVerticalSplitPaneComponent,
    RgTabOverviewPanelComponent,
    RgTabFlowsPanelComponent,
    RgTabSettingsPanelComponent,
    RgTabDocsPanelComponent,
    RgTabResultsPanelComponent,
    WorkspaceSectionNavSliderDirective,
  ],
  templateUrl: './regression-workspace-tab.component.html',
  styleUrl: './regression-workspace-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegressionWorkspaceTabComponent {
  private readonly configService = inject(ConfigService);
  private readonly testingSession = inject(TestingSessionService);
  private readonly regression = inject(RegressionService);
  private readonly testSuite = inject(TestSuiteService);
  private readonly runRequest = inject(RegressionRunRequestService);
  private readonly environmentsService = inject(EnvironmentsService);
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly uiPreferences = inject(UiPreferencesService);

  protected readonly tabMotion = new WorkspaceTabMotionController(
    this.uiPreferences,
    this.destroyRef,
  );

  readonly resourceId = input.required<string>();
  readonly active = input(false);
  readonly cached = input(false);

  protected readonly navItems = NAV_ITEMS;
  protected readonly activeSection = signal<RegressionTabSectionId>('overview');
  protected readonly resultsPanelHeight = signal(420);
  protected readonly resultsPanelHidden = signal(false);
  protected readonly running = signal(false);
  protected readonly runActionPending = signal(false);
  protected readonly metrics = signal<RegressionRunMetrics>(createIdleRegressionRunMetrics());
  protected readonly selectedRunId = signal<string | null>(null);
  protected readonly pinnedBaselineRunId = signal<string | null>(null);
  protected readonly compareSelection = signal<{ readonly a: string; readonly b: string } | null>(null);
  protected readonly resultsView = signal<'live' | 'history' | 'compare'>('live');
  protected readonly selectedFlowIds = signal<string[]>([]);
  protected readonly diffFilter = signal<RegressionTabUi['diffFilter']>('all');
  protected readonly selectedFlowDiffId = signal<string | null>(null);
  protected readonly selectedStepDiffId = signal<string | null>(null);
  protected readonly captureDiffNormalizeJson = signal(true);
  protected readonly flowsExpandedIds = signal<string[]>([]);
  protected readonly liveFlowTimeline = signal<readonly RegressionFlowTimelineEntry[]>([]);
  protected readonly liveFlowResults = signal<readonly RegressionFlowResult[]>([]);
  protected readonly completionBanner = signal<{ readonly variant: 'success' | 'error'; readonly title: string } | null>(
    null,
  );

  private metricsUnsubscribe: (() => void) | null = null;
  private progressUnsubscribe: (() => void) | null = null;
  private runCancelled = false;
  private completionBannerTimer: ReturnType<typeof setTimeout> | null = null;

  private sessionUiLoadKey: string | null = null;
  private sessionUiSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private artifactSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private resultsPanelHeightSaveTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly missing = computed(() => !this.artifact());

  protected readonly editorLayout = computed((): WorkspaceEditorLayoutId =>
    resolveTabEditorLayout(this.configService.settings(), 'regression'),
  );

  protected readonly useSidebarLayout = computed(() => this.editorLayout() === 'sidebar');
  protected readonly useTitlebarLayout = computed(() => this.editorLayout() === 'titlebar');

  protected readonly artifactId = computed(() => {
    const raw = this.resourceId();
    return raw.startsWith('rg:') ? raw.slice(3) : '';
  });

  protected readonly artifact = freezeWhileTabInactive(this.active, () =>
    this.regression.findArtifact(this.artifactId()),
  );

  protected readonly isArchived = computed(
    () => Boolean(this.artifact()?.archivedAt) || this.regression.isArchived(this.artifactId()),
  );

  protected readonly title = computed(() => this.artifact()?.name ?? 'Regression');

  protected readonly lastRun = computed(() => this.artifact()?.runs[0] ?? null);

  protected readonly runState = computed((): RgRunState => {
    if (this.running()) {
      return 'running';
    }
    if ((this.artifact()?.runs.length ?? 0) === 0 && this.liveFlowResults().length === 0) {
      return 'idle';
    }
    const m = this.metrics();
    if (m.completed > 0 || m.samples.length > 0 || this.liveFlowResults().length > 0) {
      return 'completed';
    }
    return (this.artifact()?.runs.length ?? 0) > 0 ? 'completed' : 'idle';
  });

  protected readonly showResultsPanel = computed(
    () => !this.missing() && this.activeSection() !== 'results',
  );

  protected readonly runProgressPercent = computed(() => {
    const total = this.metrics().total;
    if (total <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((this.metrics().completed / total) * 100));
  });

  protected readonly runButtonLabel = computed(() => {
    if (this.running()) {
      return 'Cancel';
    }
    const artifact = this.artifact();
    if (!artifact) {
      return 'Run regression';
    }
    const scope = artifact.profile.runScope;
    const count = resolveRegressionFlowIds(artifact, artifact.profile, {
      selectedFlowIds: this.selectedFlowIds(),
    }).length;
    if (scope === 'selected') {
      return count > 0 ? `Run ${count} selected` : 'Run selected';
    }
    if (scope === 'failed-from-last') {
      return count > 0 ? `Run ${count} failed` : 'Run failed';
    }
    return 'Run regression';
  });

  protected readonly runButtonVariant = computed((): 'primary' | 'secondary' =>
    this.running() ? 'secondary' : 'primary',
  );

  protected readonly canStartRegression = computed(
    () =>
      !this.isArchived() &&
      (this.artifact()?.flowIds.length ?? 0) > 0 &&
      Boolean(this.electron.bridge()?.testing),
  );

  protected readonly runButtonTitle = computed(() => {
    if (this.running()) {
      return 'Cancel regression run';
    }
    if (this.isArchived()) {
      return 'This regression is archived';
    }
    if (!this.electron.bridge()?.testing) {
      return 'Regressions require the Electron desktop app';
    }
    if ((this.artifact()?.flowIds.length ?? 0) === 0) {
      return 'Link at least one flow before running';
    }
    return 'Run regression';
  });

  protected readonly failedFlowCount = computed(() => {
    const run = this.lastRun();
    const artifact = this.artifact();
    if (!run || !artifact) {
      return 0;
    }
    return filterFailedFlowIdsStillLinked(artifact, collectFailedFlowIdsFromRun(run)).length;
  });

  protected readonly canRerunFailed = computed(
    () => !this.running() && !this.isArchived() && this.failedFlowCount() > 0 && this.canStartRegression(),
  );

  protected readonly rerunFailedLabel = computed(() => {
    const count = this.failedFlowCount();
    return count > 0 ? `Rerun failed (${count})` : 'Rerun failed';
  });

  protected readonly environmentOptions = computed((): readonly TxDropdownOption[] => {
    const options: TxDropdownOption[] = [{ value: '', label: 'No environment' }];
    for (const environment of this.environmentsService.environments()) {
      options.push({ value: environment.id, label: environment.name });
    }
    return options;
  });

  constructor() {
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
      const ui = resolveRegressionTabUi(session.workspace.testing.regressionTabsById, resourceId);
      this.activeSection.set(ui.activeSection);
      if (ui.resultsPanelHeightPx) {
        this.resultsPanelHeight.set(ui.resultsPanelHeightPx);
      }
      this.resultsPanelHidden.set(ui.isResultsPanelHidden);
      this.selectedRunId.set(ui.selectedRunId);
      this.pinnedBaselineRunId.set(ui.pinnedBaselineRunId);
      this.compareSelection.set(ui.compareSelection);
      this.resultsView.set(ui.resultsView);
      this.selectedFlowIds.set([...(ui.selectedFlowIds ?? [])]);
      this.diffFilter.set(ui.diffFilter);
      this.selectedFlowDiffId.set(ui.selectedFlowDiffId);
      this.selectedStepDiffId.set(ui.selectedStepDiffId);
      this.captureDiffNormalizeJson.set(ui.captureDiffNormalizeJson);
      this.flowsExpandedIds.set([...ui.flowsExpandedIds]);
    });

    effect(() => {
      if (!this.active()) {
        return;
      }
      void this.syncRunStateFromBackend();
    });

    effect(() => {
      if (!this.active()) {
        return;
      }
      const id = this.artifactId();
      const pending = this.runRequest.pending();
      if (!pending || pending.regressionId !== id) {
        return;
      }
      untracked(() => {
        const request = this.runRequest.consume(id);
        if (!request) {
          return;
        }
        if (request.openResults) {
          this.activeSection.set('results');
          this.resultsPanelHidden.set(false);
        }
        this.startRegressionRun(request.options ?? {});
      });
    });

    effect(() => {
      if (!this.active() || this.running()) {
        return;
      }
      const runCount = this.artifact()?.runs.length ?? 0;
      if (runCount > 0) {
        return;
      }
      const metrics = this.metrics();
      if (metrics.completed === 0 && metrics.samples.length === 0) {
        return;
      }
      untracked(() => this.resetLiveMetrics());
    });

    this.destroyRef.onDestroy(() => {
      this.teardownRunListeners();
      if (this.completionBannerTimer) {
        clearTimeout(this.completionBannerTimer);
      }
    });

    this.tabMotion.settleLoadImmediately();
    this.tabMotion.bindLoadReplay(
      () => `${this.configService.sessionRevision()}:${this.resourceId()}`,
      () => this.loadChromeChildCount(),
      { tabActive: () => this.active() },
    );
  }

  protected isSectionContentAnimating(sectionId: RegressionTabSectionId): boolean {
    return this.tabMotion.isSectionContentAnimating(sectionId);
  }

  protected isSectionContentSettled(sectionId: RegressionTabSectionId): boolean {
    return this.tabMotion.isSectionContentSettled(sectionId);
  }

  protected handleNameChange(name: string): void {
    this.scheduleArtifactPatch({ name: name.trim() || this.title() });
  }

  protected handleReleaseChange(release: string): void {
    this.scheduleArtifactPatch({ release: release.trim() });
  }

  protected handleTagsChange(tags: readonly string[]): void {
    const id = this.artifactId();
    if (id) {
      this.regression.patchTags(id, tags);
    }
  }

  protected handleDescriptionChange(description: string): void {
    this.scheduleArtifactPatch({ description });
  }

  protected handleProfileChange(patch: Partial<RegressionProfile>): void {
    const id = this.artifactId();
    if (!id) {
      return;
    }
    this.regression.patchProfile(id, patch);
  }

  protected handleThresholdsChange(patch: Partial<RegressionThresholds>): void {
    const id = this.artifactId();
    if (!id) {
      return;
    }
    this.regression.patchThresholds(id, patch);
  }

  protected handleDocsChange(docs: string): void {
    this.scheduleArtifactPatch({ docs });
  }

  protected handleFlowIdsChange(flowIds: readonly string[]): void {
    const id = this.artifactId();
    if (!id) {
      return;
    }
    this.regression.patchFlowIds(id, flowIds);
    this.selectedFlowIds.set([...flowIds]);
    this.scheduleTabUiPersist();
  }

  protected handleResultsViewChange(view: 'live' | 'history' | 'compare'): void {
    this.resultsView.set(view);
    this.scheduleTabUiPersist();
  }

  protected handleSelectedRunChange(runId: string | null): void {
    this.selectedRunId.set(runId);
    this.selectedFlowDiffId.set(null);
    this.selectedStepDiffId.set(null);
    this.scheduleTabUiPersist();
  }

  protected handleCompareSelectionChange(
    selection: { readonly a: string; readonly b: string } | null,
  ): void {
    this.compareSelection.set(selection);
    if (selection) {
      this.resultsView.set('compare');
    }
    this.scheduleTabUiPersist();
  }

  protected handlePinnedBaselineChange(runId: string | null): void {
    this.pinnedBaselineRunId.set(runId);
    this.scheduleTabUiPersist();
  }

  protected handleFlowsExpandedIdsChange(ids: readonly string[]): void {
    this.flowsExpandedIds.set([...ids]);
    this.scheduleTabUiPersist();
  }

  protected handleDiffFilterChange(filter: RegressionTabUi['diffFilter']): void {
    this.diffFilter.set(filter);
    this.scheduleTabUiPersist();
  }

  protected handleSelectedFlowDiffIdChange(flowId: string | null): void {
    this.selectedFlowDiffId.set(flowId);
    this.scheduleTabUiPersist();
  }

  protected handleSelectedStepDiffIdChange(stepId: string | null): void {
    this.selectedStepDiffId.set(stepId);
    this.scheduleTabUiPersist();
  }

  protected handleCaptureDiffNormalizeJsonChange(normalizeJson: boolean): void {
    this.captureDiffNormalizeJson.set(normalizeJson);
    this.scheduleTabUiPersist();
  }

  protected handleClearRuns(): void {
    const id = this.artifactId();
    if (!id) {
      return;
    }
    this.regression.clearRuns(id);
    this.selectedRunId.set(null);
    this.pinnedBaselineRunId.set(null);
    this.compareSelection.set(null);
    this.resultsView.set('live');
    this.selectedFlowDiffId.set(null);
    this.selectedStepDiffId.set(null);
    if (!this.running()) {
      this.resetLiveMetrics();
    }
    this.scheduleTabUiPersist();
  }

  protected handleDeleteRun(runId: string): void {
    const id = this.artifactId();
    if (!id) {
      return;
    }
    this.regression.deleteRun(id, runId);
    if (this.selectedRunId() === runId) {
      this.selectedRunId.set(null);
    }
    if (this.pinnedBaselineRunId() === runId) {
      this.pinnedBaselineRunId.set(null);
    }
    const compare = this.compareSelection();
    if (compare && (compare.a === runId || compare.b === runId)) {
      this.compareSelection.set(null);
      this.resultsView.set('history');
    }
    if ((this.artifact()?.runs.length ?? 0) === 0 && !this.running()) {
      this.resetLiveMetrics();
    }
    this.scheduleTabUiPersist();
  }

  protected handleOpenResultsView(): void {
    this.activeSection.set('results');
    this.tabMotion.onSectionChange('results', {
      contentBlockCount: regressionTabSectionBlockCount('results'),
    });
    this.resultsPanelHidden.set(false);
    this.scheduleTabUiPersist();
  }

  protected handleSectionSelect(section: RegressionTabSectionId): void {
    if (section === this.activeSection()) {
      return;
    }
    this.activeSection.set(section);
    this.tabMotion.onSectionChange(section, {
      contentBlockCount: regressionTabSectionBlockCount(section),
    });
    if (section === 'results') {
      this.resultsView.set(this.resultsView() === 'compare' ? 'compare' : 'live');
    }
    this.scheduleTabUiPersist();
  }

  protected handleRunToggle(): void {
    if (this.runActionPending() && !this.running()) {
      return;
    }
    if (this.running()) {
      this.cancelRegressionRun();
      return;
    }
    this.startRegressionRun({});
  }

  protected handleRerunFailed(referenceRun?: RegressionRun): void {
    const artifact = this.artifact();
    if (!artifact) {
      return;
    }
    const run = referenceRun ?? this.lastRun();
    if (!run) {
      return;
    }
    const failedIds = filterFailedFlowIdsStillLinked(
      artifact,
      collectFailedFlowIdsFromRun(run),
    );
    if (failedIds.length === 0) {
      return;
    }
    this.startRegressionRun({ flowIdsOverride: [...failedIds] });
  }

  protected handleResultsPanelHeight(height: number): void {
    this.resultsPanelHeight.set(height);
  }

  protected handleResultsPanelHidden(hidden: boolean): void {
    this.resultsPanelHidden.set(hidden);
    this.scheduleTabUiPersist();
  }

  protected handleResultsPanelHeightCommit(height: number): void {
    this.resultsPanelHeight.set(height);
    if (this.resultsPanelHeightSaveTimer) {
      clearTimeout(this.resultsPanelHeightSaveTimer);
    }
    this.resultsPanelHeightSaveTimer = setTimeout(() => {
      this.resultsPanelHeightSaveTimer = null;
      void this.persistTabUi();
    }, ARTIFACT_SAVE_DEBOUNCE_MS);
  }

  protected dismissCompletionBanner(): void {
    this.completionBanner.set(null);
  }

  private startRegressionRun(options: Partial<RegressionStartOptions>): void {
    const artifact = this.artifact();
    const artifactId = this.artifactId();
    if (!artifact || !artifactId) {
      return;
    }

    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.notifier.reportUnknown(
        new Error('Regressions require the Electron desktop app with flow execution enabled.'),
      );
      return;
    }

    if (this.isArchived()) {
      this.notifier.reportUnknown(new Error('This regression is archived and cannot be run.'));
      return;
    }

    const flowIds = options.flowIdsOverride?.length
      ? options.flowIdsOverride
      : resolveRegressionFlowIds(artifact, artifact.profile, {
          selectedFlowIds: this.selectedFlowIds(),
        });

    if (flowIds.length === 0) {
      this.notifier.reportUnknown(new Error('No flows to run for the selected scope.'));
      this.activeSection.set('flows');
      this.scheduleTabUiPersist();
      return;
    }

    const startOptions: RegressionStartOptions = {
      regressionId: artifactId,
      ...options,
      selectedFlowIds:
        options.selectedFlowIds ?? (artifact.profile.runScope === 'selected' ? [...flowIds] : undefined),
    };

    this.runActionPending.set(true);
    this.runCancelled = false;
    this.completionBanner.set(null);
    this.resultsView.set('live');
    this.selectedRunId.set(null);
    this.compareSelection.set(null);
    this.liveFlowTimeline.set([]);
    this.liveFlowResults.set([]);
    this.metrics.set(
      createStartingRegressionRunMetrics(
        artifactId,
        'pending',
        flowIds.length,
        artifact.thresholds.acceptancePercent,
      ),
    );
    this.running.set(true);
    this.setupRunListeners(artifact.profile.updateFlowLastRunStatus);
    this.resultsPanelHidden.set(false);
    this.scheduleTabUiPersist();

    void api
      .regressionStart(startOptions)
      .then(({ metrics, run }) => {
        this.applyMetricsSnapshot(metrics);
        this.regression.appendRun(artifactId, run);
        this.selectedRunId.set(run.id);
        this.liveFlowTimeline.set(run.flowTimeline);
        this.liveFlowResults.set(run.flowResults);
        this.showCompletionBanner(run);
      })
      .catch((error: unknown) => {
        this.notifier.reportUnknown(error);
        this.resetLiveMetrics();
      })
      .finally(() => {
        this.teardownRunListeners();
        this.runCancelled = false;
        this.runActionPending.set(false);
      });

    this.runActionPending.set(false);
  }

  private cancelRegressionRun(): void {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      return;
    }
    this.runActionPending.set(true);
    this.runCancelled = true;
    this.running.set(false);
    void api
      .regressionCancel()
      .then((snapshot) => this.applyMetricsSnapshot(snapshot))
      .finally(() => this.runActionPending.set(false));
  }

  private showCompletionBanner(run: RegressionRun): void {
    if (this.completionBannerTimer) {
      clearTimeout(this.completionBannerTimer);
    }
    const variant = run.status === 'passed' ? 'success' : 'error';
    const title =
      run.status === 'passed'
        ? 'Regression run passed'
        : run.status === 'cancelled'
          ? 'Regression run cancelled'
          : 'Regression run failed';
    this.completionBanner.set({ variant, title });
    this.completionBannerTimer = setTimeout(() => {
      this.completionBanner.set(null);
      this.completionBannerTimer = null;
    }, 4000);
  }

  private applyMetricsSnapshot(snapshot: RegressionRunMetrics): void {
    this.metrics.set(snapshot);
    this.running.set(this.runCancelled ? false : snapshot.running);
  }

  private resetLiveMetrics(): void {
    this.running.set(false);
    this.runCancelled = false;
    this.liveFlowTimeline.set([]);
    this.liveFlowResults.set([]);
    this.metrics.set(createIdleRegressionRunMetrics());
  }

  private setupRunListeners(updateFlowLastRunStatus: boolean): void {
    this.teardownRunListeners();
    const api = this.electron.bridge()?.testing;
    if (!api) {
      return;
    }
    this.metricsUnsubscribe = api.onRegressionMetrics((snapshot) => {
      this.applyMetricsSnapshot(snapshot);
    });
    this.progressUnsubscribe = api.onRegressionRunProgress((raw) => {
      const parsed = regressionRunProgressEventSchema.safeParse(raw);
      if (!parsed.success) {
        return;
      }
      const event = parsed.data;
      if (event.regressionId !== this.artifactId()) {
        return;
      }
      if (event.flowTimeline) {
        this.liveFlowTimeline.set(event.flowTimeline);
      }
      if (event.flowResult) {
        this.liveFlowResults.update((current) => {
          const without = current.filter((r) => r.flowId !== event.flowResult!.flowId);
          return [...without, event.flowResult!];
        });
        if (updateFlowLastRunStatus) {
          const result = event.flowResult;
          this.testSuite.applyFlowRunStatuses(
            result.flowId,
            result.stepStatuses ?? {},
            result.status === 'passed',
            result.stepCaptures,
            result.stepDurations,
            result.stepErrors,
            result.durationMs,
          );
        }
      }
    });
  }

  private teardownRunListeners(): void {
    this.metricsUnsubscribe?.();
    this.metricsUnsubscribe = null;
    this.progressUnsubscribe?.();
    this.progressUnsubscribe = null;
  }

  private async syncRunStateFromBackend(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      if ((this.artifact()?.runs.length ?? 0) === 0) {
        this.resetLiveMetrics();
      }
      return;
    }

    const snapshot = await api.regressionStatus();
    this.applyMetricsSnapshot(snapshot);
    if (snapshot.running) {
      this.setupRunListeners(this.artifact()?.profile.updateFlowLastRunStatus ?? true);
    } else {
      this.teardownRunListeners();
    }
  }

  private loadChromeChildCount(): number {
    let count = 1;
    if (this.useTitlebarLayout()) {
      count += 1;
    }
    return count;
  }

  private scheduleArtifactPatch(patch: Parameters<RegressionService['patchArtifact']>[1]): void {
    const id = this.artifactId();
    if (!id) {
      return;
    }
    if (this.artifactSaveTimer !== null) {
      clearTimeout(this.artifactSaveTimer);
    }
    this.artifactSaveTimer = setTimeout(() => {
      this.artifactSaveTimer = null;
      this.regression.patchArtifact(id, patch);
    }, ARTIFACT_SAVE_DEBOUNCE_MS);
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
    const existing = resolveRegressionTabUi(session?.workspace.testing.regressionTabsById, resourceId);
    await this.configService.patchSession({
      workspace: {
        testing: {
          ...this.testingSession.navigationFields(),
          regressionTabsById: {
            [resourceId]: {
              ...existing,
              activeSection: this.activeSection(),
              resultsPanelHeightPx: this.resultsPanelHeight(),
              isResultsPanelHidden: this.resultsPanelHidden(),
              selectedRunId: this.selectedRunId(),
              pinnedBaselineRunId: this.pinnedBaselineRunId(),
              compareSelection: this.compareSelection(),
              resultsView: this.resultsView(),
              selectedFlowIds: this.selectedFlowIds(),
              diffFilter: this.diffFilter(),
              selectedFlowDiffId: this.selectedFlowDiffId(),
              selectedStepDiffId: this.selectedStepDiffId(),
              captureDiffNormalizeJson: this.captureDiffNormalizeJson(),
              flowsExpandedIds: this.flowsExpandedIds(),
            },
          },
        },
      },
    });
  }
}
