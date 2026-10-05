import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked, type AnimationCallbackEvent } from '@angular/core';
import {
  findServiceNode,
  flowHasDeviceNodes,
  normalizeRegressionSection,
  REGRESSION_SECTIONS,
  type FolderDocsMode,
  type RegressionPackEntry,
  type RegressionSection,
} from '@testrix/contracts';
import { TxButtonComponent, TxCheckComponent, TxEmptyStateComponent, TxHintComponent, TxInputComponent, TxSelectComponent, TxTagsInputComponent } from '@testrix/ui';

import { ConfirmDialogService } from '../../../core/confirm-dialog.service';
import { DesktopApiService } from '../../../core/desktop-api.service';
import { CollabStore } from '../../collab/collab.store';
import { EnvironmentsStore } from '../../environments/environments.store';
import { WorkbenchStore, type WorkbenchTab } from '../../workbench/workbench.store';
import { ServicesStore } from '../services.store';
import { DocsEditorComponent } from '../../collections/docs-editor.component';
import { runPaneEnter, runPaneLeave } from '../../../core/pane-slide-anim';
import { syncEntriesFromLinkedFolder } from './rg-flow-picker-tree';
import { RgOverviewPanelComponent } from './rg-overview-panel.component';
import { RgPackPanelComponent } from './rg-pack-panel.component';
import { RgRunsPanelComponent } from './rg-runs-panel.component';

interface SectionItem {
  readonly id: RegressionSection;
  readonly label: string;
}

const SECTION_ITEMS: readonly SectionItem[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'pack', label: 'Flows' },
  { id: 'settings', label: 'Settings' },
  { id: 'docs', label: 'Docs' },
];

const RESULTS_HANDLE_PX = 5;
const RESULTS_MIN_PX = 140;
const RESULTS_DEFAULT_PX = 320;
const RESULTS_AUTO_HIDE_PX = 120;

@Component({
  selector: 'tx-regression-editor',
  standalone: true,
  imports: [
    TxButtonComponent,
    TxCheckComponent,
    TxEmptyStateComponent,
    TxHintComponent,
    TxInputComponent,
    TxTagsInputComponent,
    TxSelectComponent,
    RgOverviewPanelComponent,
    RgPackPanelComponent,
    RgRunsPanelComponent,
    DocsEditorComponent,
  ],
  templateUrl: './regression-editor.component.html',
  styleUrl: './regression-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:flex;flex:1;min-height:0;' },
})
export class RegressionEditorComponent {
  readonly tab = input.required<WorkbenchTab>();
  readonly store = inject(ServicesStore);
  readonly workbench = inject(WorkbenchStore);
  private readonly desktop = inject(DesktopApiService);
  private readonly environments = inject(EnvironmentsStore);
  private readonly collab = inject(CollabStore);
  private readonly confirm = inject(ConfirmDialogService);
  private lastRenewAt = 0;

  readonly sectionSlideDir = signal<'left' | 'right' | null>(null);
  readonly docsMode = signal<FolderDocsMode>('split');
  readonly section = computed(() => normalizeRegressionSection(this.tab().serviceSection));
  readonly completionBanner = signal<{ readonly kind: 'success' | 'error'; readonly title: string } | null>(
    null,
  );
  readonly resultsHeightPx = signal(RESULTS_DEFAULT_PX);
  readonly resultsHidden = signal(false);
  readonly resizing = signal(false);
  readonly handleHeightPx = RESULTS_HANDLE_PX;

  readonly sections = SECTION_ITEMS;
  readonly regression = computed(() => this.store.findRegression(this.tab().nodeId));

  readonly isRunning = computed(() => {
    const id = this.regression()?.id;
    return !!id && this.store.regressionRunning() && this.store.regressionRunningId() === id;
  });

  readonly runProgressPercent = computed(() => {
    const { total, completed } = this.store.regressionProgress();
    if (!this.isRunning() || total <= 0)
      return 0;
    return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
  });

  readonly executionOptions = [
    { value: 'parallel', label: 'Parallel' },
    { value: 'sequential', label: 'Sequential' },
  ];

  readonly envOptions = computed(() => [
    { value: '', label: 'App active environment' },
    ...this.environments.items().map((item) => ({ value: item.id, label: item.name })),
  ]);

  readonly envName = computed(() => {
    const pack = this.regression();
    if (!pack)
      return '—';
    if (!pack.environmentId) {
      const active = this.environments.activeId();
      const found = this.environments.items().find((item) => item.id === active);
      return found ? `${found.name} (active)` : 'App active';
    }
    return this.environments.items().find((item) => item.id === pack.environmentId)?.name ?? 'Missing env';
  });

  /** A teammate's claim on this pack, if any. */
  readonly teamLock = computed(() => {
    const id = this.regression()?.id;
    const lock = id ? this.collab.lockFor(id) : null;
    return lock && !lock.isMine ? lock : null;
  });

  readonly lockedByTeam = computed(() => {
    const lock = this.teamLock();
    return Boolean(lock && !lock.isStale);
  });

  readonly staleLock = computed(() => {
    const lock = this.teamLock();
    return lock && lock.isStale ? lock : null;
  });

  readonly sharedRun = computed(() => {
    const id = this.regression()?.id;
    return id ? this.collab.latestRunFor(id) : null;
  });

  readonly collabShared = computed(() => this.collab.isShared());

  readonly lockProgress = computed(() => {
    const lock = this.teamLock();
    if (!lock || lock.total <= 0)
      return '';
    return `${lock.completed}/${lock.total}`;
  });

  readonly canRerunFailed = computed(() => {
    const run = this.regression()?.runs[0];
    return !!run && run.failed > 0 && !this.isRunning() && !this.lockedByTeam();
  });

  readonly failedRerunKeys = computed(() => {
    const run = this.regression()?.runs[0];
    if (!run)
      return [] as readonly string[];
    return run.entries
      .filter((entry) => entry.status === 'error')
      .map((entry) => `${entry.flowId}::${entry.scenarioId}`);
  });

  readonly linkedFlowCount = computed(() => {
    const pack = this.regression();
    if (!pack)
      return 0;
    return new Set(pack.entries.map((entry) => entry.flowId)).size;
  });

  /** True when any linked flow uses Device/emulator nodes (forces sequential runs). */
  readonly hasDeviceFlows = computed(() => {
    const pack = this.regression();
    if (!pack)
      return false;
    const flows = this.desktop.flows().items;
    for (const entry of pack.entries) {
      if (!entry.enabled)
        continue;
      const flow = findServiceNode(flows, entry.flowId);
      if (flow?.kind === 'artifact' && flowHasDeviceNodes(flow.scenarios))
        return true;
    }
    return false;
  });

  private lastBannerKey: string | null = null;
  private hydratedTabId: string | null = null;

  constructor() {
    effect(() => {
      const tab = this.tab();
      const next = normalizeRegressionSection(tab.serviceSection);
      if (tab.serviceSection !== next) {
        this.workbench.patchTab(tab.id, { serviceSection: next });
        return;
      }
      // Only hydrate dock chrome when the open tab identity changes.
      untracked(() => {
        if (this.hydratedTabId === tab.id)
          return;
        this.hydratedTabId = tab.id;
        this.sectionSlideDir.set(null);
        this.resultsHidden.set(
          tab.resultsDockHidden === true || this.workbench.isResultsDockHidden(tab.nodeId),
        );
      });
    });

    effect(() => {
      const packId = this.regression()?.id;
      const events = this.store.regressionEvents();
      const last = events[events.length - 1];
      if (!last || last.phase !== 'suite-done' || last.regressionId !== packId)
        return;
      const key = `${last.regressionId}:${last.message}:${events.length}`;
      if (key === this.lastBannerKey)
        return;
      this.lastBannerKey = key;
      const failed = /fail|cancel/i.test(last.message);
      this.completionBanner.set({
        kind: failed ? 'error' : 'success',
        title: last.message,
      });
      window.setTimeout(() => {
        if (this.lastBannerKey === key)
          this.completionBanner.set(null);
      }, 4200);
    });

    effect(() => {
      const pack = this.regression();
      const flowItems = this.desktop.flows().items;
      if (!pack?.linkedFolderId)
        return;
      void flowItems;
      void this.persistLinkedFolderSync(pack.id);
    });

    effect(() => {
      if (this.isRunning())
        this.setResultsHidden(false);
    });

    // Keeps this device's claim fresh so teammates see a live run, not a stale lock.
    effect(() => {
      const progress = this.store.regressionProgress();
      const packId = this.regression()?.id;
      if (!this.isRunning() || !packId)
        return;
      const now = Date.now();
      if (now - this.lastRenewAt < 15_000)
        return;
      this.lastRenewAt = now;
      untracked(() => {
        void this.collab.renewLock(packId, progress.completed, progress.total);
      });
    });
  }

  handleSection(id: RegressionSection): void {
    if (id === this.section())
      return;
    const current = REGRESSION_SECTIONS.indexOf(this.section());
    const next = REGRESSION_SECTIONS.indexOf(id);
    this.sectionSlideDir.set(next >= current ? 'right' : 'left');
    this.workbench.patchTab(this.tab().id, { serviceSection: id });
  }

  handlePaneEnter(event: AnimationCallbackEvent): void {
    runPaneEnter(event, this.sectionSlideDir());
  }

  handlePaneLeave(event: AnimationCallbackEvent): void {
    runPaneLeave(event, this.sectionSlideDir());
  }

  handleOpenResults(): void {
    this.setResultsHidden(false);
  }

  hideResults(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.setResultsHidden(true);
  }

  revealResults(): void {
    this.setResultsHidden(false);
  }

  handleResultsResizeStart(event: PointerEvent): void {
    event.preventDefault();
    const origin =
      (event.currentTarget instanceof HTMLElement ? event.currentTarget : null) ??
      (event.target instanceof HTMLElement ? event.target : null);
    const host = origin?.closest('.rg-tab');
    if (!(host instanceof HTMLElement))
      return;

    this.resizing.set(true);
    const startY = event.clientY;
    const startHeight = this.resultsHeightPx();
    const chrome = host.querySelector('.rg-tab__chrome');
    const chromeHeight =
      chrome instanceof HTMLElement ? Math.ceil(chrome.getBoundingClientRect().height) : 72;
    const maxHeight = Math.max(
      RESULTS_MIN_PX,
      Math.floor(host.getBoundingClientRect().height - RESULTS_HANDLE_PX - chromeHeight - 4),
    );
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMove = (moveEvent: PointerEvent): void => {
      if (!this.resizing())
        return;
      const next = Math.min(maxHeight, Math.max(RESULTS_MIN_PX, startHeight + (startY - moveEvent.clientY)));
      if (next <= RESULTS_AUTO_HIDE_PX) {
        this.setResultsHidden(true);
        cleanup();
        return;
      }
      this.resultsHeightPx.set(next);
    };

    const onUp = (): void => {
      cleanup();
    };

    const cleanup = (): void => {
      this.resizing.set(false);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  patchName(name: string): void {
    const pack = this.regression();
    if (!pack)
      return;
    void this.store.patchRegression(pack.id, { name });
    this.workbench.patchTab(this.tab().id, { title: name });
  }

  runPack(): void {
    void this.startRun();
  }

  cancelPack(): void {
    this.store.cancelRegression();
  }

  rerunFailed(): void {
    const keys = this.failedRerunKeys();
    if (keys.length === 0)
      return;
    void this.startRun({ onlyKeys: keys });
  }

  /** Opens the pack a teammate is running so the team can follow along. */
  watchTeamRun(): void {
    const packId = this.regression()?.id;
    if (packId)
      this.collab.watchRun(packId);
  }

  /** Claims a pack whose owner stopped renewing, after a confirm. */
  async takeOverRun(): Promise<void> {
    const pack = this.regression();
    const lock = this.staleLock();
    if (!pack || !lock)
      return;
    const ok = await this.confirm.ask({
      title: `Take over ${pack.name}?`,
      body: `${lock.owner}'s run stopped reporting. Taking over lets you run this pack now.`,
      confirmLabel: 'Take over',
      cancelLabel: 'Cancel',
    });
    if (!ok)
      return;
    const claimed = await this.collab.takeOverLock({
      packId: pack.id,
      packName: pack.name,
      environment: this.envName(),
    });
    if (claimed)
      void this.startRun(undefined, true);
  }

  setEntries(entries: readonly RegressionPackEntry[]): void {
    const pack = this.regression();
    if (!pack)
      return;
    void this.store.patchRegression(pack.id, { entries: [...entries] });
  }

  setLinkedFolderId(folderId: string | null): void {
    const pack = this.regression();
    if (!pack)
      return;
    const entries = folderId
      ? [...syncEntriesFromLinkedFolder(pack.entries, folderId, this.flowTree())]
      : [...pack.entries];
    void this.store.patchRegression(pack.id, {
      linkedFolderId: folderId,
      ...(folderId ? { entries } : {}),
    });
  }

  setEnvironment(value: string): void {
    const pack = this.regression();
    if (!pack)
      return;
    void this.store.patchRegression(pack.id, { environmentId: value || null });
  }

  setExecutionMode(value: string): void {
    const pack = this.regression();
    if (!pack)
      return;
    void this.store.patchRegression(pack.id, {
      executionMode: value === 'sequential' ? 'sequential' : 'parallel',
    });
  }

  setMaxParallelism(value: string): void {
    const pack = this.regression();
    if (!pack)
      return;
    const parsed = Number(value);
    const maxParallelism = Number.isFinite(parsed) ? Math.max(1, Math.min(16, Math.round(parsed))) : 4;
    void this.store.patchRegression(pack.id, { maxParallelism });
  }

  setStopOnFirstFailure(value: boolean): void {
    const pack = this.regression();
    if (!pack)
      return;
    void this.store.patchRegression(pack.id, { stopOnFirstFailure: value });
  }

  setRetryFailed(value: string): void {
    const pack = this.regression();
    if (!pack)
      return;
    const parsed = Number(value);
    const retryFailed = Number.isFinite(parsed) ? Math.max(0, Math.min(3, Math.round(parsed))) : 0;
    void this.store.patchRegression(pack.id, { retryFailed });
  }

  setDelayBetweenFlows(value: string): void {
    const pack = this.regression();
    if (!pack)
      return;
    const parsed = Number(value);
    const delayBetweenFlowsMs = Number.isFinite(parsed) ? Math.max(0, Math.min(60_000, Math.round(parsed))) : 0;
    void this.store.patchRegression(pack.id, { delayBetweenFlowsMs });
  }

  setShuffleOrder(value: boolean): void {
    const pack = this.regression();
    if (!pack)
      return;
    void this.store.patchRegression(pack.id, { shuffleOrder: value });
  }

  setMaxErrorRate(value: string): void {
    const pack = this.regression();
    if (!pack)
      return;
    const pct = Number(value);
    const rate = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) / 100 : 0;
    void this.store.patchRegression(pack.id, { maxErrorRate: rate });
  }

  setRelease(value: string): void {
    const pack = this.regression();
    if (!pack)
      return;
    void this.store.patchRegression(pack.id, { release: value });
  }

  setDescription(value: string): void {
    const pack = this.regression();
    if (!pack)
      return;
    void this.store.patchRegression(pack.id, { description: value });
  }

  setDocs(value: string): void {
    const pack = this.regression();
    if (!pack)
      return;
    void this.store.patchRegression(pack.id, { docs: value });
  }

  handleDocsMode(mode: FolderDocsMode): void {
    this.docsMode.set(mode);
  }

  setTags(tags: readonly string[]): void {
    const pack = this.regression();
    if (!pack)
      return;
    void this.store.patchRegression(pack.id, { tags: [...tags] });
  }

  promoteGolden(runId: string): void {
    const pack = this.regression();
    if (!pack)
      return;
    void this.store.patchRegression(pack.id, { goldenRunId: runId });
  }

  clearHistory(): void {
    const pack = this.regression();
    if (!pack)
      return;
    void this.store.patchRegression(pack.id, { runs: [], goldenRunId: null });
  }

  errorRatePercent(rate: number): number {
    return Math.round(Math.max(0, Math.min(1, rate)) * 100);
  }

  flowTree() {
    return this.desktop.flows().items;
  }

  /**
   * Claims the pack, runs it, then publishes the result and releases the claim so
   * only one person runs a pack at a time.
   */
  private async startRun(
    options?: { readonly onlyKeys?: readonly string[] },
    claimed = false,
  ): Promise<void> {
    const pack = this.regression();
    if (!pack || this.isRunning() || (this.lockedByTeam() && !claimed))
      return;
    if (!claimed) {
      const ok = await this.collab.acquireLock({
        packId: pack.id,
        packName: pack.name,
        environment: this.envName(),
      });
      if (!ok)
        return;
    }
    this.setResultsHidden(false);
    this.lastRenewAt = Date.now();
    const startedAt = new Date().toISOString();
    try {
      await this.syncLinkedFolderThenRun(pack.id, options);
    } finally {
      await this.publishRun(pack.id, startedAt);
      await this.collab.releaseLock(pack.id);
    }
  }

  private async publishRun(packId: string, startedAt: string): Promise<void> {
    const pack = this.store.findRegression(packId);
    const run = pack?.runs[0];
    if (!pack || !run)
      return;
    await this.desktop.api.collab.publishRun({
      packId: pack.id,
      packName: pack.name,
      environment: this.envName(),
      status: run.status === 'passed' ? 'passed' : run.status === 'cancelled' ? 'cancelled' : 'failed',
      startedAt,
      finishedAt: run.at,
      durationMs: run.durationMs,
      passed: run.passed,
      failed: run.failed,
      total: run.passed + run.failed + run.skipped,
      failedNames: run.entries
        .filter((entry) => entry.status === 'error')
        .map((entry) => `${entry.flowName} · ${entry.scenarioName}`),
    });
  }

  private async syncLinkedFolderThenRun(
    packId: string,
    options?: { readonly onlyKeys?: readonly string[] },
  ): Promise<void> {
    await this.persistLinkedFolderSync(packId);
    await this.store.runRegression(packId, options);
  }

  private async persistLinkedFolderSync(packId: string): Promise<void> {
    const pack = this.store.findRegression(packId);
    if (!pack?.linkedFolderId)
      return;
    const next = syncEntriesFromLinkedFolder(pack.entries, pack.linkedFolderId, this.flowTree());
    const same =
      next.length === pack.entries.length &&
      next.every(
        (entry, index) =>
          entry.flowId === pack.entries[index]?.flowId &&
          entry.scenarioId === pack.entries[index]?.scenarioId &&
          entry.enabled === pack.entries[index]?.enabled,
      );
    if (same)
      return;
    await this.store.patchRegression(packId, { entries: [...next] });
  }

  private setResultsHidden(hidden: boolean): void {
    if (this.resultsHidden() === hidden)
      return;
    this.resultsHidden.set(hidden);
    const tab = this.tab();
    this.workbench.setResultsDockHidden(tab.nodeId, hidden);
    this.workbench.patchTab(tab.id, { resultsDockHidden: hidden });
  }
}
