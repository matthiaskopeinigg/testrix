import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  FLOW_FRAME_MIN_HEIGHT,
  FLOW_FRAME_MIN_WIDTH,
  isFlowFrameKind,
  isFlowTerminalKind,
  type FlowPort,
  type FlowRunEventDetail,
  flowNodeLabel,
  type FlowScenario,
} from '@testrix/contracts';

import {
  FLOW_MAX_SCALE,
  FLOW_MIN_SCALE,
  fitFlowLayout,
  flowEdgePath,
  layoutFlowGraph,
  pinTerminalsToViewport,
  snapToGrid,
  type FlowLayoutNode,
} from './flow-graph-layout';
import { moveNodes, nodesInRect, edgesInRect } from './flow-graph-model';
import { FlowNodeCardComponent, type FlowFrameResizeStart, type FlowNodeStatus } from './flow-node-card.component';
import { FLOW_EMPTY_CANVAS_HINT, hitTestFlowCanvasTarget } from './flow-canvas-actions';

export interface FlowCanvasPoint {
  readonly x: number;
  readonly y: number;
}

export interface FlowCanvasMenuEvent extends FlowCanvasPoint {
  readonly worldX: number;
  readonly worldY: number;
}

interface DragState {
  readonly mode: 'pan' | 'node' | 'port' | 'marquee' | 'frame-resize';
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly panX: number;
  readonly panY: number;
  readonly nodeId: string;
  readonly port: FlowPort;
  readonly ids: readonly string[];
  readonly moved: boolean;
  /** When true, select only on click (no drag) — empty-selection drag moves without selecting. */
  readonly deferSelect: boolean;
  readonly startWidth?: number;
  readonly startHeight?: number;
}

const MINIMAP_W = 168;
const MINIMAP_H = 108;

/** Keep CSS scale off soft near-100% fractions that still label as 100%. */
function crispFlowScale(scale: number): number {
  if (Math.abs(scale - 1) < 0.01)
    return 1;
  return Math.round(scale * 100) / 100;
}

@Component({
  selector: 'tx-flow-canvas',
  standalone: true,
  imports: [FlowNodeCardComponent],
  templateUrl: './flow-canvas.component.html',
  styleUrl: './flow-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlowCanvasComponent {
  readonly scenario = input.required<Pick<FlowScenario, 'nodes' | 'edges'>>();
  readonly selectedIds = input<readonly string[]>([]);
  readonly keyboardFocusId = signal<string | null>(null);
  readonly selectionLive = signal('');
  readonly selectedEdgeIds = input<readonly string[]>([]);
  readonly statuses = input<Readonly<Record<string, FlowNodeStatus>>>({});
  readonly errorMessages = input<Readonly<Record<string, string>>>({});
  readonly exchanges = input<Readonly<Record<string, FlowRunEventDetail>>>({});
  readonly pulses = input<Readonly<Record<string, number>>>({});
  readonly runOrder = input<Readonly<Record<string, number>>>({});
  /** When true, nodes without a status yet show as waiting. */
  readonly flowRunning = input(false);
  /** Bumping this value refits the view, e.g. after a scenario switch. */
  readonly fitToken = input(0);
  /**
   * When true, Start/End stick to the visible left/right borders (Resolve-style).
   */
  readonly pinTerminals = input(true);
  /** Screen-space insets from floating outline / inspector — Start/End re-pin into the clear. */
  readonly viewportInsetLeft = input(0);
  readonly viewportInsetRight = input(0);

  readonly selectionChange = output<readonly string[]>();
  readonly edgeSelectionChange = output<readonly string[]>();
  readonly nodesMoved = output<{
    readonly ids: readonly string[];
    readonly dx: number;
    readonly dy: number;
    readonly nodes: FlowScenario['nodes'];
    readonly edges: FlowScenario['edges'];
  }>();
  readonly connected = output<{ readonly from: string; readonly fromPort: FlowPort; readonly to: string }>();
  readonly connectDropped = output<{ readonly from: string; readonly fromPort: FlowPort; readonly x: number; readonly y: number } & FlowCanvasPoint>();
  readonly nodeMenu = output<{ readonly id: string } & FlowCanvasPoint>();
  readonly edgeMenu = output<{ readonly id: string } & FlowCanvasPoint>();
  readonly edgeRenameRequested = output<string>();
  readonly canvasMenu = output<FlowCanvasMenuEvent>();
  readonly nodeOpened = output<string>();
  readonly viewExchange = output<string>();
  readonly deleteRequested = output<void>();
  readonly duplicateRequested = output<void>();
  readonly copyRequested = output<void>();
  readonly cutRequested = output<void>();
  readonly pasteRequested = output<void>();
  readonly autoLayoutRequested = output<void>();
  readonly frameResized = output<{ readonly id: string; readonly width: number; readonly height: number }>();

  readonly emptyCanvasHint = FLOW_EMPTY_CANVAS_HINT;

  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly destroyRef = inject(DestroyRef);
  private resizeObserver: ResizeObserver | null = null;
  private lastFitSize = { width: 0, height: 0 };
  /** Last measured viewport size; used to keep pan/zoom when the canvas resizes (e.g. inspector). */
  private lastViewportSize = { width: 0, height: 0 };
  /**
   * Dropped node positions held until the async store save lands — avoids snap-back on pointer up.
   */
  private readonly holdScenario = signal<Pick<FlowScenario, 'nodes' | 'edges'> | null>(null);

  readonly panX = signal(0);
  readonly panY = signal(0);
  readonly scale = signal(1);
  readonly viewportSize = signal({ width: 0, height: 0 });
  readonly drag = signal<DragState | null>(null);
  readonly dragDelta = signal<FlowCanvasPoint | null>(null);
  readonly ghostPath = signal<string | null>(null);
  readonly marquee = signal<{ x: number; y: number; width: number; height: number } | null>(null);

  /** Scenario with in-flight drag or a pending drop applied. */
  private readonly previewScenario = computed(() => {
    const base = this.holdScenario() ?? this.scenario();
    const delta = this.dragDelta();
    const drag = this.drag();
    if (!delta || drag?.mode !== 'node')
      return base;
    // Follow the pointer while dragging; collision resolve only runs on drop.
    return moveNodes(base, drag.ids, delta, {
      resolveCollisions: false,
      allowTerminals: !this.pinTerminals(),
    });
  });

  /** Content layout; optionally pin Start/End to the visible left/right borders. */
  readonly layout = computed(() => {
    const scenario = this.previewScenario();
    const base = layoutFlowGraph(scenario);
    if (!this.pinTerminals())
      return base;
    const size = this.viewportSize();
    if (size.width <= 0 || size.height <= 0)
      return base;
    return pinTerminalsToViewport(base, scenario, {
      panX: this.panX(),
      panY: this.panY(),
      scale: this.scale(),
      width: size.width,
      height: size.height,
      insetLeft: this.viewportInsetLeft(),
      insetRight: this.viewportInsetRight(),
    });
  });
  readonly transform = computed(() => {
    const scale = crispFlowScale(this.scale());
    return `translate(${Math.round(this.panX())}px, ${Math.round(this.panY())}px) scale(${scale})`;
  });
  readonly zoomLabel = computed(() => `${Math.round(crispFlowScale(this.scale()) * 100)}%`);
  /** Blank canvas (or Start/End only). Strings count as content. */
  readonly isEmpty = computed(() => {
    const nodes = this.scenario().nodes;
    if (nodes.length === 0)
      return true;
    return nodes.every((node) => isFlowTerminalKind(node.kind));
  });

  readonly nodeViews = computed(() => {
    const placements = this.layout().byId;
    return this.previewScenario()
      .nodes.map((node) => ({ node, placement: placements.get(node.id) }))
      .filter((item): item is { node: (typeof item)['node']; placement: FlowLayoutNode } => item.placement !== undefined)
      .sort((a, b) => {
        // Docs frames paint first so step nodes stay readable on top.
        const aFrame = isFlowFrameKind(a.node.kind) ? 0 : 1;
        const bFrame = isFlowFrameKind(b.node.kind) ? 0 : 1;
        if (aFrame !== bFrame)
          return aFrame - bFrame;
        return a.placement.depth - b.placement.depth;
      });
  });

  /**
   * Overview map in content space (not viewport-pinned terminals).
   * Viewport pinning would stretch Start/End to the screen edges and squash
   * sparse graphs (templates) into a misleading left-cluster + far-right dot.
   */
  readonly minimap = computed(() => {
    const layout = layoutFlowGraph(this.previewScenario());
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const node of layout.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      return {
        scale: 1,
        originX: 0,
        originY: 0,
        nodes: [] as readonly {
          readonly id: string;
          readonly x: number;
          readonly y: number;
          readonly width: number;
          readonly height: number;
        }[],
      };
    }
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const scale = Math.min(MINIMAP_W / width, MINIMAP_H / height);
    return {
      scale,
      originX: minX,
      originY: minY,
      nodes: layout.nodes.map((node) => ({
        id: node.id,
        x: (node.x - minX) * scale,
        y: (node.y - minY) * scale,
        width: Math.max(3, node.width * scale),
        height: Math.max(2, node.height * scale),
      })),
    };
  });

  constructor() {
    effect(() => {
      this.fitToken();
      queueMicrotask(() => this.fit(true));
    });

    effect(() => {
      const hold = this.holdScenario();
      if (!hold)
        return;
      const live = this.scenario();
      const matches = hold.nodes.every((node) => {
        const next = live.nodes.find((item) => item.id === node.id);
        if (!next || next.x !== node.x || next.y !== node.y)
          return false;
        if (!isFlowFrameKind(node.kind))
          return true;
        return next.config['width'] === node.config['width'] && next.config['height'] === node.config['height'];
      });
      if (matches)
        this.holdScenario.set(null);
    });

    effect(() => {
      const host = this.viewport()?.nativeElement;
      if (!host || typeof ResizeObserver === 'undefined')
        return;
      this.resizeObserver?.disconnect();
      this.resizeObserver = new ResizeObserver(() => {
        this.handleViewportResize(host.clientWidth, host.clientHeight);
      });
      this.resizeObserver.observe(host);
      this.handleViewportResize(host.clientWidth, host.clientHeight);
    });

    this.destroyRef.onDestroy(() => this.resizeObserver?.disconnect());
  }

  /**
   * Keep pan/zoom when the canvas size changes (inspector open/close, outline, etc.).
   * Only fit-to-content on the first real size measurement.
   */
  private handleViewportResize(width: number, height: number): void {
    if (width <= 0 || height <= 0)
      return;
    const prev = this.lastViewportSize;
    this.viewportSize.set({ width, height });
    this.lastViewportSize = { width, height };

    if (prev.width <= 0 || prev.height <= 0) {
      this.fit(true);
      return;
    }
    if (prev.width === width && prev.height === height)
      return;

    const scale = this.scale();
    const worldCx = (prev.width / 2 - this.panX()) / scale;
    const worldCy = (prev.height / 2 - this.panY()) / scale;
    this.panX.set(width / 2 - worldCx * scale);
    this.panY.set(height / 2 - worldCy * scale);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  isEdgeSelected(id: string): boolean {
    return this.selectedEdgeIds().includes(id);
  }

  status(id: string): FlowNodeStatus | null {
    return this.statuses()[id] ?? null;
  }

  /** Nodes at or downstream of a failed step — edges leaving these stay red. */
  readonly afterFailureIds = computed(() => {
    const statuses = this.statuses();
    const failed = this.scenario().nodes
      .filter((node) => statuses[node.id] === 'error')
      .map((node) => node.id);
    if (failed.length === 0)
      return new Set<string>();
    const outgoing = new Map<string, string[]>();
    for (const edge of this.scenario().edges) {
      const list = outgoing.get(edge.from) ?? [];
      list.push(edge.to);
      outgoing.set(edge.from, list);
    }
    const reach = new Set<string>();
    const stack = [...failed];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (reach.has(id))
        continue;
      reach.add(id);
      for (const next of outgoing.get(id) ?? [])
        stack.push(next);
    }
    return reach;
  });

  /** Edge run visualization derived from endpoint node statuses. */
  edgeStatus(fromId: string, toId: string): FlowNodeStatus | 'active' | null {
    const hasRun = this.flowRunning() || Object.keys(this.statuses()).length > 0;
    if (!hasRun)
      return null;
    const from = this.status(fromId);
    const to = this.status(toId);
    // Keep the edge into the failed node, and paint every edge after it red.
    if (to === 'error' || this.afterFailureIds().has(fromId))
      return 'error';
    if (to === 'running' || (from === 'ok' && to === 'waiting'))
      return 'active';
    if (to === 'ok' && (from === 'ok' || from === 'running' || from === null))
      return 'ok';
    if (to === 'skipped' || from === 'skipped')
      return 'skipped';
    if (to === 'cancelled' || from === 'cancelled')
      return 'cancelled';
    if (from === 'waiting' || to === 'waiting')
      return 'waiting';
    if (from === 'ok')
      return 'ok';
    return null;
  }

  stepError(id: string): string {
    return this.errorMessages()[id] ?? '';
  }

  stepMessage(id: string): string {
    return this.errorMessages()[id] ?? '';
  }

  stepPulse(id: string): number {
    return this.pulses()[id] ?? 0;
  }

  stepExchange(id: string): FlowRunEventDetail | null {
    return this.exchanges()[id] ?? null;
  }

  order(id: string): number {
    return this.runOrder()[id] ?? 0;
  }

  /** Focus the canvas so Delete / Ctrl+D / arrows work after outline picks. */
  focusViewport(): void {
    const host = this.viewport()?.nativeElement;
    if (host && document.activeElement !== host)
      host.focus({ preventScroll: true });
  }

  // -- viewport -------------------------------------------------------------

  handleWheel(event: WheelEvent): void {
    event.preventDefault();
    const host = this.viewport()?.nativeElement;
    if (!host)
      return;
    const rect = host.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const scale = this.scale();
    const next = Math.min(FLOW_MAX_SCALE, Math.max(FLOW_MIN_SCALE, scale * (event.deltaY > 0 ? 0.9 : 1.1)));
    const wx = (cx - this.panX()) / scale;
    const wy = (cy - this.panY()) / scale;
    this.scale.set(next);
    this.panX.set(cx - wx * next);
    this.panY.set(cy - wy * next);
  }

  zoomBy(factor: number): void {
    const host = this.viewport()?.nativeElement;
    if (!host)
      return;
    const cx = host.clientWidth / 2;
    const cy = host.clientHeight / 2;
    const scale = this.scale();
    const next = Math.min(FLOW_MAX_SCALE, Math.max(FLOW_MIN_SCALE, scale * factor));
    const wx = (cx - this.panX()) / scale;
    const wy = (cy - this.panY()) / scale;
    this.scale.set(next);
    this.panX.set(cx - wx * next);
    this.panY.set(cy - wy * next);
  }

  fit(force = false): void {
    const host = this.viewport()?.nativeElement;
    if (!host)
      return;
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width <= 0 || height <= 0)
      return;
    this.viewportSize.set({ width, height });
    if (
      !force &&
      this.lastFitSize.width > 0 &&
      Math.abs(width - this.lastFitSize.width) < 8 &&
      Math.abs(height - this.lastFitSize.height) < 8
    )
      return;
    // Fit content; when terminals are free-placed, include them in the frame.
    const contentLayout = layoutFlowGraph(this.previewScenario());
    const terminalIds = this.pinTerminals()
      ? new Set(
          this.previewScenario()
            .nodes.filter((node) => isFlowTerminalKind(node.kind))
            .map((node) => node.id),
        )
      : new Set<string>();
    const result = fitFlowLayout(contentLayout, { width, height }, { excludeTerminalIds: terminalIds });
    this.scale.set(result.scale);
    this.panX.set(result.panX);
    this.panY.set(result.panY);
    this.lastFitSize = { width, height };
    this.lastViewportSize = { width, height };
  }

  private toWorld(event: { clientX: number; clientY: number }): FlowCanvasPoint {
    const host = this.viewport()?.nativeElement;
    if (!host)
      return { x: 0, y: 0 };
    const rect = host.getBoundingClientRect();
    const scale = this.scale();
    return {
      x: (event.clientX - rect.left - this.panX()) / scale,
      y: (event.clientY - rect.top - this.panY()) / scale,
    };
  }

  handleFrameResizeStart(payload: FlowFrameResizeStart): void {
    const host = this.viewport()?.nativeElement;
    if (!host)
      return;
    host.setPointerCapture(payload.pointerId);
    this.selectionChange.emit([payload.id]);
    this.edgeSelectionChange.emit([]);
    this.drag.set({
      mode: 'frame-resize',
      pointerId: payload.pointerId,
      startX: payload.clientX,
      startY: payload.clientY,
      panX: this.panX(),
      panY: this.panY(),
      nodeId: payload.id,
      port: 'next',
      ids: [payload.id],
      moved: false,
      deferSelect: false,
      startWidth: payload.width,
      startHeight: payload.height,
    });
  }

  // -- pointer --------------------------------------------------------------

  handlePointerDown(event: PointerEvent): void {
    if (event.button === 2)
      return;
    const host = this.viewport()?.nativeElement;
    if (!host)
      return;
    // Keep keyboard shortcuts (Delete, Ctrl+D, arrows) available after node clicks.
    if (document.activeElement !== host)
      host.focus({ preventScroll: true });
    host.setPointerCapture(event.pointerId);

    // Middle mouse always pans — never moves nodes or starts connections.
    if (event.button === 1) {
      event.preventDefault();
      this.drag.set({
        mode: 'pan',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panX: this.panX(),
        panY: this.panY(),
        nodeId: '',
        port: 'next',
        ids: [],
        moved: false,
        deferSelect: false,
      });
      return;
    }

    const target = event.target as Element | null;
    const portEl = target?.closest<HTMLElement>('[data-port]');
    const nodeEl = target?.closest<HTMLElement>('[data-node-id]');
    const edgeEl = target?.closest<HTMLElement>('[data-edge-id]');

    if (portEl && nodeEl) {
      event.preventDefault();
      this.drag.set({
        mode: 'port',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panX: this.panX(),
        panY: this.panY(),
        nodeId: nodeEl.dataset['nodeId'] ?? '',
        port: (portEl.dataset['port'] as FlowPort) ?? 'next',
        ids: [],
        moved: false,
        deferSelect: false,
      });
      return;
    }

    if (nodeEl) {
      const id = nodeEl.dataset['nodeId'] ?? '';
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      const current = this.selectedIds();
      let ids: readonly string[];
      let deferSelect = false;

      if (additive) {
        ids = current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id];
        this.selectionChange.emit(ids);
      } else if (current.includes(id)) {
        // Already in the selection (e.g. after Ctrl+A) — drag moves the whole set.
        // Do not clear co-selected edges on pointer down; a plain click-without-drag
        // also keeps the multi-set (Figma-style) so select-all then drag works.
        ids = current;
      } else if (current.length === 0 && this.selectedEdgeIds().length === 0) {
        // Empty selection: click selects; drag moves without selecting.
        ids = [id];
        deferSelect = true;
      } else {
        ids = [id];
        this.selectionChange.emit(ids);
        this.edgeSelectionChange.emit([]);
      }

      const kind = nodeEl.getAttribute('data-kind') ?? '';
      if ((kind === 'start' || kind === 'end') && this.pinTerminals()) {
        if (deferSelect) {
          this.selectionChange.emit(ids);
          this.edgeSelectionChange.emit([]);
        }
        return;
      }

      this.drag.set({
        mode: 'node',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panX: this.panX(),
        panY: this.panY(),
        nodeId: id,
        port: 'next',
        ids,
        moved: false,
        deferSelect,
      });
      return;
    }

    if (edgeEl?.dataset['edgeId']) {
      const id = edgeEl.dataset['edgeId'];
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      const current = this.selectedEdgeIds();
      if (additive) {
        const ids = current.includes(id)
          ? current.filter((item) => item !== id)
          : [...current, id];
        this.edgeSelectionChange.emit(ids);
      } else if (current.includes(id)) {
        // Already selected (e.g. Ctrl+A) — leave the full node+edge set alone.
      } else {
        this.selectionChange.emit([]);
        this.edgeSelectionChange.emit([id]);
      }
      return;
    }

    // Empty canvas: left-drag marquees; middle-mouse pans (handled above).
    const world = this.toWorld(event);
    this.marquee.set({ x: world.x, y: world.y, width: 0, height: 0 });
    this.drag.set({
      mode: 'marquee',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: world.x,
      panY: world.y,
      nodeId: '',
      port: 'next',
      ids: [],
      moved: false,
      deferSelect: false,
    });
  }

  handlePointerMove(event: PointerEvent): void {
    const drag = this.drag();
    if (!drag || drag.pointerId !== event.pointerId)
      return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 3;
    if (moved && !drag.moved)
      this.drag.set({ ...drag, moved: true });

    if (drag.mode === 'pan') {
      this.panX.set(drag.panX + dx);
      this.panY.set(drag.panY + dy);
      return;
    }

    if (drag.mode === 'frame-resize') {
      const scale = this.scale();
      const width = Math.max(
        FLOW_FRAME_MIN_WIDTH,
        Math.round((drag.startWidth ?? 0) + dx / scale),
      );
      const height = Math.max(
        FLOW_FRAME_MIN_HEIGHT,
        Math.round((drag.startHeight ?? 0) + dy / scale),
      );
      const base = this.holdScenario() ?? this.scenario();
      this.holdScenario.set({
        ...base,
        nodes: base.nodes.map((node) =>
          node.id === drag.nodeId
            ? { ...node, config: { ...node.config, width, height } }
            : node,
        ),
      });
      return;
    }

    if (drag.mode === 'port') {
      const anchor = this.layout()
        .byId.get(drag.nodeId)
        ?.outPorts.find((port) => port.port === drag.port);
      if (!anchor)
        return;
      const world = this.toWorld(event);
      this.ghostPath.set(flowEdgePath(anchor, world));
      return;
    }

    if (drag.mode === 'marquee') {
      const world = this.toWorld(event);
      this.marquee.set({ x: drag.panX, y: drag.panY, width: world.x - drag.panX, height: world.y - drag.panY });
      return;
    }

    if (drag.mode === 'node' && moved) {
      const scale = this.scale();
      // Snap while dragging so the drop matches the preview (nodes are grid-aligned).
      this.dragDelta.set({
        x: snapToGrid(dx / scale),
        y: snapToGrid(dy / scale),
      });
    }
  }

  handlePointerUp(event: PointerEvent): void {
    const drag = this.drag();
    const host = this.viewport()?.nativeElement;
    if (host?.hasPointerCapture(event.pointerId))
      host.releasePointerCapture(event.pointerId);
    if (!drag || drag.pointerId !== event.pointerId) {
      this.drag.set(null);
      this.dragDelta.set(null);
      this.ghostPath.set(null);
      return;
    }

    if (drag.mode === 'pan') {
      this.drag.set(null);
      return;
    }

    if (drag.mode === 'frame-resize') {
      const held = this.holdScenario();
      const node = held?.nodes.find((item) => item.id === drag.nodeId);
      this.drag.set(null);
      if (node) {
        const width = typeof node.config['width'] === 'number' ? node.config['width'] : FLOW_FRAME_MIN_WIDTH;
        const height = typeof node.config['height'] === 'number' ? node.config['height'] : FLOW_FRAME_MIN_HEIGHT;
        // Keep hold until the async save updates `scenario()` with matching size.
        this.holdScenario.set(held);
        this.frameResized.emit({ id: drag.nodeId, width, height });
      }
      return;
    }

    if (drag.mode === 'marquee') {
      const rect = this.marquee();
      this.marquee.set(null);
      this.drag.set(null);
      if (rect && drag.moved) {
        const layout = this.layout();
        const nodeIds = nodesInRect(layout.nodes, rect);
        const nodeSet = new Set(nodeIds);
        const midIds = edgesInRect(layout.edges, rect);
        const betweenIds = layout.edges
          .filter((edge) => nodeSet.has(edge.from) && nodeSet.has(edge.to))
          .map((edge) => edge.id);
        this.selectionChange.emit(nodeIds);
        this.edgeSelectionChange.emit([...new Set([...midIds, ...betweenIds])]);
      } else if (!drag.moved) {
        this.selectionChange.emit([]);
        this.edgeSelectionChange.emit([]);
      }
      return;
    }

    if (drag.mode === 'port') {
      this.drag.set(null);
      this.ghostPath.set(null);
      const dropped = document.elementFromPoint(event.clientX, event.clientY);
      const targetEl = dropped?.closest<HTMLElement>('[data-node-id]');
      const targetId = targetEl?.dataset['nodeId'] ?? '';
      if (targetId && targetId !== drag.nodeId) {
        this.connected.emit({ from: drag.nodeId, fromPort: drag.port, to: targetId });
        return;
      }
      if (drag.moved) {
        const world = this.toWorld(event);
        this.connectDropped.emit({ from: drag.nodeId, fromPort: drag.port, x: world.x, y: world.y });
      }
      return;
    }

    if (drag.mode === 'node' && drag.moved) {
      const scale = this.scale();
      const dx = snapToGrid((event.clientX - drag.startX) / scale);
      const dy = snapToGrid((event.clientY - drag.startY) / scale);
      const base = this.holdScenario() ?? this.scenario();
      const moved = moveNodes(base, drag.ids, { x: dx, y: dy }, { allowTerminals: !this.pinTerminals() });
      // Hold the dropped graph until the async save updates `scenario()`.
      this.holdScenario.set(moved);
      this.drag.set(null);
      this.dragDelta.set(null);
      this.nodesMoved.emit({ ids: drag.ids, dx, dy, nodes: moved.nodes, edges: moved.edges });
      return;
    }

    if (drag.mode === 'node' && drag.deferSelect && !drag.moved) {
      this.selectionChange.emit(drag.ids);
      this.edgeSelectionChange.emit([]);
    }

    this.drag.set(null);
    this.dragDelta.set(null);
    this.ghostPath.set(null);
  }

  handleDoubleClick(event: MouseEvent): void {
    const labelEl = (event.target as Element | null)?.closest<HTMLElement>('.tx-flow-canvas__edge-label');
    if (labelEl?.dataset['edgeId']) {
      event.preventDefault();
      this.edgeRenameRequested.emit(labelEl.dataset['edgeId']);
      return;
    }
    const nodeEl = (event.target as Element | null)?.closest<HTMLElement>('[data-node-id]');
    if (nodeEl?.dataset['nodeId'])
      this.nodeOpened.emit(nodeEl.dataset['nodeId']);
  }

  /** Keep canvas drag from starting when interacting with an edge label. */
  handleEdgeLabelPointerDown(event: PointerEvent): void {
    event.stopPropagation();
  }

  handleEdgeLabelClick(event: MouseEvent, edgeId: string): void {
    event.stopPropagation();
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const current = this.selectedEdgeIds();
    if (additive) {
      const ids = current.includes(edgeId)
        ? current.filter((item) => item !== edgeId)
        : [...current, edgeId];
      this.edgeSelectionChange.emit(ids);
      return;
    }
    if (current.includes(edgeId))
      return;
    this.selectionChange.emit([]);
    this.edgeSelectionChange.emit([edgeId]);
  }

  handleContextMenu(event: MouseEvent): void {
    event.preventDefault();
    const host = this.viewport()?.nativeElement;
    if (host && document.activeElement !== host)
      host.focus({ preventScroll: true });
    const hit = hitTestFlowCanvasTarget(event.target);
    if (hit.kind === 'node') {
      this.nodeMenu.emit({ id: hit.id, x: event.clientX, y: event.clientY });
      return;
    }
    if (hit.kind === 'edge') {
      this.edgeMenu.emit({ id: hit.id, x: event.clientX, y: event.clientY });
      return;
    }
    const world = this.toWorld(event);
    this.canvasMenu.emit({ x: event.clientX, y: event.clientY, worldX: world.x, worldY: world.y });
  }

  /** Block the browser's middle-click auto-scroll / open-link gestures. */
  handleAuxClick(event: MouseEvent): void {
    if (event.button === 1)
      event.preventDefault();
  }

  handleKeydown(event: KeyboardEvent): void {
    const host = this.viewport()?.nativeElement;
    if (!host || !this.canvasOwnsKeyboard(event.target))
      return;
    const selected = this.selectedIds();
    const selectedEdges = this.selectedEdgeIds();
    // Strings (notes) and steps share the same selection shortcuts.
    const movable = selected.filter((id) => {
      const node = this.scenario().nodes.find((item) => item.id === id);
      if (!node)
        return false;
      if (this.pinTerminals() && isFlowTerminalKind(node.kind))
        return false;
      return true;
    });
    const mod = event.ctrlKey || event.metaKey;

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (selectedEdges.length > 0 || movable.length > 0) {
        event.preventDefault();
        this.deleteRequested.emit();
      }
      return;
    }

    if (mod && event.key.toLowerCase() === 'c') {
      if (movable.length === 0)
        return;
      event.preventDefault();
      this.copyRequested.emit();
      return;
    }

    if (mod && event.key.toLowerCase() === 'x') {
      if (movable.length === 0)
        return;
      event.preventDefault();
      this.cutRequested.emit();
      return;
    }

    if (mod && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      this.pasteRequested.emit();
      return;
    }

    if (mod && event.key.toLowerCase() === 'd') {
      if (movable.length === 0)
        return;
      event.preventDefault();
      this.duplicateRequested.emit();
      return;
    }

    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this.selectionChange.emit(this.scenario().nodes.map((node) => node.id));
      this.edgeSelectionChange.emit(this.scenario().edges.map((edge) => edge.id));
      return;
    }

    if (event.key === 'Escape') {
      this.selectionChange.emit([]);
      this.edgeSelectionChange.emit([]);
      return;
    }

    if (event.key === 'Tab') {
      event.preventDefault();
      this.cycleKeyboardFocus(event.shiftKey);
      return;
    }

    const nudge: Record<string, [number, number]> = {
      ArrowUp: [0, -20],
      ArrowDown: [0, 20],
      ArrowLeft: [-20, 0],
      ArrowRight: [20, 0],
    };
    const delta = nudge[event.key];
    if (!delta)
      return;

    if (event.shiftKey && movable.length > 0) {
      event.preventDefault();
      const base = this.holdScenario() ?? this.scenario();
      const moved = moveNodes(base, movable, {
        x: delta[0],
        y: delta[1],
      }, { allowTerminals: !this.pinTerminals() });
      this.holdScenario.set(moved);
      this.nodesMoved.emit({
        ids: movable,
        dx: delta[0],
        dy: delta[1],
        nodes: moved.nodes,
        edges: moved.edges,
      });
      return;
    }

    event.preventDefault();
    this.moveKeyboardFocus(event.key.replace('Arrow', '').toLowerCase() as 'up' | 'down' | 'left' | 'right');
  }

  private cycleKeyboardFocus(reverse: boolean): void {
    const ids = this.scenario().nodes.map((node) => node.id);
    if (ids.length === 0)
      return;
    const current = this.keyboardFocusId() ?? this.selectedIds()[0] ?? ids[0]!;
    const index = Math.max(0, ids.indexOf(current));
    const nextIndex = reverse
      ? (index - 1 + ids.length) % ids.length
      : (index + 1) % ids.length;
    const nextId = ids[nextIndex]!;
    this.keyboardFocusId.set(nextId);
    this.selectionChange.emit([nextId]);
    this.announceSelection(nextId);
  }

  private moveKeyboardFocus(direction: 'up' | 'down' | 'left' | 'right'): void {
    const nodes = this.nodeViews();
    if (nodes.length === 0)
      return;
    const currentId = this.keyboardFocusId() ?? this.selectedIds()[0] ?? nodes[0]!.node.id;
    const current = nodes.find((item) => item.node.id === currentId) ?? nodes[0]!;
    const cx = current.placement.x + current.placement.width / 2;
    const cy = current.placement.y + current.placement.height / 2;
    let best: { id: string; score: number } | null = null;
    for (const item of nodes) {
      if (item.node.id === currentId)
        continue;
      const ox = item.placement.x + item.placement.width / 2;
      const oy = item.placement.y + item.placement.height / 2;
      const dx = ox - cx;
      const dy = oy - cy;
      const primary =
        direction === 'left' ? -dx :
          direction === 'right' ? dx :
            direction === 'up' ? -dy : dy;
      if (primary <= 8)
        continue;
      const secondary = Math.abs(direction === 'left' || direction === 'right' ? dy : dx);
      const score = primary * 1000 - secondary;
      if (!best || score > best.score)
        best = { id: item.node.id, score };
    }
    const nextId = best?.id ?? currentId;
    this.keyboardFocusId.set(nextId);
    this.selectionChange.emit([nextId]);
    this.announceSelection(nextId);
  }

  private announceSelection(nodeId: string): void {
    const node = this.scenario().nodes.find((item) => item.id === nodeId);
    if (!node)
      return;
    this.selectionLive.set(`Selected ${flowNodeLabel(node)}`);
  }

  /** True when the canvas should handle shortcuts (not while typing in fields). */
  private canvasOwnsKeyboard(target: EventTarget | null): boolean {
    const host = this.viewport()?.nativeElement;
    if (!host || !(target instanceof Node))
      return false;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
        return false;
      if (target.isContentEditable || target.closest('[contenteditable="true"]'))
        return false;
    }
    return target === host || host.contains(target) || document.activeElement === host;
  }

  handleMinimapClick(event: MouseEvent): void {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const map = this.minimap();
    if (map.scale <= 0)
      return;
    const worldX = (event.clientX - rect.left) / map.scale + map.originX;
    const worldY = (event.clientY - rect.top) / map.scale + map.originY;
    const host = this.viewport()?.nativeElement;
    if (!host)
      return;
    this.panX.set(host.clientWidth / 2 - worldX * this.scale());
    this.panY.set(host.clientHeight / 2 - worldY * this.scale());
  }
}
