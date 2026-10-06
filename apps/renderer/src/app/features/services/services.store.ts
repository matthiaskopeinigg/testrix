import { Injectable, computed, inject, signal } from '@angular/core';
import {
  collectServiceArtifactIds,
  defaultServiceSection,
  cloneServiceSubtree,
  duplicateServiceNode,
  emptyFlowArtifact,
  emptyInterceptArtifact,
  emptyListenerArtifact,
  emptyLoadArtifact,
  emptyMockArtifact,
  emptyRegressionArtifact,
  emptyServiceFolder,
  extractServiceNode,
  filterServiceTree,
  findServiceNode,
  findServiceParentIndex,
  insertServiceChild,
  insertServiceChildAt,
  moveServiceNode,
  patchServiceArtifact,
  removeServiceNode,
  renameServiceNode,
  SERVICE_ARTIFACT_TAB_KIND,
  serviceById,
  emptyFlowScenario,
  ensureFlowScenarioTerminals,
  flowDetailHasExchange,
  newFlowScenarioId,
  buildTutorialFlows,
  mapServiceTree,
  collectServiceTreeTags,
  TUTORIAL_API_SIMPLE_FLOW_ID,
  TUTORIAL_CONTROL_FLOW_FLOW_ID,
  TUTORIAL_DEVICE_SIMPLE_FLOW_ID,
  TUTORIAL_E2E_SIMPLE_FLOW_ID,
  TUTORIAL_FOLDER_ID,
  TUTORIAL_NODE_REFERENCE_FLOW_ID,
  type FlowNode,
  type FlowRunEventDetail,
  type FlowScenario,
  type FlowsFile,
  type InterceptFile,
  type InterceptHitEvent,
  type InterceptNode,
  type ListenerHitEvent,
  type ListenerNode,
  type ListenersFile,
  type LoadFile,
  type LoadMetrics,
  type LoadNode,
  type MockActivityEvent,
  type MockNode,
  type MockServerOptions,
  type MocksFile,
  type RegressionEntryStatus,
  type RegressionFlowTimelineEntry,
  type RegressionMetricsSample,
  type RegressionRunEntry,
  type RegressionSuiteEvent,
  type RegressionsFile,
  type RegressionNode,
  type ServiceId,
  type ServiceRuntimeStatus,
  type ServiceTreeNode,
  type SessionFlowLastRun,
  type SessionFlowUi,
  type SessionServiceSidebar,
  prependFlowRun,
  prependListenerActivity,
  prependInterceptActivity,
  newFlowRunId,
  newListenerActivityId,
  newInterceptActivityId,
  FLOW_INSPECTOR_DEFAULT_WIDTH,
  FLOW_INSPECTOR_WIDE_DEFAULT_WIDTH,
  clampFlowInspectorWidth,
} from '@testrix/contracts';

import { DesktopApiService } from '../../core/desktop-api.service';
import { uniquePasteName } from '../../core/unique-paste-name';
import {
  applyPointerSelect,
  emptySelection,
  type SelectionEntry,
} from '../../core/range-select';
import { WorkbenchStore, type WorkbenchTab } from '../workbench/workbench.store';
import { flattenServiceTreeRows, SERVICES_ROOT_ID, type DropSlot } from './services-drop-model';
import {
  buildRegressionLiveMetrics,
  capFlowExchangeDetail,
  EMPTY_STATUS,
  ensureFoldersFirst,
  flowRunKey,
  insertServiceChildrenAt,
  isServiceTreeDescendant,
  sortTree,
} from './services-store-helpers';

export type ServiceSort = 'manual' | 'name' | 'updated';

export interface ServiceRestoreEntry {
  readonly serviceId: ServiceId;
  readonly node: ServiceTreeNode<Record<string, unknown>>;
  readonly parentId: string | null;
  readonly index: number;
}

export interface ServiceDeferredDelete {
  readonly serviceId: ServiceId;
  readonly removedIds: readonly string[];
  readonly restore: () => void;
  readonly commit: () => Promise<void>;
}

interface RunCheckpoint {
  readonly savedAt: string;
  readonly kind: 'flow' | 'load';
  readonly json: string;
}

@Injectable({ providedIn: 'root' })
export class ServicesStore {
  private readonly desktop = inject(DesktopApiService);
  private readonly workbench = inject(WorkbenchStore);

  readonly activeService = signal<ServiceId | null>(null);
  readonly paneSlideDir = signal<'left' | 'right' | null>(null);
  readonly searchByService = signal<Record<string, string>>({});
  readonly expandedByService = signal<Record<string, readonly string[]>>({});
  readonly sortByService = signal<Record<string, ServiceSort>>({});
  readonly tagsByService = signal<Record<string, readonly string[]>>({});
  readonly loadStatus = signal<ServiceRuntimeStatus>(EMPTY_STATUS);
  readonly loadMetrics = signal<LoadMetrics | null>(null);
  readonly mockStatus = signal<ServiceRuntimeStatus>(EMPTY_STATUS);
  readonly mockActivity = signal<readonly MockActivityEvent[]>([]);
  readonly interceptHits = signal<readonly InterceptHitEvent[]>([]);
  readonly activeListenerId = signal<string | null>(null);
  readonly listenerStatus = signal<ServiceRuntimeStatus>(EMPTY_STATUS);
  readonly activeInterceptRuleId = signal<string | null>(null);
  readonly interceptStatus = signal<ServiceRuntimeStatus>(EMPTY_STATUS);
  readonly flowStepStatuses = signal<Record<string, 'waiting' | 'running' | 'ok' | 'error' | 'skipped' | 'cancelled'>>({});
  readonly flowStepMessages = signal<Record<string, string>>({});
  /** Last data-row index seen per step (0-based). */
  readonly flowStepRowIndex = signal<Record<string, number>>({});
  /** Bumps on each "running" event so retry pulses can re-animate. */
  readonly flowStepPulse = signal<Record<string, number>>({});
  readonly flowRunning = signal(false);
  /** Latest HTTP/DB exchange detail per step (for the canvas viewer button). */
  readonly flowStepExchanges = signal<Record<string, FlowRunEventDetail>>({});
  /** Flow+scenario whose live or restored run is currently on the canvas. */
  private flowRunViewKey = signal<string | null>(null);
  /** Flow+scenario currently executing (for persist on finish). */
  private flowRunContext = signal<{ readonly flowId: string; readonly scenarioId: string } | null>(null);
  readonly regressionRunning = signal(false);
  readonly regressionRunningId = signal<string | null>(null);
  readonly regressionLog = signal('');
  readonly regressionEvents = signal<readonly RegressionSuiteEvent[]>([]);
  readonly regressionProgress = signal<{ readonly total: number; readonly completed: number }>({
    total: 0,
    completed: 0,
  });
  /** Latest live metrics snapshot for the running suite (null when idle). */
  readonly regressionLiveMetrics = signal<RegressionMetricsSample | null>(null);
  /** Live metrics time-series for driving charts while a suite runs. */
  readonly regressionLiveSamples = signal<readonly RegressionMetricsSample[]>([]);
  /** Live Gantt timeline for the running suite. */
  readonly regressionLiveTimeline = signal<readonly RegressionFlowTimelineEntry[]>([]);
  /** Completed entries so far in the running suite (for the live table). */
  readonly regressionLiveEntries = signal<readonly RegressionRunEntry[]>([]);
  readonly dragServiceId = signal<ServiceId | null>(null);
  readonly dragNode = signal<ServiceTreeNode<Record<string, unknown>> | null>(null);
  readonly dragIds = signal<readonly string[]>([]);
  readonly dropTarget = signal<DropSlot | null>(null);
  readonly lastMovedId = signal<string | null>(null);
  /** Multi-select highlight in the drilled-in service tree (separate from open tab). */
  readonly selectedIds = signal<readonly string[]>([]);
  readonly selectionAnchorId = signal<string | null>(null);
  private moveAnimTimer: ReturnType<typeof setTimeout> | null = null;
  private flowsSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private flowsSaveInFlight: Promise<void> | null = null;
  private static readonly FLOWS_SAVE_DEBOUNCE_MS = 400;
  private listenerActivitySaveTimer: ReturnType<typeof setTimeout> | null = null;
  private interceptActivitySaveTimer: ReturnType<typeof setTimeout> | null = null;
  private runCheckpointTimer: ReturnType<typeof setTimeout> | null = null;
  private runCheckpointArtifactId: string | null = null;
  private activeLoadRunId = signal<string | null>(null);
  /** Selected scenario per flow artifact. */
  readonly scenarioByFlow = signal<Record<string, string>>({});
  /** Per-flow editor chrome (outline, selection, section) — survives tab close. */
  readonly flowUiById = signal<Record<string, SessionFlowUi>>({});
  /** Throttled crash-recovery snapshots for in-progress flow/load runs (session-persisted). */
  readonly runCheckpointsByArtifactId = signal<Record<string, RunCheckpoint>>({});
  /** Flow Design inspector widths (session-persisted). */
  readonly flowInspectorWidth = signal(FLOW_INSPECTOR_DEFAULT_WIDTH);
  readonly flowInspectorWideWidth = signal(FLOW_INSPECTOR_WIDE_DEFAULT_WIDTH);

  readonly title = computed(() => {
    const id = this.activeService();
    return id ? (serviceById(id)?.label ?? 'Services') : 'Services';
  });

  constructor() {
    this.desktop.api.services.onLoadMetrics((metrics) => {
      // Replace rather than mutate so zoneless CD always sees a new reference.
      this.loadMetrics.set({
        ...metrics,
        samples: [...metrics.samples],
      });
      const loadId = this.activeLoadRunId();
      if (loadId && metrics.running)
        this.scheduleRunCheckpoint(loadId, 'load', this.loadCheckpointPayload());
      if (loadId && !metrics.running) {
        this.clearRunCheckpoint(loadId);
        this.activeLoadRunId.set(null);
      }
    });
    this.desktop.api.services.onFlowEvent((event) => {
      this.flowStepStatuses.update((map) => ({ ...map, [event.stepId]: event.status }));
      this.flowStepRowIndex.update((map) => ({ ...map, [event.stepId]: event.rowIndex }));
      if (event.status === 'running')
        this.flowStepPulse.update((map) => ({ ...map, [event.stepId]: (map[event.stepId] ?? 0) + 1 }));
      this.flowStepMessages.update((map) => {
        if (event.status === 'error' && event.message.trim())
          return { ...map, [event.stepId]: event.message };
        if (event.status === 'running' && event.message.trim())
          return { ...map, [event.stepId]: event.message };
        const next = { ...map };
        delete next[event.stepId];
        return next;
      });
      if (event.detail && flowDetailHasExchange(event.detail)) {
        this.flowStepExchanges.update((map) => ({
          ...map,
          [event.stepId]: event.detail!,
        }));
        // Hit attached after arm (Listen/Intercept) — nudge the card so Exchange appears.
        this.flowStepPulse.update((map) => ({
          ...map,
          [event.stepId]: (map[event.stepId] ?? 0) + 1,
        }));
      }
      const ctx = this.flowRunContext();
      if (this.flowRunning() && ctx?.flowId)
        this.scheduleRunCheckpoint(ctx.flowId, 'flow', this.flowCheckpointPayload(ctx));
    });
    this.desktop.api.services.onRegressionEvent((event) => {
      this.regressionLog.update((text) => `${text}${event.message}\n`.slice(-6000));
      this.regressionEvents.update((list) => [...list, event].slice(-200));
      if (typeof event.total === 'number' || typeof event.completed === 'number') {
        this.regressionProgress.set({
          total: event.total ?? this.regressionProgress().total,
          completed: event.completed ?? this.regressionProgress().completed,
        });
      }
      if (event.phase === 'suite-start') {
        this.regressionRunning.set(true);
        this.regressionRunningId.set(event.regressionId);
        this.regressionLiveEntries.set([]);
        this.regressionLiveSamples.set([]);
        this.regressionLiveTimeline.set([]);
        this.regressionLiveMetrics.set(null);
      }
      if (event.samples)
        this.regressionLiveSamples.set([...event.samples]);
      if (event.flowTimeline)
        this.regressionLiveTimeline.set([...event.flowTimeline]);
      this.regressionLiveMetrics.set(buildRegressionLiveMetrics(event));
      const entry = event.entry;
      if (event.phase === 'entry-end' && entry && entry.status !== 'running') {
        const status: RegressionEntryStatus = entry.status;
        this.regressionLiveEntries.update((list) => [
          ...list,
          {
            flowId: entry.flowId,
            flowName: entry.flowName,
            scenarioId: entry.scenarioId,
            scenarioName: entry.scenarioName,
            status,
            durationMs: entry.durationMs,
            error: entry.error,
          },
        ]);
      }
      if (event.phase === 'suite-done') {
        this.regressionRunning.set(false);
        this.regressionRunningId.set(null);
        void this.desktop.api.services.regressions.get().then((file) => this.desktop.regressions.set(file));
      }
    });
    this.desktop.api.services.onMocksActivity((event) => {
      this.mockActivity.update((list) => [...list, event].slice(-200));
    });
    this.desktop.api.services.onListenerHit((event) => {
      this.appendListenerActivity(event);
    });
    this.desktop.api.services.onListenerStatus((status) => {
      this.listenerStatus.set(status);
      if (!status.running)
        this.activeListenerId.set(null);
    });
    this.desktop.api.services.onInterceptHit((event) => {
      this.interceptHits.update((list) => [...list, event].slice(-500));
      this.appendInterceptActivity(event);
    });
    this.desktop.api.services.onInterceptStatus((status) => {
      this.interceptStatus.set(status);
      if (!status.running)
        this.activeInterceptRuleId.set(null);
    });
  }

  hydrateFromSession(
    activeService: ServiceId | null,
    sidebar: Record<string, SessionServiceSidebar>,
    flowUiById: Record<string, SessionFlowUi> = {},
    flowInspectorWidth = FLOW_INSPECTOR_DEFAULT_WIDTH,
    flowInspectorWideWidth = FLOW_INSPECTOR_WIDE_DEFAULT_WIDTH,
  ): void {
    this.activeService.set(activeService);
    const search: Record<string, string> = {};
    const expanded: Record<string, readonly string[]> = {};
    const sort: Record<string, ServiceSort> = {};
    const tags: Record<string, readonly string[]> = {};
    for (const [id, prefs] of Object.entries(sidebar ?? {})) {
      search[id] = prefs.search;
      expanded[id] = prefs.expandedIds;
      sort[id] = prefs.sort;
      tags[id] = prefs.tags ?? [];
    }
    this.searchByService.set(search);
    this.expandedByService.set(expanded);
    this.sortByService.set(sort);
    this.tagsByService.set(tags);
    this.flowUiById.set(flowUiById ?? {});
    this.flowInspectorWidth.set(clampFlowInspectorWidth(flowInspectorWidth));
    this.flowInspectorWideWidth.set(clampFlowInspectorWidth(flowInspectorWideWidth));
    const scenarios: Record<string, string> = {};
    for (const [flowId, ui] of Object.entries(flowUiById ?? {})) {
      if (ui.scenarioId)
        scenarios[flowId] = ui.scenarioId;
    }
    if (Object.keys(scenarios).length > 0)
      this.scenarioByFlow.update((map) => ({ ...map, ...scenarios }));
  }

  hydrateRunCheckpoints(map: Record<string, RunCheckpoint> = {}): void {
    this.runCheckpointsByArtifactId.set({ ...map });
  }

  runCheckpointsPatch(): Record<string, RunCheckpoint> {
    return { ...this.runCheckpointsByArtifactId() };
  }

  runCheckpoint(artifactId: string): RunCheckpoint | null {
    return this.runCheckpointsByArtifactId()[artifactId] ?? null;
  }

  clearRunCheckpoint(artifactId: string): void {
    if (!artifactId)
      return;
    this.runCheckpointsByArtifactId.update((map) => {
      const next = { ...map };
      delete next[artifactId];
      return next;
    });
  }

  restoreFlowRunCheckpoint(flowId: string): boolean {
    const checkpoint = this.runCheckpoint(flowId);
    if (!checkpoint || checkpoint.kind !== 'flow')
      return false;
    try {
      const payload = JSON.parse(checkpoint.json) as {
        readonly scenarioId?: string;
        readonly snapshot?: SessionFlowLastRun;
      };
      if (payload.scenarioId)
        this.selectScenario(flowId, payload.scenarioId);
      if (payload.snapshot)
        this.applyFlowRunSnapshot(payload.snapshot);
      return true;
    } catch {
      return false;
    }
  }

  restoreLoadRunCheckpoint(loadId: string): boolean {
    const checkpoint = this.runCheckpoint(loadId);
    if (!checkpoint || checkpoint.kind !== 'load')
      return false;
    try {
      const payload = JSON.parse(checkpoint.json) as { readonly metrics?: LoadMetrics | null };
      if (payload.metrics)
        this.loadMetrics.set({ ...payload.metrics, samples: [...(payload.metrics.samples ?? [])] });
      return true;
    } catch {
      return false;
    }
  }

  sessionPatch(): {
    activeService: ServiceId | null;
    serviceSidebar: Record<string, SessionServiceSidebar>;
    flowUiById: Record<string, SessionFlowUi>;
    flowInspectorWidth: number;
    flowInspectorWideWidth: number;
    runCheckpointsByArtifactId: Record<string, RunCheckpoint>;
  } {
    const serviceSidebar: Record<string, SessionServiceSidebar> = {};
    const ids: ServiceId[] = ['regression', 'flows', 'emulator', 'load', 'mocks', 'listeners', 'intercept'];
    for (const id of ids) {
      serviceSidebar[id] = {
        search: this.searchByService()[id] ?? '',
        expandedIds: [...(this.expandedByService()[id] ?? [])],
        sort: this.sortByService()[id] ?? 'manual',
        tags: [...(this.tagsByService()[id] ?? [])],
      };
    }
    return {
      activeService: this.activeService(),
      serviceSidebar,
      flowUiById: { ...this.flowUiById() },
      flowInspectorWidth: clampFlowInspectorWidth(this.flowInspectorWidth()),
      flowInspectorWideWidth: clampFlowInspectorWidth(this.flowInspectorWideWidth()),
      runCheckpointsByArtifactId: this.runCheckpointsPatch(),
    };
  }

  private scheduleRunCheckpoint(artifactId: string, kind: RunCheckpoint['kind'], payload: unknown): void {
    if (!artifactId)
      return;
    this.runCheckpointArtifactId = artifactId;
    if (this.runCheckpointTimer)
      return;
    this.runCheckpointTimer = setTimeout(() => {
      this.runCheckpointTimer = null;
      const id = this.runCheckpointArtifactId;
      if (!id)
        return;
      this.runCheckpointsByArtifactId.update((map) => ({
        ...map,
        [id]: {
          savedAt: new Date().toISOString(),
          kind,
          json: JSON.stringify(payload),
        },
      }));
    }, 2000);
  }

  private flowCheckpointPayload(context: { readonly flowId: string; readonly scenarioId: string }): unknown {
    const statuses = this.flowStepStatuses();
    if (Object.keys(statuses).length === 0)
      return { scenarioId: context.scenarioId };
    const flow = this.findFlow(context.flowId);
    const scenario = flow?.scenarios.find((item) => item.id === context.scenarioId);
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let cancelled = 0;
    for (const status of Object.values(statuses)) {
      if (status === 'ok')
        passed += 1;
      else if (status === 'error')
        failed += 1;
      else if (status === 'skipped')
        skipped += 1;
      else if (status === 'cancelled')
        cancelled += 1;
    }
    const snapshot: SessionFlowLastRun = {
      id: newFlowRunId(),
      at: new Date().toISOString(),
      scenarioId: context.scenarioId,
      scenarioName: scenario?.name ?? '',
      passed,
      failed,
      skipped,
      cancelled,
      statuses: { ...statuses },
      messages: { ...this.flowStepMessages() },
      exchanges: Object.fromEntries(
        Object.entries(this.flowStepExchanges()).map(([stepId, detail]) => [
          stepId,
          capFlowExchangeDetail(detail),
        ]),
      ),
    };
    return { scenarioId: context.scenarioId, snapshot };
  }

  private loadCheckpointPayload(): unknown {
    const metrics = this.loadMetrics();
    return { metrics: metrics ? { ...metrics, samples: [...metrics.samples] } : null };
  }

  setFlowInspectorWidth(width: number, wide: boolean): void {
    const next = clampFlowInspectorWidth(width);
    if (wide)
      this.flowInspectorWideWidth.set(next);
    else
      this.flowInspectorWidth.set(next);
  }

  flowUi(flowId: string): SessionFlowUi {
    return this.flowUiById()[flowId] ?? { outlineOpen: false, selectedNodeIds: [], runHistoryByScenarioId: {} };
  }

  patchFlowUi(flowId: string, patch: Partial<SessionFlowUi>): void {
    this.flowUiById.update((map) => {
      const current = map[flowId] ?? { outlineOpen: false, selectedNodeIds: [], runHistoryByScenarioId: {} };
      return { ...map, [flowId]: { ...current, ...patch } };
    });
    if (patch.scenarioId)
      this.scenarioByFlow.update((map) => ({ ...map, [flowId]: patch.scenarioId! }));
  }

  /** Newest-first run history for one scenario (empty when none). */
  flowRunHistory(flowId: string, scenarioId?: string | null): readonly SessionFlowLastRun[] {
    const history = this.flowUi(flowId).runHistoryByScenarioId ?? {};
    if (scenarioId)
      return history[scenarioId] ?? [];
    return Object.values(history).flat().sort((a, b) => b.at.localeCompare(a.at));
  }

  /** Applies a persisted run onto the Design canvas. */
  applyFlowRun(flowId: string, snapshot: SessionFlowLastRun): void {
    if (this.flowRunning())
      return;
    if (snapshot.scenarioId)
      this.scenarioByFlow.update((map) => ({ ...map, [flowId]: snapshot.scenarioId }));
    this.flowRunViewKey.set(flowRunKey(flowId, snapshot.scenarioId || this.activeScenarioId(flowId) || ''));
    this.applyFlowRunSnapshot(snapshot);
  }

  clearFlowRunHistory(flowId: string, scenarioId?: string | null): void {
    const history = { ...(this.flowUi(flowId).runHistoryByScenarioId ?? {}) };
    if (scenarioId)
      delete history[scenarioId];
    else
      for (const key of Object.keys(history))
        delete history[key];
    this.patchFlowUi(flowId, { runHistoryByScenarioId: history });
    if (!this.flowRunning())
      this.clearFlowRunUi();
  }

  artifactIds(): {
    flow: Set<string>;
    load: Set<string>;
    regression: Set<string>;
    'mock-endpoint': Set<string>;
    'listener-session': Set<string>;
    'intercept-rule': Set<string>;
  } {
    return {
      flow: new Set(collectServiceArtifactIds(this.desktop.flows().items)),
      load: new Set(collectServiceArtifactIds(this.desktop.load().items)),
      regression: new Set(collectServiceArtifactIds(this.desktop.regressions().items)),
      'mock-endpoint': new Set(collectServiceArtifactIds(this.desktop.mocks().items)),
      'listener-session': new Set(collectServiceArtifactIds(this.desktop.listeners().items)),
      'intercept-rule': new Set(collectServiceArtifactIds(this.desktop.intercept().items)),
    };
  }

  drillIn(id: ServiceId): void {
    this.paneSlideDir.set('right');
    this.activeService.set(id);
    this.clearSelection();
  }

  back(): void {
    this.paneSlideDir.set('left');
    this.activeService.set(null);
    this.clearSelection();
  }

  search(id: ServiceId): string {
    return this.searchByService()[id] ?? '';
  }

  setSearch(id: ServiceId, value: string): void {
    this.searchByService.update((map) => ({ ...map, [id]: value }));
  }

  expanded(id: ServiceId): readonly string[] {
    return this.expandedByService()[id] ?? [];
  }

  toggleExpanded(id: ServiceId, folderId: string): void {
    this.expandedByService.update((map) => {
      const current = new Set(map[id] ?? []);
      if (current.has(folderId))
        current.delete(folderId);
      else
        current.add(folderId);
      return { ...map, [id]: [...current] };
    });
  }

  sort(id: ServiceId): ServiceSort {
    return this.sortByService()[id] ?? 'manual';
  }

  setSort(id: ServiceId, sort: ServiceSort): void {
    this.sortByService.update((map) => ({ ...map, [id]: sort }));
  }

  cycleSort(id: ServiceId): void {
    const current = this.sort(id);
    const next: ServiceSort =
      current === 'manual' ? 'name' : current === 'name' ? 'updated' : 'manual';
    this.setSort(id, next);
  }

  tagFilters(id: ServiceId): readonly string[] {
    return this.tagsByService()[id] ?? [];
  }

  isTagFilterActive(id: ServiceId): boolean {
    return this.tagFilters(id).length > 0;
  }

  availableTags(id: ServiceId): readonly string[] {
    return collectServiceTreeTags(this.rawTree(id));
  }

  toggleTagFilter(id: ServiceId, tag: string): void {
    const key = tag.trim();
    if (!key)
      return;
    this.tagsByService.update((map) => {
      const current = new Set(map[id] ?? []);
      if (current.has(key))
        current.delete(key);
      else
        current.add(key);
      return { ...map, [id]: [...current] };
    });
  }

  clearTagFilters(id: ServiceId): void {
    this.tagsByService.update((map) => ({ ...map, [id]: [] }));
  }

  visibleTree(id: ServiceId): readonly ServiceTreeNode<Record<string, unknown>>[] {
    const query = this.search(id);
    const sort = this.sort(id);
    const raw = this.rawTree(id);
    const tags = id === 'flows' ? this.tagFilters(id) : [];
    return sortTree(filterServiceTree(raw, query, { tags }), sort) as ServiceTreeNode<
      Record<string, unknown>
    >[];
  }

  /** Visible row ids in tree order (expanded folders only). */
  visibleIds(serviceId: ServiceId): readonly string[] {
    const expanded = new Set(this.expanded(serviceId));
    return flattenServiceTreeRows(this.visibleTree(serviceId), (id) => expanded.has(id)).map(
      (row) => row.id,
    );
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  applyPointerSelect(
    serviceId: ServiceId,
    targetId: string,
    event: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean },
  ): SelectionEntry {
    const next = applyPointerSelect({
      event,
      visibleIds: this.visibleIds(serviceId),
      selectedIds: this.selectedIds(),
      anchorId: this.selectionAnchorId(),
      targetId,
    });
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);
    return next;
  }

  selectAllVisible(serviceId: ServiceId): void {
    const ids = this.visibleIds(serviceId);
    this.selectedIds.set(ids);
    this.selectionAnchorId.set(ids[0] ?? null);
  }

  clearSelection(): void {
    const next = emptySelection();
    this.selectedIds.set(next.ids);
    this.selectionAnchorId.set(next.anchorId);
  }

  /** Prefer the multi-set; otherwise the open artifact. */
  selectionOrActive(serviceId: ServiceId): readonly string[] {
    const selected = this.selectedIds();
    if (selected.length > 0)
      return selected;
    const active = this.activeArtifactId(serviceId);
    return active ? [active] : [];
  }

  /**
   * Ids to move for a drag starting on `sourceId`.
   * When the source is already selected, returns the multi-set in visible-tree order;
   * otherwise selects the source alone.
   */
  dragIdsFor(serviceId: ServiceId, sourceId: string): readonly string[] {
    const selected = this.selectedIds();
    if (selected.includes(sourceId)) {
      return flattenServiceTreeRows(this.visibleTree(serviceId), () => true)
        .map((row) => row.id)
        .filter((id) => selected.includes(id));
    }
    this.selectedIds.set([sourceId]);
    this.selectionAnchorId.set(sourceId);
    return [sourceId];
  }

  beginDrag(
    serviceId: ServiceId,
    node: ServiceTreeNode<Record<string, unknown>>,
    ids: readonly string[] = [node.id],
  ): void {
    this.dragServiceId.set(serviceId);
    this.dragNode.set(node);
    this.dragIds.set(ids.length > 0 ? ids : [node.id]);
    this.dropTarget.set(null);
  }

  setDropTarget(target: DropSlot | null): void {
    this.dropTarget.set(target);
  }

  endDrag(): void {
    this.dragServiceId.set(null);
    this.dragNode.set(null);
    this.dragIds.set([]);
    this.dropTarget.set(null);
  }

  isDropFolder(id: string): boolean {
    const target = this.dropTarget();
    return target?.mode === 'into' && target.folderId === id && !target.denied;
  }

  isJustMoved(id: string): boolean {
    return this.lastMovedId() === id;
  }

  async moveNode(
    serviceId: ServiceId,
    nodeId: string,
    targetParentId: string | null,
    targetIndex: number,
  ): Promise<void> {
    const next = ensureFoldersFirst(
      moveServiceNode(this.rawTree(serviceId), nodeId, targetParentId, targetIndex),
    );
    await this.writeTree(serviceId, next);
    this.setSort(serviceId, 'manual');
    this.markMoved(nodeId);
    if (targetParentId)
      this.ensureExpanded(serviceId, targetParentId);
  }

  /**
   * Moves `ids` under `targetParentId` at `targetIndex` as one block.
   * Selected descendants of other selected folders are skipped.
   */
  async moveNodes(
    serviceId: ServiceId,
    ids: readonly string[],
    targetParentId: string | null,
    targetIndex: number,
  ): Promise<boolean> {
    const unique = [...new Set(ids)];
    if (unique.length === 0)
      return false;
    if (unique.length === 1) {
      await this.moveNode(serviceId, unique[0], targetParentId, targetIndex);
      return true;
    }

    const parentId =
      targetParentId === null || targetParentId === SERVICES_ROOT_ID ? null : targetParentId;
    const tree = this.rawTree(serviceId);
    const rows = flattenServiceTreeRows(tree, () => true);
    const ordered = rows.map((row) => row.id).filter((id) => unique.includes(id));
    const movingIds = ordered.filter(
      (id) => !unique.some((other) => other !== id && isServiceTreeDescendant(tree, other, id)),
    );
    if (movingIds.length === 0)
      return false;

    for (const id of movingIds) {
      if (parentId === id || (parentId && isServiceTreeDescendant(tree, id, parentId)))
        return false;
    }

    const rowById = new Map(rows.map((row) => [row.id, row]));
    const effectiveParent = parentId ?? SERVICES_ROOT_ID;
    const removedBefore = movingIds.filter((id) => {
      const current = rowById.get(id);
      return current?.parentId === effectiveParent && current.index < targetIndex;
    }).length;
    const insertIndex = Math.max(0, targetIndex - removedBefore);

    let next = tree;
    const extracted: ServiceTreeNode<Record<string, unknown>>[] = [];
    for (const id of movingIds) {
      const removed = extractServiceNode(next, id);
      if (!removed.node)
        continue;
      extracted.push(removed.node);
      next = removed.tree;
    }
    if (extracted.length === 0)
      return false;

    next = ensureFoldersFirst(insertServiceChildrenAt(next, parentId, insertIndex, extracted));
    await this.writeTree(serviceId, next);
    this.setSort(serviceId, 'manual');
    this.markMoved(extracted[0].id);
    if (parentId)
      this.ensureExpanded(serviceId, parentId);
    return true;
  }

  /**
   * Applies the current drop target, then clears drag state.
   * @returns Moved node id when a move was applied; otherwise null.
   */
  async commitDrop(): Promise<string | null> {
    const serviceId = this.dragServiceId();
    const dragged = this.dragNode();
    const target = this.dropTarget();
    const ids = this.dragIds().length > 0 ? this.dragIds() : dragged ? [dragged.id] : [];
    this.endDrag();

    if (!serviceId || !dragged || !target || target.denied || ids.length === 0)
      return null;

    if (target.mode === 'into') {
      if (
        ids.some(
          (id) =>
            id === target.parentId || isServiceTreeDescendant(this.rawTree(serviceId), id, target.parentId),
        )
      ) {
        return null;
      }
      const folder = findServiceNode(this.rawTree(serviceId), target.parentId);
      const index = folder?.kind === 'folder' ? folder.children.length : 0;
      await this.moveNodes(serviceId, ids, target.parentId, index);
      return dragged.id;
    }

    const parentId = target.parentId === SERVICES_ROOT_ID ? null : target.parentId;
    if (
      parentId &&
      ids.some((id) => parentId === id || isServiceTreeDescendant(this.rawTree(serviceId), id, parentId))
    ) {
      return null;
    }

    if (ids.length === 1) {
      const rows = flattenServiceTreeRows(this.rawTree(serviceId), () => true);
      const current = rows.find((row) => row.id === dragged.id);
      if (!current)
        return null;
      const currentParent = current.parentId === SERVICES_ROOT_ID ? null : current.parentId;
      const samePlace =
        currentParent === parentId &&
        (target.index === current.index || target.index === current.index + 1);
      if (samePlace)
        return null;
    }

    await this.moveNodes(serviceId, ids, parentId, target.index);
    return dragged.id;
  }

  private ensureExpanded(serviceId: ServiceId, folderId: string): void {
    if (this.expanded(serviceId).includes(folderId))
      return;
    this.toggleExpanded(serviceId, folderId);
  }

  private markMoved(nodeId: string): void {
    if (this.moveAnimTimer) {
      clearTimeout(this.moveAnimTimer);
      this.moveAnimTimer = null;
    }
    this.lastMovedId.set(null);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.lastMovedId.set(nodeId);
        this.moveAnimTimer = setTimeout(() => {
          if (this.lastMovedId() === nodeId)
            this.lastMovedId.set(null);
          this.moveAnimTimer = null;
        }, 300);
      });
    });
  }

  isTabActive(kind: WorkbenchTab['kind'], nodeId: string): boolean {
    const group = this.workbench.focusedGroup();
    const tab = group?.tabs.find((item) => item.id === group.activeTabId);
    return tab?.kind === kind && tab.nodeId === nodeId;
  }

  activeArtifactId(serviceId: ServiceId): string | null {
    const kind = SERVICE_ARTIFACT_TAB_KIND[serviceId as keyof typeof SERVICE_ARTIFACT_TAB_KIND];
    if (!kind)
      return null;
    const group = this.workbench.focusedGroup();
    const tab = group?.tabs.find((item) => item.id === group.activeTabId);
    return tab?.kind === kind ? tab.nodeId : null;
  }

  async createFolder(id: ServiceId, parentId: string | null = null): Promise<string> {
    const folder = emptyServiceFolder('New folder');
    await this.writeTree(
      id,
      ensureFoldersFirst(insertServiceChild(this.rawTree(id), parentId, folder)),
    );
    if (parentId)
      this.ensureExpanded(id, parentId);
    this.toggleExpanded(id, folder.id);
    return folder.id;
  }

  async createArtifact(id: ServiceId, parentId: string | null = null): Promise<string> {
    const node = this.emptyArtifact(id);
    await this.writeTree(
      id,
      ensureFoldersFirst(insertServiceChild(this.rawTree(id), parentId, node)),
    );
    if (parentId)
      this.ensureExpanded(id, parentId);
    this.openArtifact(id, node.id, node.name);
    return node.id;
  }

  async rename(id: ServiceId, nodeId: string, name: string): Promise<void> {
    const now = new Date().toISOString();
    await this.writeTree(id, renameServiceNode(this.rawTree(id), nodeId, name, now));
    this.workbench.renameServiceTabs(nodeId, name);
  }

  copySelection(serviceId: ServiceId): ServiceTreeNode<Record<string, unknown>>[] {
    const ids = this.topLevelSelection(serviceId, this.selectionOrActive(serviceId));
    const nodes: ServiceTreeNode<Record<string, unknown>>[] = [];
    for (const id of ids) {
      const node = findServiceNode(this.rawTree(serviceId), id);
      if (node)
        nodes.push(structuredClone(node));
    }
    return nodes;
  }

  async pasteCopied(
    serviceId: ServiceId,
    nodes: readonly ServiceTreeNode<Record<string, unknown>>[],
  ): Promise<readonly string[]> {
    if (nodes.length === 0)
      return [];
    const now = new Date().toISOString();
    let tree = this.rawTree(serviceId);
    const names = tree.map((node) => node.name);
    const pasted: ServiceTreeNode<Record<string, unknown>>[] = [];
    for (const node of nodes) {
      const clone = cloneServiceSubtree(node, now);
      const name = uniquePasteName(node.name, names, 'Item');
      names.push(name);
      const named = { ...clone, name };
      tree = insertServiceChild(tree, null, named);
      pasted.push(named);
    }
    await this.writeTree(serviceId, ensureFoldersFirst(tree));
    const ids = pasted.map((node) => node.id);
    this.selectedIds.set(ids);
    this.selectionAnchorId.set(ids[0] ?? null);
    return ids;
  }

  async duplicate(id: ServiceId, nodeId: string): Promise<void> {
    const now = new Date().toISOString();
    await this.writeTree(id, ensureFoldersFirst(duplicateServiceNode(this.rawTree(id), nodeId, now)));
  }

  async remove(id: ServiceId, nodeId: string, options?: { readonly persist?: boolean }): Promise<void> {
    const removed = findServiceNode(this.rawTree(id), nodeId);
    const ids = removed ? collectServiceArtifactIds(removed.kind === 'folder' ? [removed] : [removed]) : [nodeId];
    const next = removeServiceNode(this.rawTree(id), nodeId);
    if (options?.persist === false)
      this.applyTreeLocal(id, next);
    else
      await this.writeTree(id, next);
    this.workbench.closeServiceTabs(ids);
  }

  /** Deletes selected roots (skips ids nested under another selected folder). */
  async removeMany(serviceId: ServiceId, nodeIds: readonly string[]): Promise<void> {
    const roots = this.topLevelSelection(serviceId, nodeIds);
    for (const nodeId of roots)
      await this.remove(serviceId, nodeId);
    this.clearSelection();
  }

  /**
   * Soft-delete with undo: updates the tree in memory immediately but delays disk persist until commit().
   */
  removeDeferred(serviceId: ServiceId, nodeIds: readonly string[]): ServiceDeferredDelete | null {
    const roots = this.topLevelSelection(serviceId, nodeIds);
    if (roots.length === 0)
      return null;

    const tree = this.rawTree(serviceId);
    const entries: ServiceRestoreEntry[] = [];
    for (const id of roots) {
      const node = findServiceNode(tree, id);
      const loc = findServiceParentIndex(tree, id);
      if (!node || !loc)
        continue;
      entries.push({
        serviceId,
        node: structuredClone(node) as ServiceTreeNode<Record<string, unknown>>,
        parentId: loc.parentId,
        index: loc.index,
      });
    }
    if (entries.length === 0)
      return null;

    let next = tree;
    const closedIds: string[] = [];
    for (const id of roots) {
      const removed = findServiceNode(next, id);
      if (removed)
        closedIds.push(...collectServiceArtifactIds(removed.kind === 'folder' ? [removed] : [removed]));
      next = removeServiceNode(next, id);
    }
    this.applyTreeLocal(serviceId, next);
    this.workbench.closeServiceTabs(closedIds);
    this.clearSelection();

    const deferred: ServiceDeferredDelete = {
      serviceId,
      removedIds: roots,
      restore: () => {
        this.restoreEntries(entries);
        this.clearPendingDelete(deferred);
      },
      commit: async () => {
        await this.writeTree(serviceId, this.rawTree(serviceId));
        this.clearPendingDelete(deferred);
      },
    };
    this.pushPendingDelete(deferred);
    return deferred;
  }

  restoreEntries(entries: readonly ServiceRestoreEntry[]): void {
    if (entries.length === 0)
      return;
    const byService = new Map<ServiceId, ServiceRestoreEntry[]>();
    for (const entry of entries) {
      const list = byService.get(entry.serviceId) ?? [];
      list.push(entry);
      byService.set(entry.serviceId, list);
    }
    for (const [serviceId, list] of byService) {
      const sorted = [...list].sort((a, b) => {
        const parentA = a.parentId ?? '';
        const parentB = b.parentId ?? '';
        if (parentA !== parentB)
          return parentA.localeCompare(parentB);
        return b.index - a.index;
      });
      let next = this.rawTree(serviceId);
      for (const entry of sorted)
        next = insertServiceChildAt(next, entry.parentId, entry.index, entry.node);
      void this.writeTree(serviceId, next);
    }
  }

  /** Latest unsettled soft-deletes (newest last). Cleared on commit, undo, or workspace switch. */
  private readonly pendingDeletes: ServiceDeferredDelete[] = [];

  undoLastDelete(): ServiceDeferredDelete | null {
    const deferred = this.pendingDeletes.at(-1) ?? null;
    if (!deferred)
      return null;
    deferred.restore();
    return deferred;
  }

  /** Persist any soft-deletes and drop undo (e.g. workspace switch). */
  async flushPendingDeletes(): Promise<void> {
    const pending = [...this.pendingDeletes];
    this.pendingDeletes.length = 0;
    for (const deferred of pending)
      await deferred.commit();
  }

  private pushPendingDelete(deferred: ServiceDeferredDelete): void {
    this.pendingDeletes.push(deferred);
    while (this.pendingDeletes.length > 20)
      this.pendingDeletes.shift();
  }

  private clearPendingDelete(deferred: ServiceDeferredDelete): void {
    const index = this.pendingDeletes.indexOf(deferred);
    if (index >= 0)
      this.pendingDeletes.splice(index, 1);
  }

  private topLevelSelection(serviceId: ServiceId, nodeIds: readonly string[]): readonly string[] {
    const set = new Set(nodeIds);
    return nodeIds.filter((id) => {
      const row = flattenServiceTreeRows(this.rawTree(serviceId), () => true).find((item) => item.id === id);
      if (!row)
        return true;
      return !row.ancestors.some((ancestor) => set.has(ancestor));
    });
  }

  /** Updates the in-memory service tree without writing disk (for deferred delete). */
  private applyTreeLocal(id: ServiceId, items: readonly ServiceTreeNode<Record<string, unknown>>[]): void {
    const normalized = ensureFoldersFirst(items);
    switch (id) {
      case 'flows':
        this.desktop.flows.set({ ...this.desktop.flows(), items: normalized as FlowsFile['items'] });
        return;
      case 'load':
        this.desktop.load.set({ ...this.desktop.load(), items: normalized as LoadFile['items'] });
        return;
      case 'regression':
        this.desktop.regressions.set({
          ...this.desktop.regressions(),
          items: normalized as RegressionsFile['items'],
        });
        return;
      case 'mocks':
        this.desktop.mocks.set({ ...this.desktop.mocks(), items: normalized as MocksFile['items'] });
        return;
      case 'listeners':
        this.desktop.listeners.set({
          ...this.desktop.listeners(),
          items: normalized as ListenersFile['items'],
        });
        return;
      case 'intercept':
        this.desktop.intercept.set({
          ...this.desktop.intercept(),
          items: normalized as InterceptFile['items'],
        });
        return;
      default:
        return;
    }
  }

  openArtifact(serviceId: ServiceId, nodeId: string, name: string): void {
    const kind = SERVICE_ARTIFACT_TAB_KIND[serviceId as keyof typeof SERVICE_ARTIFACT_TAB_KIND];
    if (!kind)
      return;
    this.workbench.openFromServiceArtifact(kind, nodeId, name, defaultServiceSection(kind));
  }

  findFlow(id: string): Extract<FlowNode, { kind: 'artifact' }> | null {
    const node = findServiceNode(this.desktop.flows().items, id);
    return node?.kind === 'artifact' ? node : null;
  }

  /** Ensure Tutorial → Basics / API / E2E / Device folders exist (upserted), then open the showcase simples. */
  async ensureTutorialFlows(): Promise<void> {
    const stamp = new Date().toISOString();
    const tutorialFolder = {
      kind: 'folder' as const,
      id: TUTORIAL_FOLDER_ID,
      name: 'Tutorial',
      updatedAt: stamp,
      children: [...buildTutorialFlows()],
    };
    let items = [...this.desktop.flows().items] as FlowsFile['items'];
    if (findServiceNode(items, TUTORIAL_FOLDER_ID)) {
      items = mapServiceTree(items, (node) =>
        node.id === TUTORIAL_FOLDER_ID ? tutorialFolder : node,
      ) as FlowsFile['items'];
    } else {
      items = insertServiceChild(items, null, tutorialFolder) as FlowsFile['items'];
    }
    await this.saveFlowsNow({ items });

    const control = findServiceNode(this.desktop.flows().items, TUTORIAL_CONTROL_FLOW_FLOW_ID);
    const reference = findServiceNode(this.desktop.flows().items, TUTORIAL_NODE_REFERENCE_FLOW_ID);
    if (control?.kind === 'artifact')
      this.openArtifact('flows', control.id, control.name);
    if (reference?.kind === 'artifact')
      this.openArtifact('flows', reference.id, reference.name);

    const api = findServiceNode(this.desktop.flows().items, TUTORIAL_API_SIMPLE_FLOW_ID);
    const e2e = findServiceNode(this.desktop.flows().items, TUTORIAL_E2E_SIMPLE_FLOW_ID);
    const device = findServiceNode(this.desktop.flows().items, TUTORIAL_DEVICE_SIMPLE_FLOW_ID);
    if (api?.kind === 'artifact')
      this.openArtifact('flows', api.id, api.name);
    if (e2e?.kind === 'artifact')
      this.openArtifact('flows', e2e.id, e2e.name);
    if (device?.kind === 'artifact')
      this.openArtifact('flows', device.id, device.name);
    this.drillIn('flows');
  }

  findLoad(id: string): Extract<LoadNode, { kind: 'artifact' }> | null {
    const node = findServiceNode(this.desktop.load().items, id);
    return node?.kind === 'artifact' ? node : null;
  }

  findRegression(id: string): Extract<RegressionNode, { kind: 'artifact' }> | null {
    const node = findServiceNode(this.desktop.regressions().items, id);
    return node?.kind === 'artifact' ? node : null;
  }

  findMock(id: string): Extract<MockNode, { kind: 'artifact' }> | null {
    const node = findServiceNode(this.desktop.mocks().items, id);
    return node?.kind === 'artifact' ? node : null;
  }

  findListener(id: string): Extract<ListenerNode, { kind: 'artifact' }> | null {
    const node = findServiceNode(this.desktop.listeners().items, id);
    return node?.kind === 'artifact' ? node : null;
  }

  findIntercept(id: string): Extract<InterceptNode, { kind: 'artifact' }> | null {
    const node = findServiceNode(this.desktop.intercept().items, id);
    return node?.kind === 'artifact' ? node : null;
  }

  async patchFlow(id: string, patch: Partial<Extract<FlowNode, { kind: 'artifact' }>>): Promise<void> {
    this.applyFlowPatchLocally(id, patch);
    this.scheduleFlowsSave();
  }

  /** Persists the in-memory flows tree immediately (cancels any pending debounced save). */
  async flushFlowsSave(): Promise<void> {
    if (this.flowsSaveTimer) {
      clearTimeout(this.flowsSaveTimer);
      this.flowsSaveTimer = null;
    }
    if (this.flowsSaveInFlight) {
      return this.flowsSaveInFlight;
    }
    const items = this.desktop.flows().items;
    this.flowsSaveInFlight = this.desktop.saveFlows({ items }).finally(() => {
      this.flowsSaveInFlight = null;
    });
    return this.flowsSaveInFlight;
  }

  private applyFlowPatchLocally(
    id: string,
    patch: Partial<Extract<FlowNode, { kind: 'artifact' }>>,
  ): void {
    const items = patchServiceArtifact(
      this.desktop.flows().items,
      id,
      patch,
      new Date().toISOString(),
    ) as FlowsFile['items'];
    this.desktop.flows.update((current) => ({ ...current, items }));
  }

  private scheduleFlowsSave(): void {
    if (this.flowsSaveTimer) {
      clearTimeout(this.flowsSaveTimer);
    }
    this.flowsSaveTimer = setTimeout(() => {
      this.flowsSaveTimer = null;
      void this.flushFlowsSave();
    }, ServicesStore.FLOWS_SAVE_DEBOUNCE_MS);
  }

  private async saveFlowsNow(patch: Partial<Omit<FlowsFile, 'schemaVersion'>>): Promise<void> {
    if (this.flowsSaveTimer) {
      clearTimeout(this.flowsSaveTimer);
      this.flowsSaveTimer = null;
    }
    if (this.flowsSaveInFlight) {
      await this.flowsSaveInFlight;
    }
    await this.desktop.saveFlows(patch);
  }

  async patchLoad(id: string, patch: Partial<Extract<LoadNode, { kind: 'artifact' }>>): Promise<void> {
    await this.desktop.saveLoad({
      items: patchServiceArtifact(this.desktop.load().items, id, patch, new Date().toISOString()) as LoadFile['items'],
    });
  }

  async patchRegression(id: string, patch: Partial<Extract<RegressionNode, { kind: 'artifact' }>>): Promise<void> {
    await this.desktop.saveRegressions({
      items: patchServiceArtifact(this.desktop.regressions().items, id, patch, new Date().toISOString()) as RegressionsFile['items'],
    });
  }

  async patchMock(id: string, patch: Partial<Extract<MockNode, { kind: 'artifact' }>>): Promise<void> {
    await this.desktop.saveMocks({
      items: patchServiceArtifact(this.desktop.mocks().items, id, patch, new Date().toISOString()) as MocksFile['items'],
    });
  }

  async patchMocksOptions(patch: Partial<MockServerOptions>): Promise<void> {
    const current = this.desktop.mocks().options;
    await this.desktop.saveMocks({ options: { ...current, ...patch } });
  }

  async patchListener(id: string, patch: Partial<Extract<ListenerNode, { kind: 'artifact' }>>): Promise<void> {
    await this.desktop.saveListeners({
      items: patchServiceArtifact(this.desktop.listeners().items, id, patch, new Date().toISOString()) as ListenersFile['items'],
    });
  }

  async patchIntercept(id: string, patch: Partial<Extract<InterceptNode, { kind: 'artifact' }>>): Promise<void> {
    await this.desktop.saveIntercept({
      items: patchServiceArtifact(this.desktop.intercept().items, id, patch, new Date().toISOString()) as InterceptFile['items'],
    });
  }

  async startLoad(id: string): Promise<void> {
    this.activeLoadRunId.set(id);
    this.loadMetrics.set({
      running: true,
      elapsedMs: 0,
      requests: 0,
      errors: 0,
      rps: 0,
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      virtualUsers: 0,
      successRatePercent: 100,
      errorRatePercent: 0,
      peakRps: 0,
      samples: [],
    });
    this.loadStatus.set({ running: true, label: 'Starting…', error: null });
    const status = await this.desktop.api.services.load.start(id);
    this.desktop.load.set(await this.desktop.api.services.load.get());
    this.loadStatus.set(status);
    this.scheduleRunCheckpoint(id, 'load', this.loadCheckpointPayload());
  }

  async stopLoad(): Promise<void> {
    const loadId = this.activeLoadRunId();
    this.loadStatus.set(await this.desktop.api.services.load.stop());
    if (loadId)
      this.clearRunCheckpoint(loadId);
    this.activeLoadRunId.set(null);
  }

  async startMocks(): Promise<void> {
    this.mockStatus.set({ running: true, label: 'Starting…', error: null });
    this.mockActivity.set([]);
    const status = await this.desktop.api.services.mocks.start();
    this.desktop.mocks.set(await this.desktop.api.services.mocks.get());
    this.mockStatus.set(status);
  }

  async stopMocks(): Promise<void> {
    this.mockStatus.set(await this.desktop.api.services.mocks.stop());
  }

  async startListener(id: string): Promise<void> {
    this.activeListenerId.set(id);
    this.listenerStatus.set({ running: true, label: 'Starting…', error: null });
    const status = await this.desktop.api.services.listeners.start(id);
    this.listenerStatus.set(status);
    if (!status.running)
      this.activeListenerId.set(null);
    this.desktop.listeners.set(await this.desktop.api.services.listeners.get());
  }

  async stopListener(): Promise<void> {
    this.listenerStatus.set(await this.desktop.api.services.listeners.stop());
    this.activeListenerId.set(null);
  }

  /** Clears persisted Network hits for a listener artifact. */
  async clearListenerActivity(id: string): Promise<void> {
    await this.patchListener(id, { activity: [] });
  }

  private appendListenerActivity(event: ListenerHitEvent): void {
    const file = this.desktop.listeners();
    const node = findServiceNode(file.items, event.listenerId);
    if (node?.kind !== 'artifact')
      return;
    const stamp = new Date().toISOString();
    const entry = {
      id: newListenerActivityId(event.at),
      at: event.at,
      method: event.method,
      url: event.url,
      status: event.status,
      resourceType: event.resourceType,
      requestHeaders: { ...event.requestHeaders },
      headers: { ...event.headers },
      requestBody: event.requestBody,
      body: event.body,
    };
    const items = patchServiceArtifact(
      file.items,
      event.listenerId,
      { activity: prependListenerActivity(node.activity ?? [], entry) },
      stamp,
    ) as ListenersFile['items'];
    this.desktop.listeners.set({ ...file, items });
    this.scheduleListenerActivitySave(items);
  }

  private scheduleListenerActivitySave(items: ListenersFile['items']): void {
    if (this.listenerActivitySaveTimer)
      clearTimeout(this.listenerActivitySaveTimer);
    this.listenerActivitySaveTimer = setTimeout(() => {
      this.listenerActivitySaveTimer = null;
      void this.desktop.saveListeners({ items });
    }, 400);
  }

  async startIntercept(id: string): Promise<void> {
    this.activeInterceptRuleId.set(id);
    this.interceptStatus.set({ running: true, label: 'Starting…', error: null });
    this.interceptHits.update((list) => list.filter((hit) => hit.ruleId !== id));
    const status = await this.desktop.api.services.intercept.start(id);
    this.interceptStatus.set(status);
    if (!status.running)
      this.activeInterceptRuleId.set(null);
    this.desktop.intercept.set(await this.desktop.api.services.intercept.get());
  }

  async stopIntercept(): Promise<void> {
    this.interceptStatus.set(await this.desktop.api.services.intercept.stop());
    this.activeInterceptRuleId.set(null);
  }

  /** Clears persisted Activity hits for an intercept artifact. */
  async clearInterceptActivity(id: string): Promise<void> {
    await this.patchIntercept(id, { activity: [] });
  }

  private appendInterceptActivity(event: InterceptHitEvent): void {
    const file = this.desktop.intercept();
    const node = findServiceNode(file.items, event.ruleId);
    if (node?.kind !== 'artifact')
      return;
    const stamp = new Date().toISOString();
    const entry = {
      id: event.id || newInterceptActivityId(event.at),
      at: event.at,
      method: event.method,
      url: event.url,
      status: event.status,
      action: event.action,
      requestHeaders: { ...(event.requestHeaders ?? {}) },
      headers: { ...(event.headers ?? {}) },
      requestBody: event.requestBody ?? '',
      body: event.body ?? '',
    };
    const items = patchServiceArtifact(
      file.items,
      event.ruleId,
      { activity: prependInterceptActivity(node.activity ?? [], entry) },
      stamp,
    ) as InterceptFile['items'];
    this.desktop.intercept.set({ ...file, items });
    this.scheduleInterceptActivitySave(items);
  }

  private scheduleInterceptActivitySave(items: InterceptFile['items']): void {
    if (this.interceptActivitySaveTimer)
      clearTimeout(this.interceptActivitySaveTimer);
    this.interceptActivitySaveTimer = setTimeout(() => {
      this.interceptActivitySaveTimer = null;
      void this.desktop.saveIntercept({ items });
    }, 400);
  }

  async runFlow(id: string, scenarioId?: string | null): Promise<void> {
    const resolvedScenario = scenarioId || this.activeScenarioId(id) || '';
    this.flowRunContext.set({ flowId: id, scenarioId: resolvedScenario });
    this.flowRunViewKey.set(flowRunKey(id, resolvedScenario));
    this.clearFlowRunUi();
    this.flowRunning.set(true);
    try {
      await this.desktop.api.services.flows.run(id, scenarioId);
    } finally {
      this.flowRunning.set(false);
      this.persistLastFlowRun();
      this.clearRunCheckpoint(id);
      this.flowRunContext.set(null);
    }
  }

  /** Dry-run an in-memory scenario graph (templates) without saving a flow. */
  async runFlowDraft(
    scenario: import('@testrix/contracts').FlowScenario,
    options?: { readonly e2eShowWindow?: boolean; readonly deviceShowEmulator?: boolean },
  ): Promise<void> {
    this.flowRunContext.set(null);
    this.clearFlowRunUi();
    this.flowRunning.set(true);
    try {
      await this.desktop.api.services.flows.runDraft({
        scenario,
        e2eShowWindow: options?.e2eShowWindow,
        deviceShowEmulator: options?.deviceShowEmulator,
      });
    } finally {
      this.flowRunning.set(false);
    }
  }

  /**
   * Shows the persisted last run for a flow scenario on the Design canvas.
   * No-op while a live run is in progress.
   */
  showFlowRun(flowId: string, scenarioId: string): void {
    const key = flowRunKey(flowId, scenarioId);
    if (this.flowRunning())
      return;
    if (this.flowRunViewKey() === key)
      return;
    this.flowRunViewKey.set(key);
    this.restoreLastFlowRun(flowId, scenarioId);
  }

  /** Drop canvas/run chrome so a new scenario or flow does not inherit the last run. */
  clearFlowRunUi(): void {
    this.flowStepStatuses.set({});
    this.flowStepMessages.set({});
    this.flowStepRowIndex.set({});
    this.flowStepPulse.set({});
    this.flowStepExchanges.set({});
  }

  async cancelFlow(): Promise<void> {
    await this.desktop.api.services.flows.cancel();
    this.flowStepStatuses.update((map) => {
      const next = { ...map };
      for (const [id, status] of Object.entries(next)) {
        if (status === 'running' || status === 'waiting')
          next[id] = 'cancelled';
      }
      return next;
    });
    this.flowRunning.set(false);
    this.persistLastFlowRun();
    this.flowRunContext.set(null);
  }

  private persistLastFlowRun(): void {
    const context = this.flowRunContext();
    if (!context?.flowId || !context.scenarioId)
      return;
    const statuses = this.flowStepStatuses();
    if (Object.keys(statuses).length === 0)
      return;
    const flow = this.findFlow(context.flowId);
    const scenario = flow?.scenarios.find((item) => item.id === context.scenarioId);
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let cancelled = 0;
    for (const status of Object.values(statuses)) {
      if (status === 'ok')
        passed += 1;
      else if (status === 'error')
        failed += 1;
      else if (status === 'skipped')
        skipped += 1;
      else if (status === 'cancelled')
        cancelled += 1;
    }
    const snapshot: SessionFlowLastRun = {
      id: newFlowRunId(),
      at: new Date().toISOString(),
      scenarioId: context.scenarioId,
      scenarioName: scenario?.name ?? '',
      passed,
      failed,
      skipped,
      cancelled,
      statuses: { ...statuses },
      messages: { ...this.flowStepMessages() },
      exchanges: Object.fromEntries(
        Object.entries(this.flowStepExchanges()).map(([stepId, detail]) => [
          stepId,
          capFlowExchangeDetail(detail),
        ]),
      ),
    };
    const previous = this.flowUi(context.flowId).runHistoryByScenarioId ?? {};
    const existing = previous[context.scenarioId] ?? [];
    this.patchFlowUi(context.flowId, {
      runHistoryByScenarioId: {
        ...previous,
        [context.scenarioId]: prependFlowRun(existing, snapshot),
      },
    });
  }

  private restoreLastFlowRun(flowId: string, scenarioId: string): void {
    const snapshot = this.flowUi(flowId).runHistoryByScenarioId?.[scenarioId]?.[0];
    if (!snapshot || Object.keys(snapshot.statuses ?? {}).length === 0) {
      this.clearFlowRunUi();
      return;
    }
    this.applyFlowRunSnapshot(snapshot);
  }

  private applyFlowRunSnapshot(snapshot: SessionFlowLastRun): void {
    this.flowStepStatuses.set({
      ...(snapshot.statuses as Record<string, 'waiting' | 'running' | 'ok' | 'error' | 'skipped' | 'cancelled'>),
    });
    this.flowStepMessages.set({ ...(snapshot.messages ?? {}) });
    this.flowStepExchanges.set(
      Object.fromEntries(
        Object.entries(snapshot.exchanges ?? {}).map(([stepId, detail]) => [
          stepId,
          detail as FlowRunEventDetail,
        ]),
      ),
    );
    this.flowStepPulse.set({});
    this.flowStepRowIndex.set({});
  }

  // -- flow scenarios -------------------------------------------------------

  activeScenarioId(flowId: string): string | null {
    const flow = this.findFlow(flowId);
    if (!flow)
      return null;
    const stored = this.scenarioByFlow()[flowId];
    if (stored && flow.scenarios.some((item) => item.id === stored))
      return stored;
    return flow.scenarios[0]?.id ?? null;
  }

  activeScenario(flowId: string): FlowScenario | null {
    const flow = this.findFlow(flowId);
    if (!flow)
      return null;
    const id = this.activeScenarioId(flowId);
    const scenario = flow.scenarios.find((item) => item.id === id) ?? flow.scenarios[0] ?? null;
    return scenario ? ensureFlowScenarioTerminals(scenario) : null;
  }

  selectScenario(flowId: string, scenarioId: string): void {
    const previous = this.scenarioByFlow()[flowId];
    this.scenarioByFlow.update((map) => ({ ...map, [flowId]: scenarioId }));
    this.patchFlowUi(flowId, { scenarioId, selectedNodeIds: [] });
    if (previous !== scenarioId)
      this.showFlowRun(flowId, scenarioId);
  }

  async patchScenario(flowId: string, scenarioId: string, patch: Partial<FlowScenario>): Promise<void> {
    const flow = this.findFlow(flowId);
    if (!flow)
      return;
    await this.patchFlow(flowId, {
      scenarios: flow.scenarios.map((item) => (item.id === scenarioId ? { ...item, ...patch } : item)),
    });
  }

  async addScenario(flowId: string): Promise<string> {
    const flow = this.findFlow(flowId);
    if (!flow)
      return '';
    const scenario = emptyFlowScenario(`Scenario ${flow.scenarios.length + 1}`);
    await this.patchFlow(flowId, { scenarios: [...flow.scenarios, scenario] });
    this.selectScenario(flowId, scenario.id);
    return scenario.id;
  }

  async duplicateScenario(flowId: string, scenarioId: string): Promise<void> {
    const flow = this.findFlow(flowId);
    const source = flow?.scenarios.find((item) => item.id === scenarioId);
    if (!flow || !source)
      return;
    const clone: FlowScenario = { ...source, id: newFlowScenarioId(), name: `${source.name} copy` };
    await this.patchFlow(flowId, { scenarios: [...flow.scenarios, clone] });
    this.selectScenario(flowId, clone.id);
  }

  async removeScenario(flowId: string, scenarioId: string): Promise<void> {
    const flow = this.findFlow(flowId);
    if (!flow || flow.scenarios.length <= 1)
      return;
    const scenarios = flow.scenarios.filter((item) => item.id !== scenarioId);
    await this.patchFlow(flowId, { scenarios });
    if (this.activeScenarioId(flowId) === scenarioId)
      this.selectScenario(flowId, scenarios[0]?.id ?? '');
  }

  async runRegression(
    id: string,
    options?: { readonly onlyKeys?: readonly string[] },
  ): Promise<void> {
    if (this.regressionRunning())
      return;
    this.regressionLog.set('');
    this.regressionEvents.set([]);
    this.regressionProgress.set({ total: 0, completed: 0 });
    this.regressionLiveEntries.set([]);
    this.regressionLiveSamples.set([]);
    this.regressionLiveTimeline.set([]);
    this.regressionLiveMetrics.set(null);
    this.regressionRunning.set(true);
    this.regressionRunningId.set(id);
    try {
      await this.desktop.api.services.regressions.run(id, options);
      this.desktop.regressions.set(await this.desktop.api.services.regressions.get());
    } finally {
      this.regressionRunning.set(false);
      this.regressionRunningId.set(null);
    }
  }

  cancelRegression(): void {
    void this.desktop.api.services.regressions.cancel();
  }

  private rawTree(id: ServiceId): ServiceTreeNode<Record<string, unknown>>[] {
    switch (id) {
      case 'flows':
        return ensureFoldersFirst([...this.desktop.flows().items]) as ServiceTreeNode<Record<string, unknown>>[];
      case 'load':
        return ensureFoldersFirst([...this.desktop.load().items]) as ServiceTreeNode<Record<string, unknown>>[];
      case 'regression':
        return ensureFoldersFirst([...this.desktop.regressions().items]) as ServiceTreeNode<
          Record<string, unknown>
        >[];
      case 'mocks':
        return ensureFoldersFirst([...this.desktop.mocks().items]) as ServiceTreeNode<Record<string, unknown>>[];
      case 'listeners':
        return ensureFoldersFirst([...this.desktop.listeners().items]) as ServiceTreeNode<
          Record<string, unknown>
        >[];
      case 'intercept':
        return ensureFoldersFirst([...this.desktop.intercept().items]) as ServiceTreeNode<
          Record<string, unknown>
        >[];
      default:
        return [];
    }
  }

  private async writeTree(id: ServiceId, items: readonly ServiceTreeNode<Record<string, unknown>>[]): Promise<void> {
    const normalized = ensureFoldersFirst(items);
    switch (id) {
      case 'flows':
        await this.saveFlowsNow({ items: normalized as FlowsFile['items'] });
        return;
      case 'load':
        await this.desktop.saveLoad({ items: normalized as LoadFile['items'] });
        return;
      case 'regression':
        await this.desktop.saveRegressions({ items: normalized as RegressionsFile['items'] });
        return;
      case 'mocks':
        await this.desktop.saveMocks({ items: normalized as MocksFile['items'] });
        return;
      case 'listeners':
        await this.desktop.saveListeners({ items: normalized as ListenersFile['items'] });
        return;
      case 'intercept':
        await this.desktop.saveIntercept({ items: normalized as InterceptFile['items'] });
        return;
      default:
        return;
    }
  }

  private emptyArtifact(id: ServiceId): ServiceTreeNode<Record<string, unknown>> {
    if (id === 'load')
      return emptyLoadArtifact() as ServiceTreeNode<Record<string, unknown>>;
    if (id === 'regression')
      return emptyRegressionArtifact() as ServiceTreeNode<Record<string, unknown>>;
    if (id === 'mocks')
      return emptyMockArtifact() as ServiceTreeNode<Record<string, unknown>>;
    if (id === 'listeners')
      return emptyListenerArtifact() as ServiceTreeNode<Record<string, unknown>>;
    if (id === 'intercept')
      return emptyInterceptArtifact() as ServiceTreeNode<Record<string, unknown>>;
    return emptyFlowArtifact() as ServiceTreeNode<Record<string, unknown>>;
  }
}
