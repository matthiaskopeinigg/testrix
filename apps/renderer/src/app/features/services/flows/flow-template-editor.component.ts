import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
  ViewContainerRef,
  type TemplateRef,
} from '@angular/core';
import { Overlay, type GlobalPositionStrategy, type OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  DATABASE_TYPE_LABELS,
  FLOW_NODE_GROUPS,
  collectServiceArtifactIds,
  countFlowScenarioNodes,
  environmentVariableMap,
  findFlowGraphNode,
  flattenDatabaseConnections,
  flowConfigString,
  flowPlaceholderNames,
  flowHasStartToEndPath,
  flowNodeLabel,
  flowRunOrderIndex,
  isFlowTerminalKind,
  newFlowScenarioId,
  type FlowGraphNode,
  type FlowNodeConfigValue,
  type FlowNodeKind,
  type FlowPort,
  type FlowScenario,
} from '@testrix/contracts';
import {
  TxHintComponent,
  TxInputComponent,
  TxOverlayComponent,
  TxOverlayHostDirective,
  TxTagsInputComponent,
} from '@testrix/ui';

import { EnvironmentsStore } from '../../environments/environments.store';
import { DesktopApiService } from '../../../core/desktop-api.service';
import { isEditableKeyboardTarget, isModKey } from '../../../core/selection-hotkeys';
import { ServiceIconComponent } from '../service-icon.component';
import { ServicesStore } from '../services.store';
import type { WorkbenchTab } from '../../workbench/workbench.store';
import { FlowCanvasComponent, type FlowCanvasMenuEvent } from './flow-canvas.component';
import { pickerTargetFromEmptyCanvas } from './flow-canvas-actions';
import { FlowRunExchangeComponent } from './flow-run-exchange.component';
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
  splitFromNode,
  type FlowGraph,
} from './flow-graph-model';
import { FlowClipboardService } from './flow-clipboard.service';
import { FlowInspectorComponent } from './flow-inspector.component';
import type { FlowNodeStatus } from './flow-node-card.component';
import { FlowNodeIconComponent } from './flow-node-icon.component';
import { FlowOutlineComponent } from './flow-outline.component';
import {
  captureFlowTemplate,
  graphFromFlowTemplate,
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
  readonly split?: { readonly id: string; readonly port: FlowPort };
}

@Component({
  selector: 'tx-flow-template-editor',
  standalone: true,
  imports: [
    TxHintComponent,
    TxInputComponent,
    TxTagsInputComponent,
    TxOverlayComponent,
    TxOverlayHostDirective,
    ServiceIconComponent,
    FlowCanvasComponent,
    FlowRunExchangeComponent,
    FlowInspectorComponent,
    FlowNodeIconComponent,
    FlowOutlineComponent,
  ],
  templateUrl: './flow-template-editor.component.html',
  styleUrls: ['./flows-editor.component.scss', './flow-template-editor.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowTemplateEditorComponent {
  readonly tab = input.required<WorkbenchTab>();

  private readonly templates = inject(FlowTemplatesStore);
  private readonly environments = inject(EnvironmentsStore);
  private readonly desktop = inject(DesktopApiService);
  readonly store = inject(ServicesStore);
  private readonly flowClipboard = inject(FlowClipboardService);
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly menuTemplate = viewChild.required<TemplateRef<unknown>>('templateMenu');
  private menuOverlayRef: OverlayRef | null = null;

  readonly nodeGroups = FLOW_NODE_GROUPS;

  readonly name = signal('');
  readonly hint = signal('');
  readonly tags = signal<readonly string[]>([]);
  readonly graph = signal<FlowGraph>({ nodes: [], edges: [] });
  readonly dirty = signal(false);
  readonly saving = signal(false);
  readonly outlineOpen = signal(false);
  readonly selectedIds = signal<readonly string[]>([]);
  readonly selectedEdgeIds = signal<readonly string[]>([]);
  readonly fitToken = signal(0);
  readonly menu = signal<CanvasMenu | null>(null);
  readonly picker = signal<PickerTarget | null>(null);
  readonly exchangeViewer = signal<{ readonly nodeId: string; readonly title: string } | null>(null);
  readonly pickingSelector = signal(false);
  readonly pickingDeviceSelector = signal(false);
  readonly devicePickError = signal<string | null>(null);
  private hydrateKey = '';
  private readonly graphHistory = new FlowGraphHistory();

  readonly source = computed(() => this.templates.findTemplate(this.tab().nodeId));

  readonly selectedNode = computed(() => {
    const ids = this.selectedIds();
    if (ids.length !== 1)
      return null;
    return findFlowGraphNode(this.graph(), ids[0]!) ?? null;
  });

  readonly selectedEdge = computed(() => {
    const ids = this.selectedEdgeIds();
    if (ids.length !== 1)
      return null;
    return this.graph().edges.find((edge) => edge.id === ids[0]!) ?? null;
  });

  readonly canvasInsetLeft = computed(() => (this.outlineOpen() ? 230 : 0));
  readonly canvasInsetRight = computed(() =>
    this.selectedNode() || this.selectedEdge() ? 300 : 0,
  );

  readonly runOrder = computed(() => flowRunOrderIndex(this.graph()));
  readonly nodeCount = computed(() => countFlowScenarioNodes(this.graph()));

  readonly canRun = computed(() => flowHasStartToEndPath(this.graph()));

  readonly statuses = computed(() => {
    const graphIds = new Set(this.graph().nodes.map((node) => node.id));
    const rawAll = this.store.flowStepStatuses() as Readonly<Record<string, FlowNodeStatus>>;
    const next: Record<string, FlowNodeStatus> = {};
    for (const [id, status] of Object.entries(rawAll)) {
      if (graphIds.has(id))
        next[id] = status;
    }
    if (this.store.flowRunning()) {
      for (const node of this.graph().nodes) {
        if (node.kind === 'note' || node.enabled === false)
          continue;
        if (!next[node.id])
          next[node.id] = 'waiting';
      }
    }
    return next;
  });

  readonly errorMessages = computed(() => {
    const graphIds = new Set(this.graph().nodes.map((node) => node.id));
    const next: Record<string, string> = {};
    for (const [id, message] of Object.entries(this.store.flowStepMessages())) {
      if (graphIds.has(id) && message.trim())
        next[id] = message;
    }
    return next;
  });

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
      label: this.store.flowRunning() ? 'Running' : failed > 0 ? 'Failed' : 'Passed',
    };
  });

  readonly placeholderVariables = computed(() => {
    const env = this.environments.items().find((item) => item.id === this.environments.activeId());
    const envNames = env ? Object.keys(environmentVariableMap(env.variables)) : [];
    return [...new Set([...envNames, ...flowPlaceholderNames(this.graph().nodes)])];
  });

  readonly connectionOptions = computed(() =>
    flattenDatabaseConnections(this.desktop.databases().nodes).map((node) => ({
      value: node.id,
      label: `${node.name} · ${DATABASE_TYPE_LABELS[node.type]}`,
    })),
  );

  readonly flowOptions = computed(() =>
    collectServiceArtifactIds(this.desktop.flows().items).map((id) => ({ value: id, label: id })),
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.closeMenu());
    effect(() => {
      const tab = this.tab();
      const source = this.source();
      const key = `${tab.id}:${tab.nodeId}:${source?.id ?? ''}:${source?.steps.length ?? -1}`;
      if (key === this.hydrateKey)
        return;
      this.hydrateKey = key;
      untracked(() => this.hydrate(source));
    });
  }

  private hydrate(source: ReturnType<FlowTemplatesStore['findTemplate']>): void {
    this.graphHistory.clear();
    if (!source) {
      this.name.set('Missing template');
      this.hint.set('');
      this.tags.set([]);
      this.graph.set({ nodes: [], edges: [] });
      this.dirty.set(false);
      return;
    }
    this.name.set(source.name);
    this.hint.set(source.hint);
    this.tags.set([...source.tags]);
    this.graph.set(graphFromFlowTemplate(source));
    this.selectedIds.set([]);
    this.selectedEdgeIds.set([]);
    this.dirty.set(false);
    this.fitToken.update((value) => value + 1);
  }

  private commit(next: FlowGraph): void {
    this.graphHistory.beforeCommit(this.graph());
    this.graph.set(next);
    this.dirty.set(true);
  }

  undoGraph(): void {
    const prev = this.graphHistory.undo(this.graph());
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
    const next = this.graphHistory.redo(this.graph());
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
    this.selectedIds.set(this.selectedIds().filter((id) => nodeIds.has(id)));
    this.selectedEdgeIds.set(this.selectedEdgeIds().filter((id) => edgeIds.has(id)));
  }

  setName(value: string): void {
    this.name.set(value);
    this.dirty.set(true);
  }

  setHint(value: string): void {
    this.hint.set(value);
    this.dirty.set(true);
  }

  setTags(tags: readonly string[]): void {
    this.tags.set([...tags]);
    this.dirty.set(true);
  }

  toggleOutline(): void {
    this.outlineOpen.update((value) => !value);
  }

  async save(): Promise<void> {
    const source = this.source();
    if (!source || this.saving())
      return;
    const graph = this.graph();
    const ids = graph.nodes.map((node) => node.id);
    const captured =
      ids.some((id) => {
        const node = graph.nodes.find((item) => item.id === id);
        return node && !isFlowTerminalKind(node.kind);
      })
        ? captureFlowTemplate(graph, ids, {
            name: this.name(),
            hint: this.hint(),
            tags: [...this.tags()],
          })
        : {
            id: source.id,
            name: this.name().trim() || 'Untitled',
            hint: this.hint().trim(),
            tags: [...this.tags()],
            steps: [],
            links: [],
          };
    if (!captured)
      return;
    this.saving.set(true);
    try {
      await this.templates.save({ ...captured, id: source.id });
      this.dirty.set(false);
      // Keep the live canvas — rehydrating via graphFromFlowTemplate would
      // re-place steps at a fixed origin and jump node positions.
      this.hydrateKey = `${this.tab().id}:${this.tab().nodeId}:${source.id}:${captured.steps.length}`;
    } finally {
      this.saving.set(false);
    }
  }

  private draftScenario(): FlowScenario {
    const graph = this.graph();
    const source = this.source();
    return {
      id: source?.id ? `tpl_${source.id}` : newFlowScenarioId(),
      name: this.name().trim() || 'Template',
      enabled: true,
      folderId: null,
      nodes: graph.nodes,
      edges: graph.edges,
      data: { enabled: false, columns: [], rows: [] },
    };
  }

  runTemplate(): void {
    if (this.store.flowRunning() || !this.canRun())
      return;
    void this.store.runFlowDraft(this.draftScenario(), { e2eShowWindow: true });
  }

  cancelRun(): void {
    if (!this.store.flowRunning())
      return;
    void this.store.cancelFlow();
  }

  handleSelection(ids: readonly string[]): void {
    this.selectedIds.set(ids);
  }

  handleEdgeSelection(ids: readonly string[]): void {
    this.selectedEdgeIds.set(ids);
  }

  focusNode(id: string): void {
    this.selectedIds.set([id]);
    this.selectedEdgeIds.set([]);
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

  closeExchangeViewer(): void {
    this.exchangeViewer.set(null);
  }

  exchangeDetail() {
    const viewer = this.exchangeViewer();
    if (!viewer)
      return null;
    return this.store.flowStepExchanges()[viewer.nodeId] ?? null;
  }

  handleMove(payload: { readonly nodes: FlowGraph['nodes']; readonly edges: FlowGraph['edges'] }): void {
    this.commit({ nodes: payload.nodes, edges: payload.edges });
  }

  handleFrameResized(payload: { readonly id: string; readonly width: number; readonly height: number }): void {
    this.commit(patchNodeConfig(this.graph(), payload.id, { width: payload.width, height: payload.height }));
  }

  handleConnect(payload: { readonly from: string; readonly fromPort: FlowPort; readonly to: string }): void {
    this.commit(connectNodes(this.graph(), payload.from, payload.fromPort, payload.to));
  }

  handleConnectDropped(payload: {
    readonly from: string;
    readonly fromPort: FlowPort;
    readonly x: number;
    readonly y: number;
  }): void {
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

  closeMenu(): void {
    this.menuOverlayRef?.dispose();
    this.menuOverlayRef = null;
    this.menu.set(null);
  }

  closePicker(): void {
    this.picker.set(null);
  }

  openPicker(target: PickerTarget): void {
    this.closeMenu();
    this.picker.set(target);
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
    const height = menu instanceof HTMLElement && menu.offsetHeight ? menu.offsetHeight : 120;
    const margin = 8;
    const left = x + width > window.innerWidth - margin ? Math.max(margin, x - width) : x;
    const top = y + height > window.innerHeight - margin ? Math.max(margin, y - height) : y;
    position.left(`${left}px`).top(`${top}px`);
    overlayRef.updatePosition();
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
      if (result.id)
        this.selectedIds.set([result.id]);
      return;
    }
    if (target.split) {
      const result = splitFromNode(graph, target.split.id, kind, target.split.port);
      this.commit(result.graph);
      if (result.id)
        this.selectedIds.set([result.id]);
      return;
    }
    const result = addNode(graph, kind, {
      at: target.at,
      after: target.after ?? null,
    });
    this.commit(result.graph);
    this.selectedIds.set([result.id]);
  }

  deleteSelection(): void {
    const edgeIds = this.selectedEdgeIds();
    if (edgeIds.length > 0) {
      let next = this.graph();
      for (const id of edgeIds)
        next = disconnectEdge(next, id);
      this.commit(next);
      this.selectedEdgeIds.set([]);
      return;
    }
    const ids = this.selectedIds().filter((id) => {
      const node = this.graph().nodes.find((item) => item.id === id);
      return node ? !isFlowTerminalKind(node.kind) : false;
    });
    if (ids.length === 0)
      return;
    this.commit(removeNodes(this.graph(), ids));
    this.selectedIds.set([]);
  }

  deleteEdge(): void {
    const edge = this.selectedEdge();
    if (!edge)
      return;
    this.commit(disconnectEdge(this.graph(), edge.id));
    this.selectedEdgeIds.set([]);
  }

  duplicateSelection(): void {
    const ids = this.selectedIds();
    if (ids.length === 0)
      return;
    const result = duplicateNodes(this.graph(), ids);
    this.commit(result.graph);
    this.selectedIds.set(result.id ? [result.id] : []);
  }

  copySelection(): void {
    const slice = copyFlowSelection(this.graph(), this.selectedIds());
    if (!slice)
      return;
    this.flowClipboard.set(slice);
  }

  cutSelection(): void {
    this.copySelection();
    this.deleteSelection();
  }

  async pasteClipboard(): Promise<void> {
    const slice = await this.flowClipboard.get();
    if (!slice)
      return;
    const result = pasteFlowSelection(this.graph(), slice);
    this.commit(result.graph);
    this.selectedIds.set(result.selectedIds);
    this.selectedEdgeIds.set([]);
  }

  autoLayout(): void {
    this.closeMenu();
    this.commit(autoLayoutScenario(this.graph()));
    this.fitToken.update((value) => value + 1);
  }

  patchSelected(patch: Partial<FlowGraphNode>): void {
    const id = this.selectedNode()?.id;
    if (!id)
      return;
    this.commit(patchNode(this.graph(), id, patch));
  }

  patchSelectedConfig(patch: Readonly<Record<string, FlowNodeConfigValue>>): void {
    const id = this.selectedNode()?.id;
    if (!id)
      return;
    this.commit(patchNodeConfig(this.graph(), id, patch));
  }

  async pickSelectorOnPage(): Promise<void> {
    if (this.pickingSelector() || this.pickingDeviceSelector() || this.store.flowRunning())
      return;
    const node = this.selectedNode();
    if (!node)
      return;
    this.pickingSelector.set(true);
    try {
      const url = this.pickPageUrl();
      const graph = this.graph();
      const scenario = {
        id: this.tab().nodeId || 'template-pick',
        name: this.name() || 'Template',
        enabled: true,
        folderId: null,
        nodes: graph.nodes,
        edges: graph.edges,
        data: { enabled: false, columns: [], rows: [] },
      };
      const result = await this.desktop.api.services.flows.pickSelector({
        url,
        kind: node.kind,
        stopBeforeNodeId: node.id,
        scenario,
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
    this.devicePickError.set(null);
    this.pickingDeviceSelector.set(true);
    try {
      const graph = this.graph();
      const scenario = {
        id: this.tab().nodeId || 'template-pick',
        name: this.name() || 'Template',
        enabled: true,
        folderId: null,
        nodes: graph.nodes,
        edges: graph.edges,
        data: { enabled: false, columns: [], rows: [] },
      };
      const result = await this.desktop.api.services.flows.pickDeviceSelector({
        stopBeforeNodeId: node.id,
        scenario,
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
    const env = this.environments.items().find((item) => item.id === this.environments.activeId());
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

  patchSelectedEdgeName(name: string): void {
    const edge = this.selectedEdge();
    if (!edge)
      return;
    this.commit(renameEdge(this.graph(), edge.id, name));
  }

  @HostListener('document:keydown', ['$event'])
  handleDocumentKeydown(event: KeyboardEvent): void {
    if (isEditableKeyboardTarget(event.target))
      return;
    if (this.tab().kind !== 'flow-template')
      return;

    if (isModKey(event, 'z') && !event.shiftKey) {
      event.preventDefault();
      this.undoGraph();
      return;
    }
    if ((isModKey(event, 'z') && event.shiftKey) || isModKey(event, 'y')) {
      event.preventDefault();
      this.redoGraph();
      return;
    }

    if (!isModKey(event, 's'))
      return;
    event.preventDefault();
    void this.save();
  }

  menuDuplicate(): void {
    this.closeMenu();
    this.duplicateSelection();
  }

  menuDelete(): void {
    const menu = this.menu();
    this.closeMenu();
    if (menu?.kind === 'edge') {
      this.selectedEdgeIds.set([menu.id]);
      this.deleteEdge();
      return;
    }
    if (menu?.kind === 'node')
      this.selectedIds.set([menu.id]);
    this.deleteSelection();
  }
}
