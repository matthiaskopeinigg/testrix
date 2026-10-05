import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { TxHintComponent } from '@testrix/ui';
import { PromptDialogService } from '../../../core/prompt-dialog.service';
import {
} from './plantuml-generator';
import type { PlantumlGridCamera } from './plantuml-sequence-grid.component';
import {
  arrowStep,
  idsInside,
  isTypingTarget,
  normalizeRect,
  selectionFromClick,
} from './plantuml-selection';
import {
  addEdge,
  addNode,
  borderPoint,
  CLASS_KINDS,
  centerOf,
  edgeOf,
  type GraphModel,
  hitBox,
  layoutBoxes,
  layoutWires,
  membersOf,
  moveNode,
  type NodeNudge,
  patchEdge,
  patchNode,
  removeEdge,
  removeNode,
  renameNode,
} from './plantuml-graph-model';

type GraphMenu =
  | { readonly kind: 'canvas'; readonly x: number; readonly y: number; readonly worldX: number; readonly worldY: number }
  | { readonly kind: 'node'; readonly x: number; readonly y: number; readonly id: string }
  | { readonly kind: 'edge'; readonly x: number; readonly y: number; readonly id: string }
  | { readonly kind: 'title'; readonly x: number; readonly y: number }
  | { readonly kind: 'link-kind'; readonly x: number; readonly y: number; readonly fromId: string; readonly toId: string; readonly label: string };

interface NodeDrag {
  readonly id: string;
  readonly origins: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly moved: boolean;
  readonly before: readonly string[];
  readonly toggle: boolean;
  readonly range: boolean;
}

interface Marquee {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly additive: boolean;
  readonly base: readonly string[];
}

interface LinkDrag {
  readonly fromId: string;
  readonly x: number;
  readonly y: number;
}

interface PanDrag {
  readonly pointerX: number;
  readonly pointerY: number;
  readonly panX: number;
  readonly panY: number;
}

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.4;
const DRAG_THRESHOLD_PX = 4;

const USE_KINDS = ['assoc', 'include', 'extend'] as const;

@Component({
  selector: 'tx-plantuml-graph-grid',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './plantuml-graph-grid.component.html',
  styleUrl: './plantuml-graph-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlantumlGraphGridComponent {
  private readonly prompts = inject(PromptDialogService);
  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');
  private cameraRestored = false;

  readonly classKinds = CLASS_KINDS;
  readonly useKinds = USE_KINDS;
  readonly model = input.required<GraphModel>();
  readonly savedCamera = input<PlantumlGridCamera | null>(null);
  readonly cameraChange = output<PlantumlGridCamera>();
  readonly modelChange = output<GraphModel>();
  readonly titleChange = output<string>();

  readonly zoom = signal(1);
  readonly pan = signal({ x: 32, y: 24 });
  readonly menu = signal<GraphMenu | null>(null);
  readonly live = signal<NodeNudge | null>(null);
  readonly link = signal<LinkDrag | null>(null);
  readonly linkTarget = signal<string | null>(null);
  readonly panning = signal(false);
  readonly selectedIds = signal<readonly string[]>([]);
  readonly marquee = signal<Marquee | null>(null);

  private nodeDrag: NodeDrag | null = null;
  private panDrag: PanDrag | null = null;

  readonly boxes = computed(() => layoutBoxes(this.model(), this.live()));
  readonly marqueeBox = computed(() => {
    const marquee = this.marquee();
    if (!marquee)
      return null;
    return normalizeRect(marquee.x0, marquee.y0, marquee.x1, marquee.y1);
  });
  readonly wires = computed(() => layoutWires(this.model(), this.boxes()));
  readonly transform = computed(() => {
    const pan = this.pan();
    return `translate(${pan.x}px, ${pan.y}px) scale(${this.zoom()})`;
  });
  readonly linkPath = computed(() => {
    const link = this.link();
    if (!link)
      return null;
    const from = this.boxes().find((box) => box.id === link.fromId);
    if (!from)
      return null;
    const start = borderPoint(centerOf(from), { x: link.x, y: link.y }, from);
    return { x1: start.x, y1: start.y, x2: link.x, y2: link.y };
  });

  constructor() {
    effect(() => {
      const saved = this.savedCamera();
      if (!saved || this.cameraRestored)
        return;
      this.cameraRestored = true;
      untracked(() => {
        this.zoom.set(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, saved.zoom)));
        this.pan.set({ x: saved.x, y: saved.y });
      });
    });
  }

  handleWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.viewport().nativeElement.getBoundingClientRect();
    this.zoomAt(event.clientX - rect.left, event.clientY - rect.top, event.deltaY > 0 ? 0.9 : 1.1);
  }

  handlePointerDown(event: PointerEvent): void {
    if (event.button === 1) {
      event.preventDefault();
      this.menu.set(null);
      this.panning.set(true);
      this.panDrag = {
        pointerX: event.clientX,
        pointerY: event.clientY,
        panX: this.pan().x,
        panY: this.pan().y,
      };
      this.capture(event);
      return;
    }
    if (event.button !== 0)
      return;
    const target = event.target;
    if (!(target instanceof Element))
      return;
    if (target.closest('.tx-graph__node, .tx-graph__port, .tx-graph__menu, .tx-graph__title, .tx-graph__backdrop'))
      return;
    event.preventDefault();
    this.menu.set(null);
    this.focusViewport();
    const world = this.worldPoint(event);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    this.marquee.set({
      x0: world.x,
      y0: world.y,
      x1: world.x,
      y1: world.y,
      additive,
      base: additive ? this.selectedIds() : [],
    });
    this.capture(event);
  }

  handlePointerMove(event: PointerEvent): void {
    const panDrag = this.panDrag;
    if (panDrag) {
      this.pan.set({
        x: panDrag.panX + (event.clientX - panDrag.pointerX),
        y: panDrag.panY + (event.clientY - panDrag.pointerY),
      });
      return;
    }
    const marquee = this.marquee();
    if (marquee) {
      const world = this.worldPoint(event);
      const next = { ...marquee, x1: world.x, y1: world.y };
      this.marquee.set(next);
      const rect = normalizeRect(next.x0, next.y0, next.x1, next.y1);
      if (rect.w < DRAG_THRESHOLD_PX && rect.h < DRAG_THRESHOLD_PX)
        return;
      this.selectedIds.set(idsInside(
        this.boxes().map((box) => ({ id: box.id, x: box.x, y: box.y, width: box.width, height: box.height })),
        rect,
        next.base,
      ));
      return;
    }
    const nodeDrag = this.nodeDrag;
    if (nodeDrag) {
      const zoom = this.zoom();
      const dx = event.clientX - nodeDrag.pointerX;
      const dy = event.clientY - nodeDrag.pointerY;
      const moved = nodeDrag.moved || Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;
      this.nodeDrag = { ...nodeDrag, moved };
      if (!moved)
        return;
      this.live.set({
        dx: dx / zoom,
        dy: dy / zoom,
        origins: nodeDrag.origins,
      });
      return;
    }
    const link = this.link();
    if (!link)
      return;
    const world = this.worldPoint(event);
    this.link.set({ ...link, x: world.x, y: world.y });
    const hit = hitBox(this.boxes(), world.x, world.y);
    this.linkTarget.set(hit && hit.id !== link.fromId ? hit.id : null);
  }

  handlePointerUp(event: PointerEvent): void {
    if (this.panDrag) {
      this.panDrag = null;
      this.panning.set(false);
      this.emitCamera();
      return;
    }
    const marquee = this.marquee();
    if (marquee) {
      const rect = normalizeRect(marquee.x0, marquee.y0, marquee.x1, marquee.y1);
      this.marquee.set(null);
      if (rect.w < DRAG_THRESHOLD_PX && rect.h < DRAG_THRESHOLD_PX && !marquee.additive)
        this.selectedIds.set([]);
      return;
    }
    const nodeDrag = this.nodeDrag;
    if (nodeDrag) {
      this.nodeDrag = null;
      const live = this.live();
      this.live.set(null);
      if (nodeDrag.moved && live) {
        let model = this.model();
        for (const [id, origin] of Object.entries(live.origins))
          model = moveNode(model, id, origin.x + live.dx, origin.y + live.dy);
        this.modelChange.emit(model);
        if (!this.selectedIds().includes(nodeDrag.id))
          this.selectedIds.set(Object.keys(live.origins));
        return;
      }
      this.selectedIds.set(selectionFromClick(
        nodeDrag.before,
        nodeDrag.id,
        nodeDrag.toggle,
        nodeDrag.range,
        this.boxes().map((box) => box.id),
      ));
      return;
    }
    const link = this.link();
    if (!link)
      return;
    const target = this.linkTarget();
    this.link.set(null);
    this.linkTarget.set(null);
    if (!target)
      return;
    const point = this.hostPoint(event);
    void this.finishLink(link.fromId, target, point.x, point.y);
  }

  openCanvasMenu(event: MouseEvent): void {
    if (this.nodeDrag || this.link())
      return;
    event.preventDefault();
    const host = this.hostPoint(event);
    const world = this.worldPoint(event);
    this.menu.set({ kind: 'canvas', x: host.x, y: host.y, worldX: world.x, worldY: world.y });
  }

  openNodeMenu(event: MouseEvent, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.selectedIds().includes(id))
      this.selectedIds.set([id]);
    const host = this.hostPoint(event);
    this.menu.set({ kind: 'node', x: host.x, y: host.y, id });
  }

  openEdgeMenu(event: MouseEvent, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    const host = this.hostPoint(event);
    this.menu.set({ kind: 'edge', x: host.x, y: host.y, id });
  }

  openTitleMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const host = this.hostPoint(event);
    this.menu.set({ kind: 'title', x: host.x, y: host.y });
  }

  closeMenu(): void {
    this.menu.set(null);
  }

  startNodeDrag(event: PointerEvent, id: string): void {
    if (event.button !== 0)
      return;
    event.preventDefault();
    event.stopPropagation();
    const box = this.boxes().find((item) => item.id === id);
    if (!box)
      return;
    this.menu.set(null);
    this.focusViewport();
    const before = this.selectedIds();
    const modified = event.shiftKey || event.ctrlKey || event.metaKey;
    const dragIds = before.includes(id) ? before : [id];
    if (!modified && !before.includes(id))
      this.selectedIds.set([id]);
    const origins: Record<string, { x: number; y: number }> = {};
    for (const itemId of dragIds) {
      const found = this.boxes().find((item) => item.id === itemId);
      if (found)
        origins[itemId] = { x: found.x, y: found.y };
    }
    this.nodeDrag = {
      id,
      origins,
      pointerX: event.clientX,
      pointerY: event.clientY,
      moved: false,
      before,
      toggle: event.ctrlKey || event.metaKey,
      range: event.shiftKey,
    };
    this.capture(event);
  }

  startLink(event: PointerEvent, id: string): void {
    if (event.button !== 0)
      return;
    event.stopPropagation();
    event.preventDefault();
    this.menu.set(null);
    const world = this.worldPoint(event);
    this.link.set({ fromId: id, x: world.x, y: world.y });
    this.capture(event);
  }

  isSelected(id: string): boolean {
    return this.selectedIds().includes(id);
  }

  handleKey(event: KeyboardEvent): void {
    if (isTypingTarget(event.target))
      return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.selectedIds.set([]);
      this.menu.set(null);
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      event.stopPropagation();
      this.selectedIds.set(this.boxes().map((box) => box.id));
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const ids = this.selectedIds();
      if (!ids.length)
        return;
      event.preventDefault();
      event.stopPropagation();
      this.deleteIds(ids);
      return;
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      const ids = this.selectedIds();
      if (ids.length !== 1 || !ids[0])
        return;
      event.preventDefault();
      event.stopPropagation();
      void this.renameNode(ids[0]);
      return;
    }
    const nudge = arrowStep(event.key, event.shiftKey);
    const ids = this.selectedIds();
    if (!nudge || !ids.length)
      return;
    event.preventDefault();
    event.stopPropagation();
    const boxes = this.boxes();
    let model = this.model();
    for (const id of ids) {
      const box = boxes.find((item) => item.id === id);
      if (box)
        model = moveNode(model, id, box.x + nudge.dx, box.y + nudge.dy);
    }
    this.modelChange.emit(model);
  }

  async addNode(role: 'node' | 'actor' | 'usecase'): Promise<void> {
    const menu = this.menu();
    if (!menu || menu.kind !== 'canvas')
      return;
    this.menu.set(null);
    const name = await this.prompts.ask({
      title: role === 'actor' ? 'Add actor' : role === 'usecase' ? 'Add use case' : 'Add',
      body: 'Name',
      placeholder: role === 'actor' ? 'User' : 'Name',
      confirmLabel: 'Add',
    });
    if (name === null)
      return;
    this.modelChange.emit(addNode(this.model(), role, name.trim() || 'Name', menu.worldX, menu.worldY));
  }

  async renameNode(id: string): Promise<void> {
    this.menu.set(null);
    const box = this.boxes().find((item) => item.id === id);
    if (!box)
      return;
    const name = await this.prompts.ask({
      title: 'Rename',
      body: 'Name',
      initialValue: box.name,
      placeholder: box.name,
    });
    if (name === null)
      return;
    this.modelChange.emit(renameNode(this.model(), id, name.trim() || box.name));
  }

  async editStereotype(id: string): Promise<void> {
    this.menu.set(null);
    const box = this.boxes().find((item) => item.id === id);
    if (!box)
      return;
    const value = await this.prompts.ask({
      title: 'Stereotype',
      body: 'Stereotype',
      initialValue: box.stereotype,
      placeholder: 'entity',
    });
    if (value === null)
      return;
    this.modelChange.emit(patchNode(this.model(), id, { stereotype: value.trim() }));
  }

  async editMembers(id: string): Promise<void> {
    this.menu.set(null);
    const current = membersOf(this.model(), id);
    const value = await this.prompts.ask({
      title: 'Members',
      body: 'One member on each line. Enter starts a new line. Ctrl+Enter saves.',
      initialValue: current,
      multiline: true,
      rows: 6,
    });
    if (value === null)
      return;
    this.modelChange.emit(patchNode(this.model(), id, { members: value.replace(/\\n/g, '\n').trim() }));
  }

  deleteNode(id: string): void {
    this.menu.set(null);
    const ids = this.selectedIds().includes(id) ? this.selectedIds() : [id];
    this.deleteIds(ids);
  }

  async renameEdge(id: string): Promise<void> {
    this.menu.set(null);
    const edge = edgeOf(this.model(), id);
    if (!edge)
      return;
    const label = await this.prompts.ask({
      title: 'Link label',
      body: 'Label',
      initialValue: edge.label,
      placeholder: 'label',
    });
    if (label === null)
      return;
    this.modelChange.emit(patchEdge(this.model(), id, { label: label.trim() }));
  }

  setEdgeKind(id: string, kind: string): void {
    this.menu.set(null);
    this.modelChange.emit(patchEdge(this.model(), id, { kind }));
  }

  deleteEdge(id: string): void {
    this.menu.set(null);
    this.modelChange.emit(removeEdge(this.model(), id));
  }

  commitLink(kind: string): void {
    const menu = this.menu();
    if (!menu || menu.kind !== 'link-kind')
      return;
    this.menu.set(null);
    this.modelChange.emit(addEdge(this.model(), menu.fromId, menu.toId, menu.label, kind));
  }

  async addTitle(): Promise<void> {
    this.menu.set(null);
    const title = await this.prompts.ask({
      title: 'Title',
      body: 'Diagram title',
      placeholder: 'Title',
      confirmLabel: 'Add',
    });
    if (title === null || !title.trim())
      return;
    this.titleChange.emit(title.trim());
  }

  async renameTitle(): Promise<void> {
    this.menu.set(null);
    const title = await this.prompts.ask({
      title: 'Rename title',
      body: 'Diagram title',
      initialValue: this.model().title,
    });
    if (title === null)
      return;
    this.titleChange.emit(title.trim());
  }

  deleteTitle(): void {
    this.menu.set(null);
    this.titleChange.emit('');
  }

  edgeKindLabel(kind: string): string {
    return kind || 'link';
  }

  private async finishLink(fromId: string, toId: string, x: number, y: number): Promise<void> {
    const model = this.model();
    if (model.kind === 'usecase') {
      this.menu.set({ kind: 'link-kind', x, y, fromId, toId, label: '' });
      return;
    }
    const label = await this.prompts.ask({
      title: 'Link',
      body: 'Label for this link.',
      placeholder: 'label',
    });
    if (label === null)
      return;
    if (model.kind === 'class') {
      this.menu.set({ kind: 'link-kind', x, y, fromId, toId, label: label.trim() });
      return;
    }
    this.modelChange.emit(addEdge(this.model(), fromId, toId, label.trim(), ''));
  }

  private zoomAt(cx: number, cy: number, factor: number): void {
    const scale = this.zoom();
    const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number((scale * factor).toFixed(3))));
    if (next === scale)
      return;
    const pan = this.pan();
    const wx = (cx - pan.x) / scale;
    const wy = (cy - pan.y) / scale;
    this.zoom.set(next);
    this.pan.set({ x: cx - wx * next, y: cy - wy * next });
    this.emitCamera();
  }

  private emitCamera(): void {
    this.cameraChange.emit({
      zoom: this.zoom(),
      x: Math.round(this.pan().x),
      y: Math.round(this.pan().y),
    });
  }

  private deleteIds(ids: readonly string[]): void {
    const drop = new Set(ids);
    this.selectedIds.set(this.selectedIds().filter((id) => !drop.has(id)));
    this.modelChange.emit(ids.reduce((model, id) => removeNode(model, id), this.model()));
  }

  private focusViewport(): void {
    this.viewport().nativeElement.focus({ preventScroll: true });
  }

  private capture(event: PointerEvent): void {
    this.viewport().nativeElement.setPointerCapture(event.pointerId);
  }

  private worldPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.viewport().nativeElement.getBoundingClientRect();
    const pan = this.pan();
    const zoom = this.zoom();
    return {
      x: (event.clientX - rect.left - pan.x) / zoom,
      y: (event.clientY - rect.top - pan.y) / zoom,
    };
  }

  private hostPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.viewport().nativeElement.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
}
