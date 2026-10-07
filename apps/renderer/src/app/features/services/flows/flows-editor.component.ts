import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  forwardRef,
  HostListener,
  inject,
  input,
  signal,
  type TemplateRef,
  untracked,
  ViewContainerRef,
  viewChild,
} from '@angular/core';
import { Overlay, type GlobalPositionStrategy, type OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  DATABASE_TYPE_LABELS,
  FLOW_NODE_GROUPS,
  FLOW_SECTIONS,
  clampFlowInspectorWidth,
  collectServiceArtifactIds,
  countFlowScenarioNodes,
  environmentVariableMap,
  findFlowGraphNode,
  flattenDatabaseConnections,
  flowConfigString,
  flowHasBrowserNodes,
  flowHasDeviceNodes,
  flowHasStartToEndPath,
  flowNodeLabel,
  flowNodePorts,
  flowRunOrderIndex,
  flowScenarioRunCount,
  groupFlowTemplatesByPrimaryTag,
  isFlowFrameKind,
  normalizeFlowSection,
  parseFlowScenariosRunMode,
  type FlowGraphNode,
  type FlowNodeConfigValue,
  type FlowNodeKind,
  type FlowPort,
  type FlowScenarioData,
  type FlowRunEventDetail,
  type SessionFlowLastRun,
  type FolderDocsMode,
} from '@testrix/contracts';
import { TxCheckComponent, TxHintComponent, TxInputComponent, TxOverlayComponent, TxOverlayHostDirective, TxSelectComponent, TxTagsInputComponent } from '@testrix/ui';

import { ConfirmDialogService } from '../../../core/confirm-dialog.service';
import { DirtyTabsRegistry } from '../../../core/dirty-tabs.registry';
import { DesktopApiService } from '../../../core/desktop-api.service';
import { isManualSaveMode, shouldHandleManualSaveHotkey } from '../../../core/save-mode';
import { isEditableKeyboardTarget, isModKey } from '../../../core/selection-hotkeys';
import { CollectionsStore } from '../../collections/collections.store';
import { DocsEditorComponent } from '../../collections/docs-editor.component';
import { EnvironmentsStore } from '../../environments/environments.store';
import {
  openPlaceholderOrigin,
  PLACEHOLDER_ORIGIN_HOST,
  winningVariableOrigins,
  type PlaceholderActivate,
  type PlaceholderOrigin,
  type PlaceholderOriginHost,
} from '../../workbench/request/placeholder-origin';
import { WorkbenchStore, type WorkbenchTab } from '../../workbench/workbench.store';
import { ServiceIconComponent } from '../service-icon.component';
import { ServicesStore } from '../services.store';
import { FlowCanvasComponent, type FlowCanvasMenuEvent } from './flow-canvas.component';
import { FLOW_CANVAS_STATUS_HINT, pickerTargetFromEmptyCanvas } from './flow-canvas-actions';
import { FlowRunExchangeComponent } from './flow-run-exchange.component';
import { FlowDataGridComponent } from './flow-data-grid.component';
import { FlowGraphHistory } from './flow-graph-history';
import { autoLayoutScenario } from './flow-graph-layout';
import {
  addNode,
  connectNodes,
  copyFlowSelection,
  pasteFlowSelection,
  disconnectEdge,
  duplicateNodes,
  insertOnEdge,
  patchNode,
  patchNodeConfig,
  removeNodes,
  renameEdge,
  setNodesEnabled,
  splitFromNode,
  type FlowGraph,
} from './flow-graph-model';
import { FlowClipboardService } from './flow-clipboard.service';
import { FlowInspectorComponent } from './flow-inspector.component';
import type { FlowNodeStatus } from './flow-node-card.component';
import { FlowNodeIconComponent } from './flow-node-icon.component';
import { FlowOutlineComponent } from './flow-outline.component';
import { FlowHistoryPanelComponent, type FlowHistoryExchangeRequest } from './flow-history-panel.component';
import { FlowScenarioBarComponent } from './flow-scenario-bar.component';
import {
  captureFlowTemplate,
  insertFlowTemplate,
  type FlowGraphTemplate,
} from './flow-templates';
import { FlowTemplatesStore } from './flow-templates.store';
import { resolveFlowBrowserOpenUrl } from './flow-open-url';

type CanvasMenu =
  | { readonly kind: 'node'; readonly id: string; readonly x: number; readonly y: number }
  | { readonly kind: 'edge'; readonly id: string; readonly x: number; readonly y: number };

interface PickerTarget {
  readonly at?: { readonly x: number; readonly y: number };
  readonly after?: { readonly id: string; readonly port: FlowPort };
  readonly onEdge?: string;
  readonly parentId?: string | null;
  readonly split?: { readonly id: string; readonly port: FlowPort };
}

@Component({
  selector: 'tx-flows-editor',
  standalone: true,
  imports: [
    TxCheckComponent,
    TxHintComponent,
    TxInputComponent,
    TxTagsInputComponent,
    TxOverlayComponent,
    TxOverlayHostDirective,
    TxSelectComponent,
    ServiceIconComponent,
    FlowCanvasComponent,
    FlowRunExchangeComponent,
    FlowDataGridComponent,
    FlowInspectorComponent,
    FlowNodeIconComponent,
    FlowOutlineComponent,
    FlowHistoryPanelComponent,
    FlowScenarioBarComponent,
    DocsEditorComponent,
  ],
  templateUrl: './flows-editor.component.html',
  styleUrl: './flows-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:flex;flex:1;min-height:0;' },
  providers: [{ provide: PLACEHOLDER_ORIGIN_HOST, useExisting: forwardRef(() => FlowsEditorComponent) }],
})
export class FlowsEditorComponent implements PlaceholderOriginHost {
  readonly tab = input.required<WorkbenchTab>();
  readonly store = inject(ServicesStore);
  readonly workbench = inject(WorkbenchStore);
  private readonly desktop = inject(DesktopApiService);
  private readonly dirtyTabs = inject(DirtyTabsRegistry);
  private readonly environments = inject(EnvironmentsStore);
  private readonly collections = inject(CollectionsStore);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly templatesStore = inject(FlowTemplatesStore);
  private readonly flowClipboard = inject(FlowClipboardService);
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly menuTemplate = viewChild.required<TemplateRef<unknown>>('flowMenu');
  private readonly canvas = viewChild(FlowCanvasComponent);
  private menuOverlayRef: OverlayRef | null = null;

  readonly sectionSlideDir = signal<'left' | 'right' | null>(null);
  readonly docsMode = signal<FolderDocsMode>('split');
  readonly selectedIds = signal<readonly string[]>([]);
  readonly selectedEdgeIds = signal<readonly string[]>([]);
  readonly menu = signal<CanvasMenu | null>(null);
  readonly picker = signal<PickerTarget | null>(null);
  readonly canvasStatusHint = FLOW_CANVAS_STATUS_HINT;
  readonly edgeRename = signal<{ readonly id: string; readonly name: string } | null>(null);
  readonly exchangeViewer = signal<{
    readonly nodeId: string;
    readonly title: string;
    readonly detail?: FlowRunEventDetail;
  } | null>(null);
  /** Outline/inspector slide anims — only while Design is settled, not during section switches. */
  readonly designChromeAnimate = signal(false);
  readonly fitToken = signal(0);
  readonly pickingSelector = signal(false);
  readonly pickingDeviceSelector = signal(false);
  readonly devicePickError = signal<string | null>(null);
  readonly dirty = signal(false);
  readonly draftGraph = signal<FlowGraph>({ nodes: [], edges: [] });
  readonly isManualSave = computed(() => isManualSaveMode(this.desktop.settings()));
  private designChromeTimer: ReturnType<typeof setTimeout> | null = null;
  private graphHydrateKey = '';
  private readonly graphHistory = new FlowGraphHistory();
  private readonly checkpointPrompted = new Set<string>();

  readonly nodeGroups = FLOW_NODE_GROUPS;
  readonly templates = computed(() => this.templatesStore.allTemplates());
  readonly templateGroups = computed(() => groupFlowTemplatesByPrimaryTag(this.templates()));
  readonly sections = FLOW_SECTIONS.map((id) => ({
    id,
    label:
      id === 'design'
        ? 'Design'
        : id === 'data'
          ? 'Data'
          : id === 'history'
            ? 'History'
            : id === 'docs'
              ? 'Docs'
              : 'Settings',
  }));

  readonly flow = computed(() => this.store.findFlow(this.tab().nodeId));
  readonly section = computed(() => normalizeFlowSection(this.tab().serviceSection));
  readonly outlineOpen = computed(() => {
    const tabOpen = this.tab().flowOutlineOpen;
    if (typeof tabOpen === 'boolean')
      return tabOpen;
    return this.store.flowUi(this.tab().nodeId).outlineOpen === true;
  });
  readonly scenarios = computed(() => this.flow()?.scenarios ?? []);
  readonly scenario = computed(() => this.store.activeScenario(this.tab().nodeId));
  readonly graph = computed<FlowGraph>(() => this.draftGraph());
  readonly runHistory = computed(() => {
    const flow = this.flow();
    const scenario = this.scenario();
    if (!flow || !scenario)
      return [];
    return this.store.flowRunHistory(flow.id, scenario.id);
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.closeMenu();
      this.clearDesignChromeTimer();
      this.unbindInspectorResize();
      this.dirtyTabs.clear(this.tab().id);
    });
    effect(() => {
      const dirty = this.dirty();
      const manual = this.isManualSave();
      const tabId = this.tab().id;
      untracked(() => this.dirtyTabs.setDirty(tabId, manual && dirty));
    });
    // Rewrite legacy overview/steps/runs onto design so restored tabs stay on a real pane.
    effect(() => {
      const tab = this.tab();
      const raw = tab.serviceSection;
      const next = normalizeFlowSection(raw);
      if (raw === next)
        return;
      this.workbench.patchTab(tab.id, { serviceSection: next });
    });

    // Restore the last persisted run onto Design for this flow/scenario.
    effect(() => {
      const flow = this.flow();
      const scenario = this.scenario();
      if (!flow || !scenario)
        return;
      untracked(() => this.store.showFlowRun(flow.id, scenario.id));
    });

    effect(() => {
      const tab = this.tab();
      if (tab.kind !== 'flow' || this.store.flowRunning())
        return;
      const checkpoint = this.store.runCheckpoint(tab.nodeId);
      if (!checkpoint || checkpoint.kind !== 'flow')
        return;
      if (this.checkpointPrompted.has(tab.nodeId))
        return;
      this.checkpointPrompted.add(tab.nodeId);
      untracked(() => void this.offerFlowCheckpoint(tab.nodeId, checkpoint));
    });

    // Enable outline/inspector toggles after Design is showing (no nested anim on first paint).
    effect(() => {
      if (this.section() !== 'design') {
        untracked(() => {
          this.clearDesignChromeTimer();
          this.designChromeAnimate.set(false);
        });
        return;
      }
      if (this.sectionSlideDir())
        return;
      untracked(() => this.armDesignChromeAnimate(0));
    });

    // Apply durable per-flow chrome onto a freshly opened tab.
    effect(() => {
      const tab = this.tab();
      const ui = this.store.flowUi(tab.nodeId);
      const patch: Partial<{ serviceSection: string; flowScenarioId: string; flowSelectedNodeIds: string[]; flowOutlineOpen: boolean }> = {};
      if (ui.section && !tab.serviceSection)
        patch.serviceSection = normalizeFlowSection(ui.section);
      if (ui.scenarioId && tab.flowScenarioId !== ui.scenarioId)
        patch.flowScenarioId = ui.scenarioId;
      if (ui.outlineOpen === true && tab.flowOutlineOpen !== true)
        patch.flowOutlineOpen = true;
      if (ui.selectedNodeIds.length > 0 && !(tab.flowSelectedNodeIds?.length))
        patch.flowSelectedNodeIds = [...ui.selectedNodeIds];
      if (Object.keys(patch).length === 0)
        return;
      this.workbench.patchTab(tab.id, patch);
    });

    // Restore active scenario from durable flow UI / tab.
    effect(() => {
      const tab = this.tab();
      const scenarioId = tab.flowScenarioId ?? this.store.flowUi(tab.nodeId).scenarioId;
      if (!scenarioId)
        return;
      const flow = this.store.findFlow(tab.nodeId);
      if (!flow?.scenarios.some((item) => item.id === scenarioId))
        return;
      if (this.store.activeScenarioId(tab.nodeId) === scenarioId)
        return;
      this.store.selectScenario(tab.nodeId, scenarioId);
    });

    // Hydrate selection from durable flow UI when the tab or scenario changes.
    effect(() => {
      const tab = this.tab();
      const scenario = this.store.activeScenario(tab.nodeId);
      const saved = this.store.flowUi(tab.nodeId).selectedNodeIds ?? tab.flowSelectedNodeIds ?? [];
      const valid = scenario
        ? saved.filter((id) => scenario.nodes.some((node) => node.id === id))
        : [];
      const current = untracked(() => this.selectedIds());
      if (sameIdList(current, valid))
        return;
      this.selectedIds.set(valid);
    });

    // Keep a local draft graph so edits can be discarded until Save.
    // Draft is authoritative for the open scenario — never reset it from the store
    // on the same scenario key (auto-save used to clear dirty before the write
    // finished, and hydrate then wiped inspector edits like packageName).
    effect(() => {
      const flowId = this.tab().nodeId;
      const scenario = this.scenario();
      const key = `${flowId}:${scenario?.id ?? ''}`;
      const snapshot: FlowGraph = scenario
        ? { nodes: scenario.nodes, edges: scenario.edges }
        : { nodes: [], edges: [] };
      untracked(() => {
        if (key === this.graphHydrateKey)
          return;
        this.graphHydrateKey = key;
        this.graphHistory.clear();
        this.draftGraph.set(snapshot);
        this.dirty.set(false);
      });
    });

    // Flipping to auto with a dirty draft writes once; reverse starts clean from store.
    effect(() => {
      const manual = isManualSaveMode(this.desktop.settings());
      untracked(() => {
        if (manual)
          return;
        if (!this.dirty())
          return;
        const flow = this.flow();
        const scenario = this.scenario();
        if (!flow || !scenario)
          return;
        const graph = this.draftGraph();
        void this.store.patchScenario(flow.id, scenario.id, {
          nodes: graph.nodes,
          edges: graph.edges,
        });
        this.dirty.set(false);
      });
    });
  }

  readonly selectedNode = computed(() => {
    const ids = this.selectedIds();
    if (ids.length !== 1)
      return null;
    return findFlowGraphNode(this.graph(), ids[0]!) ?? null;
  });

  readonly selectedEdge = computed(() => {
    const edges = this.graph().edges;
    const ids = this.selectedEdgeIds();
    if (ids.length !== 1)
      return null;
    return edges.find((edge) => edge.id === ids[0]!) ?? null;
  });

  /** Screen insets for Start/End pinning while outline/inspector float over the canvas. */
  readonly canvasInsetLeft = computed(() => (this.outlineOpen() ? 230 : 0));
  readonly canvasInsetRight = computed(() =>
    this.selectedEdge() || this.selectedNode() ? this.inspectorPanelWidth() : 0,
  );

  readonly wideInspector = computed(() => {
    const kind = this.selectedNode()?.kind;
    return kind ? isWideFlowInspectorKind(kind) : false;
  });

  readonly inspectorPanelWidth = computed(() =>
    this.wideInspector() ? this.store.flowInspectorWideWidth() : this.store.flowInspectorWidth(),
  );

  readonly inspectorResizing = signal(false);
  private inspectorDragStartX = 0;
  private inspectorDragStartWidth = 0;
  private inspectorDragWide = false;
  private inspectorDragListenersBound = false;

  readonly runOrder = computed(() => flowRunOrderIndex(this.graph()));
  readonly nodeCount = computed(() => countFlowScenarioNodes(this.graph()));
  readonly rowTotal = computed(() => {
    const scenario = this.scenario();
    return scenario ? flowScenarioRunCount(scenario) : 1;
  });
  readonly statuses = computed(() => {
    const graphIds = new Set(this.graph().nodes.map((node) => node.id));
    const rawAll = this.store.flowStepStatuses() as Readonly<Record<string, FlowNodeStatus>>;
    const next: Record<string, FlowNodeStatus> = {};
    for (const [id, status] of Object.entries(rawAll)) {
      if (graphIds.has(id))
        next[id] = status;
    }
    const running = this.store.flowRunning();
    if (running) {
      for (const node of this.graph().nodes) {
        if (node.kind === 'note' || node.enabled === false)
          continue;
        if (!next[node.id])
          next[node.id] = 'waiting';
      }
      const rows = this.rowTotal();
      if (rows > 1) {
        const stepRows = this.store.flowStepRowIndex();
        for (const [id, status] of Object.entries(next)) {
          if (status !== 'ok')
            continue;
          if ((stepRows[id] ?? 0) < rows - 1)
            next[id] = 'running';
        }
      }
    }

    // End never runs after a mid-graph failure — paint it from this graph's run outcome.
    const values = Object.values(next);
    if (values.length === 0)
      return next;
    const hasError = values.includes('error');
    const hasCancelled = values.includes('cancelled');
    for (const node of this.graph().nodes) {
      if (node.kind !== 'end')
        continue;
      if (hasError)
        next[node.id] = 'error';
      else if (hasCancelled)
        next[node.id] = 'cancelled';
      else if (!running && values.every((status) => status === 'ok' || status === 'skipped'))
        next[node.id] = 'ok';
    }
    return next;
  });
  readonly errorMessages = computed(() => {
    const base = { ...this.store.flowStepMessages() };
    if (!this.store.flowRunning())
      return base;
    const rows = this.rowTotal();
    if (rows <= 1)
      return base;
    const stepRows = this.store.flowStepRowIndex();
    const raw = this.store.flowStepStatuses();
    for (const [id, status] of Object.entries(raw)) {
      const row = stepRows[id] ?? 0;
      const label = `${row + 1}/${rows}`;
      if (status === 'running')
        base[id] = label;
      else if (status === 'ok' && row < rows - 1)
        base[id] = label;
    }
    return base;
  });

  readonly totalRuns = computed(() =>
    this.scenarios()
      .filter((item) => item.enabled)
      .reduce((sum, item) => sum + flowScenarioRunCount(item), 0),
  );

  readonly runSummary = computed(() => {
    const graphIds = new Set(this.graph().nodes.map((node) => node.id));
    const values = Object.entries(this.store.flowStepStatuses())
      .filter(([id]) => graphIds.has(id))
      .map(([, status]) => status);
    if (!this.store.flowRunning() && values.length === 0)
      return null;
    const failed = values.filter((value) => value === 'error').length;
    return {
      running: this.store.flowRunning(),
      passed: values.filter((value) => value === 'ok').length,
      failed,
      skipped: values.filter((value) => value === 'skipped').length,
      label: this.store.flowRunning() ? 'Running' : failed > 0 ? 'Failed' : 'Passed',
    };
  });

  readonly hasE2eNodes = computed(() => {
    const flow = this.flow();
    return flow ? flowHasBrowserNodes(flow.scenarios) : false;
  });

  readonly hasDeviceNodes = computed(() => {
    const flow = this.flow();
    return flow ? flowHasDeviceNodes(flow.scenarios) : false;
  });

  readonly canRunCurrent = computed(() => flowHasStartToEndPath(this.graph()));

  readonly canRunAll = computed(() => {
    const flow = this.flow();
    if (!flow)
      return false;
    const enabled = flow.scenarios.filter((item) => item.enabled);
    return enabled.length > 1 && enabled.every((item) => flowHasStartToEndPath(item));
  });

  readonly showRunAll = computed(() => (this.flow()?.scenarios.length ?? 0) > 1);

  readonly scenariosRunModeOptions = [
    { value: 'sequential', label: 'One by one' },
    { value: 'parallel', label: 'All at once' },
  ];

  readonly resolvedEnvironment = computed(() => {
    const id = this.environments.activeId();
    return this.environments.items().find((item) => item.id === id) ?? null;
  });

  readonly placeholderVariables = computed(() => {
    const env = this.resolvedEnvironment();
    const envNames = env ? Object.keys(environmentVariableMap(env.variables)) : [];
    const columns = this.scenario()?.data.columns ?? [];
    return [...new Set([...envNames, ...columns])];
  });

  readonly variableOrigins = computed(() => {
    const env = this.resolvedEnvironment();
    const base = winningVariableOrigins({
      folders: [],
      environment: env ? { id: env.id, name: env.name, variables: env.variables } : null,
    });
    const scenario = this.scenario();
    if (!scenario?.data.columns.length)
      return base;
    const byKey = new Map(base.map((origin) => [origin.name.toLowerCase(), origin] as const));
    for (const column of scenario.data.columns) {
      const name = column.trim();
      if (!name)
        continue;
      byKey.set(name.toLowerCase(), {
        name,
        kind: 'data',
        sourceId: scenario.id,
        sourceName: scenario.name || 'Data rows',
      });
    }
    return [...byKey.values()];
  });

  readonly connectionOptions = computed(() =>
    flattenDatabaseConnections(this.desktop.databases().nodes).map((node) => ({
      value: node.id,
      label: `${node.name} · ${DATABASE_TYPE_LABELS[node.type]}`,
    })),
  );

  readonly flowOptions = computed(() => {
    const items = this.desktop.flows().items;
    const self = this.tab().nodeId;
    return collectServiceArtifactIds(items)
      .filter((id) => id !== self)
      .map((id) => ({ value: id, label: this.store.findFlow(id)?.name ?? id }));
  });

  placeholderOrigins(): readonly PlaceholderOrigin[] {
    return this.variableOrigins();
  }

  openPlaceholder(activate: PlaceholderActivate): void {
    if (activate.kind === 'data') {
      this.handleSection('data');
      return;
    }
    openPlaceholderOrigin(activate, {
      collections: this.collections,
      workbench: this.workbench,
      environments: this.environments,
    });
  }

  // -- shell ----------------------------------------------------------------

  handleSection(id: string): void {
    const next = normalizeFlowSection(id);
    if (next === this.section())
      return;
    const from = FLOW_SECTIONS.indexOf(this.section());
    const to = FLOW_SECTIONS.indexOf(next);
    this.sectionSlideDir.set(to >= from ? 'right' : 'left');
    // Drop nested slide leave/enter so only the section pane animates.
    this.clearDesignChromeTimer();
    this.designChromeAnimate.set(false);
    this.closeMenu();
    this.picker.set(null);
    this.workbench.patchTab(this.tab().id, { serviceSection: next });
    this.store.patchFlowUi(this.tab().nodeId, { section: next });
    if (next === 'design') {
      this.fitToken.update((value) => value + 1);
      this.armDesignChromeAnimate(450);
    }
  }

  applyHistoryRun(run: SessionFlowLastRun): void {
    const flow = this.flow();
    if (!flow)
      return;
    this.store.applyFlowRun(flow.id, run);
    this.handleSection('design');
  }

  clearHistoryRuns(): void {
    const flow = this.flow();
    const scenario = this.scenario();
    if (!flow || !scenario)
      return;
    this.store.clearFlowRunHistory(flow.id, scenario.id);
  }

  sectionPaneEnter(): string | undefined {
    return this.sectionSlideDir() ? 'tx-folder-pane-in' : undefined;
  }

  private armDesignChromeAnimate(delayMs: number): void {
    this.clearDesignChromeTimer();
    if (delayMs <= 0) {
      this.designChromeAnimate.set(true);
      return;
    }
    this.designChromeTimer = setTimeout(() => {
      this.designChromeTimer = null;
      if (this.section() === 'design')
        this.designChromeAnimate.set(true);
    }, delayMs);
  }

  private clearDesignChromeTimer(): void {
    if (!this.designChromeTimer)
      return;
    clearTimeout(this.designChromeTimer);
    this.designChromeTimer = null;
  }

  setTags(tags: readonly string[]): void {
    const flow = this.flow();
    if (!flow)
      return;
    void this.store.patchFlow(flow.id, { tags: [...tags] });
  }

  setE2eShowWindow(value: boolean): void {
    const flow = this.flow();
    if (!flow)
      return;
    void this.store.patchFlow(flow.id, { e2eShowWindow: value });
  }

  setDeviceShowEmulator(value: boolean): void {
    const flow = this.flow();
    if (!flow)
      return;
    void this.store.patchFlow(flow.id, { deviceShowEmulator: value });
  }

  handleDocsMode(mode: FolderDocsMode): void {
    this.docsMode.set(mode);
  }

  setScenariosRunMode(value: string): void {
    const flow = this.flow();
    if (!flow)
      return;
    void this.store.patchFlow(flow.id, { scenariosRunMode: parseFlowScenariosRunMode(value) });
  }

  runFlow(): void {
    const flow = this.flow();
    const scenario = this.scenario();
    if (!flow || !scenario || this.store.flowRunning() || !this.canRunCurrent())
      return;
    // Always run the on-screen draft so inspector edits (package, selector, …) apply
    // even when auto-save cleared dirty before the store write finished.
    void this.store.runFlowDraft(
      {
        ...scenario,
        nodes: this.draftGraph().nodes,
        edges: this.draftGraph().edges,
      },
      { e2eShowWindow: flow.e2eShowWindow, deviceShowEmulator: flow.deviceShowEmulator },
    );
  }

  runAllScenarios(): void {
    const flow = this.flow();
    if (!flow || this.store.flowRunning() || !this.canRunAll())
      return;
    void this.store.runFlow(flow.id);
  }

  runScenario(scenarioId: string): void {
    const flow = this.flow();
    const scenario = flow?.scenarios.find((item) => item.id === scenarioId);
    if (!flow || this.store.flowRunning() || !scenario || !flowHasStartToEndPath(scenario))
      return;
    const active = this.scenario();
    if (active?.id === scenarioId) {
      void this.store.runFlowDraft(
        {
          ...scenario,
          nodes: this.draftGraph().nodes,
          edges: this.draftGraph().edges,
        },
        { e2eShowWindow: flow.e2eShowWindow, deviceShowEmulator: flow.deviceShowEmulator },
      );
      return;
    }
    void this.store.runFlow(flow.id, scenarioId);
  }

  cancelFlow(): void {
    if (!this.store.flowRunning())
      return;
    void this.store.cancelFlow();
  }

  // -- scenarios ------------------------------------------------------------

  selectScenario(id: string): void {
    const flow = this.flow();
    if (!flow)
      return;
    this.store.selectScenario(flow.id, id);
    this.setSelectedIds([]);
    this.workbench.patchTab(this.tab().id, { flowScenarioId: id, flowSelectedNodeIds: [] });
    this.fitToken.update((value) => value + 1);
  }

  addScenario(): void {
    const flow = this.flow();
    if (!flow)
      return;
    void this.store.addScenario(flow.id).then((id) => {
      if (!id)
        return;
      this.setSelectedIds([]);
      this.workbench.patchTab(this.tab().id, { flowScenarioId: id, flowSelectedNodeIds: [] });
      this.fitToken.update((value) => value + 1);
    });
  }

  duplicateScenario(id: string): void {
    const flow = this.flow();
    if (!flow)
      return;
    void this.store.duplicateScenario(flow.id, id).then(() => {
      const next = this.store.activeScenarioId(flow.id);
      if (!next)
        return;
      this.setSelectedIds([]);
      this.workbench.patchTab(this.tab().id, { flowScenarioId: next, flowSelectedNodeIds: [] });
      this.fitToken.update((value) => value + 1);
    });
  }

  async removeScenario(id: string): Promise<void> {
    const flow = this.flow();
    if (!flow)
      return;
    const ok = await this.confirm.ask({
      title: 'Delete this scenario?',
      body: 'Its nodes and data rows go with it.',
      confirmLabel: 'Delete',
    });
    if (!ok)
      return;
    await this.store.removeScenario(flow.id, id);
    const next = this.store.activeScenarioId(flow.id);
    this.setSelectedIds([]);
    this.workbench.patchTab(this.tab().id, {
      flowScenarioId: next ?? undefined,
      flowSelectedNodeIds: [],
    });
    this.fitToken.update((value) => value + 1);
  }

  renameScenario(payload: { readonly id: string; readonly name: string }): void {
    const flow = this.flow();
    if (flow)
      void this.store.patchScenario(flow.id, payload.id, { name: payload.name });
  }

  toggleScenario(payload: { readonly id: string; readonly enabled: boolean }): void {
    const flow = this.flow();
    if (flow)
      void this.store.patchScenario(flow.id, payload.id, { enabled: payload.enabled });
  }

  patchData(patch: Partial<FlowScenarioData>): void {
    const flow = this.flow();
    const scenario = this.scenario();
    if (!flow || !scenario)
      return;
    void this.store.patchScenario(flow.id, scenario.id, { data: { ...scenario.data, ...patch } });
  }

  toggleOutline(): void {
    this.designChromeAnimate.set(true);
    const next = !this.outlineOpen();
    this.store.patchFlowUi(this.tab().nodeId, { outlineOpen: next });
    this.workbench.patchTab(this.tab().id, { flowOutlineOpen: next });
  }

  handleInspectorResizeStart(event: PointerEvent): void {
    if (event.button !== 0)
      return;
    event.preventDefault();
    event.stopPropagation();
    this.inspectorResizing.set(true);
    this.inspectorDragStartX = event.clientX;
    this.inspectorDragStartWidth = this.inspectorPanelWidth();
    this.inspectorDragWide = this.wideInspector();
    this.bindInspectorResize();
  }

  handleInspectorResizeKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? 16 : -16;
    this.store.setFlowInspectorWidth(this.inspectorPanelWidth() + delta, this.wideInspector());
  }

  private bindInspectorResize(): void {
    if (this.inspectorDragListenersBound)
      return;
    this.inspectorDragListenersBound = true;
    window.addEventListener('pointermove', this.handleInspectorResizeMove);
    window.addEventListener('pointerup', this.handleInspectorResizeUp);
    window.addEventListener('pointercancel', this.handleInspectorResizeUp);
  }

  private unbindInspectorResize(): void {
    if (!this.inspectorDragListenersBound)
      return;
    this.inspectorDragListenersBound = false;
    window.removeEventListener('pointermove', this.handleInspectorResizeMove);
    window.removeEventListener('pointerup', this.handleInspectorResizeUp);
    window.removeEventListener('pointercancel', this.handleInspectorResizeUp);
  }

  private readonly handleInspectorResizeMove = (event: PointerEvent): void => {
    if (!this.inspectorResizing())
      return;
    // Handle is on the left edge: drag left widens the panel.
    const next = Math.round(this.inspectorDragStartWidth + (this.inspectorDragStartX - event.clientX));
    this.store.setFlowInspectorWidth(next, this.inspectorDragWide);
  };

  private readonly handleInspectorResizeUp = (): void => {
    if (!this.inspectorResizing())
      return;
    this.unbindInspectorResize();
    this.inspectorResizing.set(false);
    this.store.setFlowInspectorWidth(
      clampFlowInspectorWidth(this.inspectorPanelWidth()),
      this.inspectorDragWide,
    );
  };

  /** Selection is local for snappy UI and mirrored onto durable flow UI + tab. */
  private setSelectedIds(ids: readonly string[]): void {
    this.selectedIds.set(ids);
    this.devicePickError.set(null);
    const flowId = this.tab().nodeId;
    const saved = this.store.flowUi(flowId).selectedNodeIds ?? [];
    if (!sameIdList(saved, ids))
      this.store.patchFlowUi(flowId, { selectedNodeIds: [...ids] });
    const tabIds = this.tab().flowSelectedNodeIds ?? [];
    if (!sameIdList(tabIds, ids))
      this.workbench.patchTab(this.tab().id, { flowSelectedNodeIds: [...ids] });
  }

  private setSelectedEdgeIds(ids: readonly string[]): void {
    this.selectedEdgeIds.set(ids);
  }

  // -- graph ----------------------------------------------------------------

  private commit(graph: FlowGraph): void {
    this.graphHistory.beforeCommit(this.draftGraph());
    this.draftGraph.set(graph);
    if (!isManualSaveMode(this.desktop.settings())) {
      const flow = this.flow();
      const scenario = this.scenario();
      if (flow && scenario) {
        void this.store.patchScenario(flow.id, scenario.id, {
          nodes: graph.nodes,
          edges: graph.edges,
        });
      }
      this.dirty.set(false);
      return;
    }
    this.dirty.set(true);
  }

  undoGraph(): void {
    const prev = this.graphHistory.undo(this.draftGraph());
    if (!prev)
      return;
    try {
      this.commit(prev);
      this.pruneSelectionToGraph(prev);
    } finally {
      this.graphHistory.endApply();
    }
  }

  redoGraph(): void {
    const next = this.graphHistory.redo(this.draftGraph());
    if (!next)
      return;
    try {
      this.commit(next);
      this.pruneSelectionToGraph(next);
    } finally {
      this.graphHistory.endApply();
    }
  }

  private pruneSelectionToGraph(graph: FlowGraph): void {
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const edgeIds = new Set(graph.edges.map((edge) => edge.id));
    this.setSelectedIds(this.selectedIds().filter((id) => nodeIds.has(id)));
    this.setSelectedEdgeIds(this.selectedEdgeIds().filter((id) => edgeIds.has(id)));
  }

  saveGraph(): void {
    const flow = this.flow();
    const scenario = this.scenario();
    if (!flow || !scenario || !this.dirty() || this.store.flowRunning())
      return;
    if (!isManualSaveMode(this.desktop.settings()))
      return;
    const graph = this.draftGraph();
    void this.store.patchScenario(flow.id, scenario.id, {
      nodes: graph.nodes,
      edges: graph.edges,
    });
    this.dirty.set(false);
  }

  discardGraph(): void {
    if (!this.dirty() || this.store.flowRunning())
      return;
    if (!isManualSaveMode(this.desktop.settings()))
      return;
    const scenario = this.scenario();
    this.graphHistory.clear();
    this.draftGraph.set(
      scenario ? { nodes: scenario.nodes, edges: scenario.edges } : { nodes: [], edges: [] },
    );
    this.dirty.set(false);
  }

  handleSelection(ids: readonly string[]): void {
    this.setSelectedIds(ids);
  }

  handleEdgeSelection(ids: readonly string[]): void {
    this.setSelectedEdgeIds(ids);
  }

  handleMove(payload: {
    readonly nodes: FlowGraph['nodes'];
    readonly edges: FlowGraph['edges'];
  }): void {
    // Apply the canvas-held graph directly — store saves are async and deltas would race.
    this.commit({ nodes: payload.nodes, edges: payload.edges });
  }

  handleFrameResized(payload: { readonly id: string; readonly width: number; readonly height: number }): void {
    this.commit(patchNodeConfig(this.graph(), payload.id, { width: payload.width, height: payload.height }));
  }

  handleConnect(payload: { readonly from: string; readonly fromPort: FlowPort; readonly to: string }): void {
    this.commit(connectNodes(this.graph(), payload.from, payload.fromPort, payload.to));
  }

  handleConnectDropped(payload: { readonly from: string; readonly fromPort: FlowPort; readonly x: number; readonly y: number }): void {
    this.picker.set({ at: { x: payload.x, y: payload.y }, after: { id: payload.from, port: payload.fromPort } });
  }

  handleNodeMenu(payload: { readonly id: string; readonly x: number; readonly y: number }): void {
    this.openMenu({ kind: 'node', ...payload }, payload.x, payload.y);
  }

  handleEdgeMenu(payload: { readonly id: string; readonly x: number; readonly y: number }): void {
    this.openMenu({ kind: 'edge', ...payload }, payload.x, payload.y);
  }

  handleCanvasMenu(payload: FlowCanvasMenuEvent): void {
    this.openPicker(pickerTargetFromEmptyCanvas(payload.worldX, payload.worldY));
  }

  autoLayout(): void {
    this.closeMenu();
    const scenario = this.scenario();
    if (!scenario)
      return;
    this.commit(autoLayoutScenario({ nodes: scenario.nodes, edges: scenario.edges }));
    this.fitToken.update((value) => value + 1);
  }

  openPicker(target: PickerTarget): void {
    this.closeMenu();
    this.picker.set(target);
  }

  pickKind(kind: FlowNodeKind): void {
    const target = this.picker();
    this.picker.set(null);
    if (!target)
      return;
    const graph = this.graph();

    if (target.onEdge) {
      const result = insertOnEdge(graph, target.onEdge, kind);
      this.commit(result.graph);
      this.setSelectedIds(result.id ? [result.id] : []);
      return;
    }

    if (target.split) {
      const result = splitFromNode(graph, target.split.id, kind, target.split.port);
      this.commit(result.graph);
      this.setSelectedIds(result.id ? [result.id] : []);
      return;
    }

    const result = addNode(graph, kind, {
      at: target.at,
      after: target.after ?? null,
      parentId: target.parentId,
    });
    this.commit(result.graph);
    this.setSelectedIds([result.id]);
  }

  pickTemplate(template: FlowGraphTemplate): void {
    const target = this.picker();
    this.picker.set(null);
    this.closeMenu();
    const at = target?.at ?? { x: 120, y: 120 };
    const result = insertFlowTemplate(this.graph(), template, at);
    this.commit(result.graph);
    this.setSelectedIds(result.ids);
  }

  async saveSelectionAsTemplate(): Promise<void> {
    this.closeMenu();
    const template = captureFlowTemplate(this.graph(), this.menuTargets());
    if (!template)
      return;
    await this.templatesStore.save(template);
    this.templatesStore.renamingId.set(template.id);
    this.templatesStore.openPanel();
  }

  patchSelected(patch: Partial<FlowGraphNode>): void {
    const id = this.selectedNode()?.id;
    if (id)
      this.commit(patchNode(this.graph(), id, patch));
  }

  patchSelectedConfig(config: Readonly<Record<string, FlowNodeConfigValue>>): void {
    const id = this.selectedNode()?.id;
    if (id)
      this.commit(patchNodeConfig(this.graph(), id, config));
  }

  async pickSelectorOnPage(): Promise<void> {
    if (this.pickingSelector() || this.pickingDeviceSelector() || this.store.flowRunning())
      return;
    const node = this.selectedNode();
    if (!node)
      return;
    const scenario = this.scenario();
    if (!scenario)
      return;
    this.pickingSelector.set(true);
    try {
      const url = this.pickPageUrl();
      const draft = {
        ...scenario,
        nodes: this.draftGraph().nodes,
        edges: this.draftGraph().edges,
      };
      const result = await this.desktop.api.services.flows.pickSelector({
        url,
        kind: node.kind,
        stopBeforeNodeId: node.id,
        scenario: draft,
      });
      if (result.ok && result.selector)
        this.patchSelectedConfig({ selector: result.selector });
    } finally {
      this.pickingSelector.set(false);
    }
  }

  async pickDeviceSelectorOnDevice(options: { readonly runPrevious?: boolean } = {}): Promise<void> {
    if (this.pickingDeviceSelector() || this.pickingSelector() || this.store.flowRunning())
      return;
    const node = this.selectedNode();
    if (!node)
      return;
    const scenario = this.scenario();
    if (!scenario)
      return;
    this.devicePickError.set(null);
    this.pickingDeviceSelector.set(true);
    try {
      const draft = {
        ...scenario,
        nodes: this.draftGraph().nodes,
        edges: this.draftGraph().edges,
      };
      const result = await this.desktop.api.services.flows.pickDeviceSelector({
        stopBeforeNodeId: node.id,
        scenario: draft,
        runPrevious: options.runPrevious === true,
      });
      if (result.ok && result.selector) {
        this.patchSelectedConfig({ selector: result.selector });
        return;
      }
      if (result.cancelled)
        return;
      if (result.error)
        this.devicePickError.set(result.error);
    } catch (error) {
      this.devicePickError.set(error instanceof Error ? error.message : 'Device pick failed');
    } finally {
      this.pickingDeviceSelector.set(false);
    }
  }

  /**
   * URL the picker should open. Resolved for the browser only — the Open node
   * keeps `{{url}}` and is not replaced with the loaded address.
   */
  private pickPageUrl(): string | null {
    const env = this.resolvedEnvironment();
    const vars = env ? environmentVariableMap(env.variables) : {};
    const open =
      this.graph().nodes.find((item) => item.kind === 'browser-open' && item.enabled !== false) ??
      this.graph().nodes.find((item) => item.kind === 'browser-open');
    if (!open)
      return null;
    const raw = flowConfigString(open, 'url', '').trim();
    if (!raw)
      return null;
    return resolveFlowBrowserOpenUrl(raw, vars, {
      emailDomain: this.desktop.settings().placeholderEmailDomain,
    }) || null;
  }

  duplicateSelection(): void {
    this.closeMenu();
    const ids = this.menuTargets();
    if (ids.length === 0)
      return;
    const result = duplicateNodes(this.graph(), ids);
    this.commit(result.graph);
    this.setSelectedIds(result.id ? [result.id] : []);
  }

  copySelection(): void {
    const ids = this.selectedIds();
    const slice = copyFlowSelection(this.graph(), ids);
    if (!slice)
      return;
    this.flowClipboard.set(slice);
  }

  cutSelection(): void {
    const ids = this.selectedIds().filter((id) => {
      const node = this.graph().nodes.find((item) => item.id === id);
      return node ? node.kind !== 'start' && node.kind !== 'end' : false;
    });
    const slice = copyFlowSelection(this.graph(), ids);
    if (!slice)
      return;
    this.flowClipboard.set(slice);
    this.commit(removeNodes(this.graph(), ids));
    this.setSelectedIds([]);
    this.setSelectedEdgeIds([]);
  }

  async pasteClipboard(): Promise<void> {
    const slice = await this.flowClipboard.get();
    if (!slice)
      return;
    const result = pasteFlowSelection(this.graph(), slice);
    if (result.selectedIds.length === 0)
      return;
    this.commit(result.graph);
    this.setSelectedIds(result.selectedIds);
    this.setSelectedEdgeIds([]);
  }

  toggleSelection(): void {
    const ids = this.menuTargets();
    this.closeMenu();
    if (ids.length === 0)
      return;
    const graph = this.graph();
    const allOn = ids.every((id) => graph.nodes.find((node) => node.id === id)?.enabled !== false);
    this.commit(setNodesEnabled(graph, ids, !allOn));
  }

  async deleteSelection(): Promise<void> {
    const edgeIds = this.selectedEdgeIds();
    const ids = this.menuTargets();
    this.closeMenu();

    if (edgeIds.length > 0 && ids.length === 0) {
      let graph = this.graph();
      for (const id of edgeIds)
        graph = disconnectEdge(graph, id);
      this.commit(graph);
      this.selectedEdgeIds.set([]);
      return;
    }

    if (ids.length === 0)
      return;

    const graph = this.graph();
    const onlyNotes =
      ids.length > 0 &&
      ids.every((id) => graph.nodes.find((node) => node.id === id)?.kind === 'note');
    const ok = await this.confirm.ask({
      title: onlyNotes
        ? ids.length > 1
          ? `Delete ${ids.length} strings?`
          : 'Delete this string?'
        : ids.length > 1
          ? `Delete ${ids.length} nodes?`
          : 'Delete this node?',
      body: onlyNotes
        ? 'This removes the selected string(s) from the canvas.'
        : edgeIds.length > 0
          ? 'Selected nodes and wires will be removed. Neighbours reconnect.'
          : 'Nodes inside a container go with it. Neighbours reconnect.',
      confirmLabel: 'Delete',
    });
    if (!ok)
      return;
    let next = removeNodes(this.graph(), ids);
    for (const id of edgeIds) {
      if (next.edges.some((edge) => edge.id === id))
        next = disconnectEdge(next, id);
    }
    this.commit(next);
    this.setSelectedIds([]);
    this.selectedEdgeIds.set([]);
  }

  deleteEdge(): void {
    const menu = this.menu();
    this.closeMenu();
    if (menu?.kind === 'edge') {
      this.commit(disconnectEdge(this.graph(), menu.id));
      this.selectedEdgeIds.set(this.selectedEdgeIds().filter((id) => id !== menu.id));
      return;
    }
    const selected = this.selectedEdgeIds();
    if (selected.length === 0)
      return;
    let graph = this.graph();
    for (const id of selected)
      graph = disconnectEdge(graph, id);
    this.commit(graph);
    this.selectedEdgeIds.set([]);
  }

  edgeMenuName(): string {
    const menu = this.menu();
    if (menu?.kind !== 'edge')
      return '';
    return this.graph().edges.find((edge) => edge.id === menu.id)?.name?.trim() ?? '';
  }

  renameEdge(): void {
    const menu = this.menu();
    this.closeMenu();
    if (menu?.kind !== 'edge')
      return;
    this.openEdgeRename(menu.id);
  }

  openEdgeRename(edgeId: string): void {
    const current = this.graph().edges.find((edge) => edge.id === edgeId)?.name ?? '';
    this.edgeRename.set({ id: edgeId, name: current });
    setTimeout(() => {
      const input = document.getElementById('flow-edge-name');
      if (!(input instanceof HTMLInputElement) && !(input instanceof HTMLTextAreaElement))
        return;
      input.focus();
      input.select();
    }, 0);
  }

  patchSelectedEdgeName(name: string): void {
    const edge = this.selectedEdge();
    if (!edge)
      return;
    this.commit(renameEdge(this.graph(), edge.id, name));
  }

  setEdgeRenameName(name: string): void {
    const draft = this.edgeRename();
    if (!draft)
      return;
    this.edgeRename.set({ ...draft, name });
  }

  commitEdgeRename(): void {
    const draft = this.edgeRename();
    if (!draft)
      return;
    this.edgeRename.set(null);
    this.commit(renameEdge(this.graph(), draft.id, draft.name));
  }

  cancelEdgeRename(): void {
    this.edgeRename.set(null);
  }

  openExchangeViewer(nodeId: string): void {
    const detail = this.store.flowStepExchanges()[nodeId];
    if (!detail)
      return;
    const node = this.graph().nodes.find((item) => item.id === nodeId);
    this.exchangeViewer.set({
      nodeId,
      title: node ? `${flowNodeLabel(node)} · exchange` : 'HTTP exchange',
    });
  }

  openHistoryExchange(request: FlowHistoryExchangeRequest): void {
    this.exchangeViewer.set({
      nodeId: request.stepId,
      title: request.title,
      detail: request.detail,
    });
  }

  closeExchangeViewer(): void {
    this.exchangeViewer.set(null);
  }

  exchangeDetail() {
    const viewer = this.exchangeViewer();
    if (!viewer)
      return null;
    return viewer.detail ?? this.store.flowStepExchanges()[viewer.nodeId] ?? null;
  }

  clearEdgeName(): void {
    const menu = this.menu();
    this.closeMenu();
    if (menu?.kind === 'edge')
      this.commit(renameEdge(this.graph(), menu.id, ''));
  }

  focusNode(id: string): void {
    this.setSelectedIds([id]);
    this.canvas()?.focusViewport();
  }

  private async offerFlowCheckpoint(
    flowId: string,
    checkpoint: { readonly savedAt: string; readonly kind: 'flow' | 'load'; readonly json: string },
  ): Promise<void> {
    const when = new Date(checkpoint.savedAt).toLocaleString();
    const ok = await this.confirm.ask({
      title: 'Resume interrupted flow run?',
      body: `A run checkpoint from ${when} is saved in this session. Restore step results on the canvas, or discard the checkpoint.`,
      confirmLabel: 'Restore',
      cancelLabel: 'Discard',
    });
    if (ok) {
      this.store.restoreFlowRunCheckpoint(flowId);
      return;
    }
    this.store.clearRunCheckpoint(flowId);
  }

  /** Nodes the current menu acts on: the selection, or the row under the pointer. */
  private menuTargets(): readonly string[] {
    const menu = this.menu();
    const selected = this.selectedIds();
    if (menu?.kind === 'node')
      return selected.includes(menu.id) ? selected : [menu.id];
    return selected;
  }

  menuNodeId(): string | null {
    const menu = this.menu();
    return menu?.kind === 'node' ? menu.id : null;
  }

  menuNodePorts(): readonly FlowPort[] {
    const id = this.menuNodeId();
    const node = id ? this.graph().nodes.find((item) => item.id === id) : null;
    if (!node)
      return [];
    return flowNodePorts(node.kind);
  }

  menuIsTerminal(): boolean {
    const id = this.menuNodeId();
    const node = id ? this.graph().nodes.find((item) => item.id === id) : null;
    return node?.kind === 'start' || node?.kind === 'end';
  }

  menuIsNote(): boolean {
    const id = this.menuNodeId();
    const node = id ? this.graph().nodes.find((item) => item.id === id) : null;
    return node?.kind === 'note';
  }

  menuIsFrame(): boolean {
    const id = this.menuNodeId();
    const node = id ? this.graph().nodes.find((item) => item.id === id) : null;
    return node ? isFlowFrameKind(node.kind) : false;
  }

  addInsideFrame(): void {
    const menu = this.menu();
    this.closeMenu();
    if (!menu || menu.kind !== 'node')
      return;
    this.openPicker({ parentId: menu.id, at: { x: 40, y: 80 } });
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (this.picker()) {
      this.picker.set(null);
      return;
    }
    this.closeMenu();
  }

  @HostListener('document:keydown', ['$event'])
  handleDocumentKeydown(event: KeyboardEvent): void {
    if (isEditableKeyboardTarget(event.target))
      return;
    if (this.tab().kind !== 'flow')
      return;

    if (isModKey(event, 'z') && !event.shiftKey) {
      if (this.section() !== 'design')
        return;
      event.preventDefault();
      this.undoGraph();
      return;
    }
    if ((isModKey(event, 'z') && event.shiftKey) || isModKey(event, 'y')) {
      if (this.section() !== 'design')
        return;
      event.preventDefault();
      this.redoGraph();
      return;
    }

    if (!isModKey(event, 's'))
      return;
    if (!shouldHandleManualSaveHotkey({ settings: this.desktop.settings(), dirty: this.dirty() }))
      return;
    event.preventDefault();
    this.saveGraph();
  }

  private openMenu(next: CanvasMenu, x: number, y: number): void {
    this.closeMenu();
    this.menu.set(next);
    const position = this.overlay.position().global();
    const overlayRef = this.overlay.create({
      positionStrategy: position,
      scrollStrategy: this.overlay.scrollStrategies.close(),
      panelClass: 'tx-overlay-menu',
    });
    overlayRef.attach(new TemplatePortal(this.menuTemplate(), this.vcr));
    this.menuOverlayRef = overlayRef;
    this.placeMenu(overlayRef, position, x, y);
    requestAnimationFrame(() => {
      if (this.menuOverlayRef === overlayRef)
        this.placeMenu(overlayRef, position, x, y);
    });
    window.setTimeout(() => {
      if (this.menuOverlayRef !== overlayRef)
        return;
      overlayRef.outsidePointerEvents().subscribe(() => this.closeMenu());
    });
  }

  private placeMenu(overlayRef: OverlayRef, position: GlobalPositionStrategy, x: number, y: number): void {
    const menu = overlayRef.overlayElement.querySelector('.tx-flow-editor__menu');
    const width = menu instanceof HTMLElement && menu.offsetWidth ? menu.offsetWidth : 200;
    const height = menu instanceof HTMLElement && menu.offsetHeight ? menu.offsetHeight : 240;
    const margin = 8;
    const left = x + width > window.innerWidth - margin ? Math.max(margin, x - width) : x;
    const top = y + height > window.innerHeight - margin ? Math.max(margin, y - height) : y;
    position.left(`${left}px`).top(`${top}px`);
    overlayRef.updatePosition();
  }

  private closeMenu(): void {
    this.menuOverlayRef?.dispose();
    this.menuOverlayRef = null;
    this.menu.set(null);
  }
}

function isWideFlowInspectorKind(kind: FlowNodeKind): boolean {
  return kind === 'request' || kind === 'database' || kind === 'http-interceptor';
}

function sameIdList(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length)
    return false;
  return a.every((id, index) => id === b[index]);
}
