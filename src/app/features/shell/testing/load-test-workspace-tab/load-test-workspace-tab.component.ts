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
  resolveLoadTestTabUi,
  type LoadTestTabSectionId,
  type WorkspaceEditorLayoutId,
} from '@shared/config';
import type {
  LoadTestManualTarget,
  LoadTestProfile,
  LoadTestRunRecord,
  LoadTestTargetSource,
  LoadTestThresholds,
} from '@shared/testing';
import {
  createDefaultLoadTestManualTarget,
  isLoadTestTargetReady,
  resolveLoadTestTargetSource,
} from '@shared/testing';
import {
  createIdleLoadTestRunMetrics,
  createLoadTestRunRecord,
  createStartingLoadTestRunMetrics,
  type LoadTestRunMetrics,
  type LoadTestStartOptions,
} from '@shared/testing';

import { CollectionsService } from '@app/core/collections/collections.service';
import { ConfigService } from '@app/core/config/config.service';
import { TestingSessionService } from '@app/core/testing/testing-session.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import { LoadTestService } from '@app/core/testing/load-test.service';
import { newTestingId } from '@app/core/testing/testing-id';
import { freezeWhileTabInactive } from '@app/core/ui/workspace-tab-active.util';
import { WorkspaceTabMotionController } from '@app/core/ui/workspace-tab-motion';
import { loadTestTabSectionBlockCount } from '@app/core/ui/workspace-tab-section-stagger';
import { WorkspaceSectionNavSliderDirective } from '../../workspace/workspace-section-nav-slider.directive';
import { UiPreferencesService } from '@app/core/ui/ui-preferences.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxVerticalSplitPaneComponent } from '@app/shared/components/tx-vertical-split-pane/tx-vertical-split-pane.component';

import { collectionRequestLabel } from './collect-collection-requests';
import { LtTabDocsPanelComponent } from './lt-tab-docs-panel.component';
import { LtTabOverviewPanelComponent } from './lt-tab-overview-panel.component';
import { LtTabProfilePanelComponent } from './lt-tab-profile-panel.component';
import { LtTabResultsPanelComponent, type LtRunState } from './lt-tab-results-panel.component';
import { LtTabTargetPanelComponent } from './lt-tab-target-panel.component';
import { LtTabThresholdsPanelComponent } from './lt-tab-thresholds-panel.component';

interface LtTabNavItem {
  readonly id: LoadTestTabSectionId;
  readonly label: string;
  readonly icon: string;
}

const NAV_ITEMS: readonly LtTabNavItem[] = [
  { id: 'overview', label: 'Overview', icon: 'info' },
  { id: 'target', label: 'Target', icon: 'http' },
  { id: 'profile', label: 'Profile', icon: 'sliders' },
  { id: 'thresholds', label: 'Thresholds', icon: 'checkCircle' },
  { id: 'docs', label: 'Docs', icon: 'file-text' },
];

const ARTIFACT_SAVE_DEBOUNCE_MS = 300;
const SESSION_UI_DEBOUNCE_MS = 150;
const METRICS_POLL_MS = 500;

@Component({
  selector: 'app-load-test-workspace-tab',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxButtonComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxInputComponent,
    TxVerticalSplitPaneComponent,
    LtTabOverviewPanelComponent,
    LtTabTargetPanelComponent,
    LtTabProfilePanelComponent,
    LtTabThresholdsPanelComponent,
    LtTabDocsPanelComponent,
    LtTabResultsPanelComponent,
    WorkspaceSectionNavSliderDirective,
  ],
  templateUrl: './load-test-workspace-tab.component.html',
  styleUrl: './load-test-workspace-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadTestWorkspaceTabComponent {
  private readonly collectionsService = inject(CollectionsService);
  private readonly configService = inject(ConfigService);
  private readonly testingSession = inject(TestingSessionService);
  private readonly loadTest = inject(LoadTestService);
  private readonly electron = inject(ElectronService);
  private readonly notifier = inject(ErrorNotificationService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);
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
  protected readonly activeSection = signal<LoadTestTabSectionId>('overview');
  protected readonly resultsPanelHeight = signal(420);
  protected readonly resultsPanelHidden = signal(false);
  protected readonly running = signal(false);
  protected readonly runActionPending = signal(false);
  protected readonly metrics = signal<LoadTestRunMetrics>(createIdleLoadTestRunMetrics());
  protected readonly selectedRunId = signal<string | null>(null);
  protected readonly pinnedBaselineRunId = signal<string | null>(null);
  protected readonly compareSelection = signal<{ readonly a: string; readonly b: string } | null>(null);
  protected readonly resultsView = signal<'live' | 'history' | 'compare'>('live');

  private metricsPollTimer: ReturnType<typeof setInterval> | null = null;
  private activeRunId: string | null = null;
  private runStartedAt: string | null = null;
  private runWasActive = false;
  private runCancelled = false;

  private sessionUiLoadKey: string | null = null;
  private sessionUiSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private artifactSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private resultsPanelHeightSaveTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly missing = computed(() => !this.artifact());

  protected readonly editorLayout = computed(
    (): WorkspaceEditorLayoutId =>
      this.configService.settings()?.collections.editorLayout ?? 'sidebar',
  );

  protected readonly useSidebarLayout = computed(() => this.editorLayout() === 'sidebar');

  protected readonly useTitlebarLayout = computed(() => this.editorLayout() === 'titlebar');

  protected readonly artifactId = computed(() => {
    const raw = this.resourceId();
    return raw.startsWith('lt:') ? raw.slice(3) : '';
  });

  protected readonly artifact = freezeWhileTabInactive(this.active, () =>
    this.loadTest.findArtifact(this.artifactId()),
  );

  protected readonly title = computed(() => this.artifact()?.name ?? 'Load test');

  protected readonly targetLabel = computed(() => {
    const artifact = this.artifact();
    if (!artifact) {
      return '—';
    }
    if (resolveLoadTestTargetSource(artifact) === 'manual') {
      const manual = artifact.manualTarget;
      const url = manual?.url?.trim();
      if (!url) {
        return 'Manual request (URL required)';
      }
      return `${manual?.method ?? 'GET'} ${url}`;
    }
    return (
      collectionRequestLabel(this.collectionsService.nodes(), artifact.targetRequestId) ||
      'No collection request selected'
    );
  });

  protected readonly runState = computed((): LtRunState => {
    if (this.running()) {
      return 'running';
    }
    if ((this.artifact()?.runs.length ?? 0) === 0) {
      return 'idle';
    }
    const m = this.metrics();
    if (m.totalRequests > 0 || m.samples.length > 0) {
      return 'completed';
    }
    return 'idle';
  });

  protected readonly showResultsPanel = computed(() => !this.missing());

  protected readonly runButtonLabel = computed(() => (this.running() ? 'Cancel' : 'Start load test'));

  protected readonly runButtonVariant = computed((): 'primary' | 'secondary' =>
    this.running() ? 'secondary' : 'primary',
  );

  protected readonly canStartLoadTest = computed(() => {
    const artifact = this.artifact();
    return Boolean(artifact && isLoadTestTargetReady(artifact) && this.electron.bridge()?.testing);
  });

  protected readonly runButtonTitle = computed(() => {
    if (this.running()) {
      return 'Cancel load test';
    }
    if (!this.electron.bridge()?.testing) {
      return 'Load tests require the Electron desktop app';
    }
    if (!isLoadTestTargetReady(this.artifact() ?? {})) {
      return 'Configure a target request before starting';
    }
    return 'Start load test';
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
      const ui = resolveLoadTestTabUi(session.workspace.testing.loadTestTabsById, resourceId);
      this.activeSection.set(ui.activeSection);
      if (ui.resultsPanelHeightPx) {
        this.resultsPanelHeight.set(ui.resultsPanelHeightPx);
      }
      this.resultsPanelHidden.set(ui.isResultsPanelHidden);
      this.selectedRunId.set(ui.selectedRunId);
      this.pinnedBaselineRunId.set(ui.pinnedBaselineRunId);
      this.compareSelection.set(ui.compareSelection);
      this.resultsView.set(ui.resultsView);
    });

    effect(() => {
      if (!this.active()) {
        return;
      }
      void this.syncRunStateFromBackend();
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
      if (metrics.totalRequests === 0 && metrics.samples.length === 0) {
        return;
      }
      untracked(() => this.resetLiveMetrics());
    });

    this.destroyRef.onDestroy(() => this.stopMetricsPolling());

    this.tabMotion.settleLoadImmediately();
    this.tabMotion.bindLoadReplay(
      () => `${this.configService.sessionRevision()}:${this.resourceId()}`,
      () => this.loadChromeChildCount(),
      { tabActive: () => this.active() },
    );
  }

  protected isSectionContentAnimating(sectionId: LoadTestTabSectionId): boolean {
    return this.tabMotion.isSectionContentAnimating(sectionId);
  }

  protected isSectionContentSettled(sectionId: LoadTestTabSectionId): boolean {
    return this.tabMotion.isSectionContentSettled(sectionId);
  }

  protected handleNameChange(name: string): void {
    this.scheduleArtifactPatch({ name: name.trim() || this.title() });
  }

  protected handleDescriptionChange(description: string): void {
    this.scheduleArtifactPatch({ description });
  }

  protected handleTagsChange(tags: readonly string[]): void {
    const id = this.artifactId();
    if (id) {
      this.loadTest.patchTags(id, tags);
    }
  }

  protected handleTargetSourceChange(targetSource: LoadTestTargetSource): void {
    const artifact = this.artifact();
    if (!artifact) {
      return;
    }
    this.scheduleArtifactPatch({
      targetSource,
      targetRequestId: targetSource === 'collection' ? artifact.targetRequestId : undefined,
      manualTarget:
        targetSource === 'manual'
          ? (artifact.manualTarget ?? createDefaultLoadTestManualTarget())
          : artifact.manualTarget,
    });
  }

  protected handleTargetChange(targetRequestId: string | undefined): void {
    this.scheduleArtifactPatch({
      targetSource: 'collection',
      targetRequestId,
    });
  }

  protected handleManualTargetChange(manualTarget: LoadTestManualTarget): void {
    this.scheduleArtifactPatch({
      targetSource: 'manual',
      manualTarget,
      targetRequestId: undefined,
    });
  }

  protected handleProfileChange(patch: Partial<LoadTestProfile>): void {
    const profile = this.artifact()?.profile;
    if (!profile) {
      return;
    }
    this.scheduleArtifactPatch({ profile: { ...profile, ...patch } });
  }

  protected handleThresholdsChange(thresholds: LoadTestThresholds): void {
    this.scheduleArtifactPatch({ thresholds });
  }

  protected handlePresetApply(event: {
    profile: LoadTestProfile;
    thresholds?: LoadTestThresholds;
  }): void {
    const patch: Parameters<LoadTestService['patchArtifact']>[1] = {
      profile: event.profile,
    };
    if (event.thresholds) {
      patch.thresholds = event.thresholds;
    }
    this.scheduleArtifactPatch(patch);
  }

  protected handleResultsViewChange(view: 'live' | 'history' | 'compare'): void {
    this.resultsView.set(view);
    this.scheduleTabUiPersist();
  }

  protected handleSelectedRunChange(runId: string | null): void {
    this.selectedRunId.set(runId);
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

  protected handleClearRuns(): void {
    const id = this.artifactId();
    if (!id) {
      return;
    }
    this.loadTest.clearRuns(id);
    this.selectedRunId.set(null);
    this.pinnedBaselineRunId.set(null);
    this.compareSelection.set(null);
    this.resultsView.set('live');
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
    this.loadTest.deleteRun(id, runId);
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

  protected handleOpenHistoryView(): void {
    this.resultsView.set('history');
    this.resultsPanelHidden.set(false);
    this.scheduleTabUiPersist();
  }

  protected handleDocsChange(docs: string): void {
    this.scheduleArtifactPatch({ docs });
  }

  protected handleOpenTargetRequest(): void {
    const artifact = this.artifact();
    if (!artifact || resolveLoadTestTargetSource(artifact) !== 'collection') {
      return;
    }
    const targetRequestId = artifact.targetRequestId;
    if (!targetRequestId) {
      return;
    }
    this.workspaceEditor.openResource({ resourceId: targetRequestId, kind: 'request' });
  }

  protected handleSectionSelect(section: LoadTestTabSectionId): void {
    if (section === this.activeSection()) {
      return;
    }
    this.activeSection.set(section);
    this.tabMotion.onSectionChange(section, {
      contentBlockCount: loadTestTabSectionBlockCount(section),
    });
    this.scheduleTabUiPersist();
  }

  protected handleRunToggle(): void {
    if (this.runActionPending()) {
      return;
    }

    const artifact = this.artifact();
    const profile = artifact?.profile;
    if (!profile) {
      return;
    }

    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.notifier.reportUnknown(
        new Error('Load tests require the Electron desktop app with HTTP execution enabled.'),
      );
      return;
    }

    this.runActionPending.set(true);

    if (this.running()) {
      this.runCancelled = true;
      void api
        .loadTestCancel()
        .then((snapshot) => {
          this.applyMetricsSnapshot(snapshot);
          this.finalizeRun(snapshot);
        })
        .finally(() => this.runActionPending.set(false));
      this.stopMetricsPolling();
      return;
    }

    if (!artifact || !isLoadTestTargetReady(artifact)) {
      this.runActionPending.set(false);
      this.notifier.reportUnknown(new Error('Configure a target request before starting a load test.'));
      this.activeSection.set('target');
      this.scheduleTabUiPersist();
      return;
    }

    const targetSource = resolveLoadTestTargetSource(artifact);
    const startOptions: LoadTestStartOptions = {
      targetSource,
      targetRequestId: targetSource === 'collection' ? artifact.targetRequestId : undefined,
      manualTarget: targetSource === 'manual' ? artifact.manualTarget : undefined,
      loadTestId: artifact.id,
      virtualUsers: profile.virtualUsers,
      durationSec: profile.durationSec,
      rampUpSec: profile.rampUpSec,
    };

    this.runCancelled = false;
    this.activeRunId = newTestingId();
    this.runStartedAt = new Date().toISOString();
    this.runWasActive = true;
    this.resultsView.set('live');
    this.selectedRunId.set(null);
    this.compareSelection.set(null);
    this.metrics.set(createStartingLoadTestRunMetrics());
    this.running.set(true);
    this.scheduleTabUiPersist();

    void api
      .loadTestStart(startOptions)
      .then((snapshot) => {
        this.applyMetricsSnapshot(snapshot);
        this.startMetricsPolling();
      })
      .catch((error: unknown) => {
        this.notifier.reportUnknown(error);
        this.resetLiveMetrics();
        this.resetRunTracking();
      })
      .finally(() => this.runActionPending.set(false));
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

  private applyMetricsSnapshot(snapshot: LoadTestRunMetrics): void {
    const wasRunning = this.running();
    this.metrics.set(snapshot);
    this.running.set(snapshot.running);

    if (wasRunning && !snapshot.running && this.runWasActive) {
      this.finalizeRun(snapshot);
    }
  }

  private finalizeRun(snapshot: LoadTestRunMetrics): void {
    const artifact = this.artifact();
    const artifactId = this.artifactId();
    const runId = this.activeRunId;
    const startedAt = this.runStartedAt;
    if (!artifact || !artifactId || !runId || !startedAt) {
      this.resetRunTracking();
      return;
    }

    const status = this.runCancelled ? 'cancelled' : 'passed';
    const record = createLoadTestRunRecord({
      id: runId,
      metrics: snapshot,
      profile: artifact.profile,
      thresholds: artifact.thresholds,
      startedAt,
      status,
    });

    this.loadTest.appendRun(artifactId, record);
    this.selectedRunId.set(runId);
    this.resetRunTracking();
  }

  private resetLiveMetrics(): void {
    this.stopMetricsPolling();
    this.running.set(false);
    this.metrics.set(createIdleLoadTestRunMetrics());
  }

  private resetRunTracking(): void {
    this.activeRunId = null;
    this.runStartedAt = null;
    this.runWasActive = false;
    this.runCancelled = false;
  }

  private async syncRunStateFromBackend(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      if ((this.artifact()?.runs.length ?? 0) === 0) {
        this.resetLiveMetrics();
      }
      return;
    }

    const [status, snapshot] = await Promise.all([api.loadTestStatus(), api.loadTestMetrics()]);
    this.applyMetricsSnapshot(snapshot);
    if (status.running) {
      this.startMetricsPolling();
    } else {
      this.stopMetricsPolling();
    }
  }

  private startMetricsPolling(): void {
    this.stopMetricsPolling();
    this.metricsPollTimer = setInterval(() => {
      void this.pollMetrics();
    }, METRICS_POLL_MS);
  }

  private stopMetricsPolling(): void {
    if (this.metricsPollTimer !== null) {
      clearInterval(this.metricsPollTimer);
      this.metricsPollTimer = null;
    }
  }

  private async pollMetrics(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.stopMetricsPolling();
      return;
    }
    const snapshot = await api.loadTestMetrics();
    this.applyMetricsSnapshot(snapshot);
    if (!snapshot.running) {
      this.stopMetricsPolling();
    }
  }

  private loadChromeChildCount(): number {
    let count = 1;
    if (this.useTitlebarLayout()) {
      count += 1;
    }
    return count;
  }

  private scheduleArtifactPatch(patch: Parameters<LoadTestService['patchArtifact']>[1]): void {
    const id = this.artifactId();
    if (!id) {
      return;
    }
    if (this.artifactSaveTimer !== null) {
      clearTimeout(this.artifactSaveTimer);
    }
    this.artifactSaveTimer = setTimeout(() => {
      this.artifactSaveTimer = null;
      this.loadTest.patchArtifact(id, patch);
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
    await this.configService.patchSession({
      workspace: {
        testing: {
          ...this.testingSession.navigationFields(),
          loadTestTabsById: {
            [resourceId]: {
              activeSection: this.activeSection(),
              resultsPanelHeightPx: this.resultsPanelHeight(),
              isResultsPanelHidden: this.resultsPanelHidden(),
              selectedRunId: this.selectedRunId(),
              pinnedBaselineRunId: this.pinnedBaselineRunId(),
              compareSelection: this.compareSelection(),
              resultsView: this.resultsView(),
            },
          },
        },
      },
    });
  }
}
