import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TxHintComponent } from '@testrix/ui';
import { PromptDialogService } from '../../../core/prompt-dialog.service';
import {
  ACTIVITY_ORIGIN,
  ACTIVITY_PITCH,
  activityIndexAt,
  activityRestIndex,
  deleteActivityStep,
  insertActivitySteps,
  moveActivityStep,
} from './plantuml-activity-edit';
import type { ActivityModel, ActivityStep } from './plantuml-generator';
import {
  idsInside,
  isTypingTarget,
  normalizeRect,
  selectionFromClick,
} from './plantuml-selection';
import type { PlantumlGridCamera } from './plantuml-sequence-grid.component';

type ActivityMenu =
  | { readonly kind: 'canvas'; readonly x: number; readonly y: number; readonly worldY: number }
  | { readonly kind: 'step'; readonly x: number; readonly y: number; readonly id: string }
  | { readonly kind: 'title'; readonly x: number; readonly y: number };

interface StepDrag {
  readonly id: string;
  readonly pointerY: number;
  readonly originTop: number;
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

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.4;
const DRAG_THRESHOLD_PX = 4;
const ACTIVITY_COLUMN = 200;
const ADD_KINDS: readonly ActivityStep['kind'][] = ['action', 'if', 'fork', 'start', 'stop'];

@Component({
  selector: 'tx-plantuml-activity-grid',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './plantuml-activity-grid.component.html',
  styleUrl: './plantuml-activity-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlantumlActivityGridComponent {
  private readonly prompts = inject(PromptDialogService);
  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');
  private cameraRestored = false;
  private stepDrag: StepDrag | null = null;
  private panDrag: { pointerX: number; pointerY: number; panX: number; panY: number } | null = null;

  readonly addKinds = ADD_KINDS;
  readonly model = input.required<ActivityModel>();
  readonly savedCamera = input<PlantumlGridCamera | null>(null);
  readonly cameraChange = output<PlantumlGridCamera>();
  readonly modelChange = output<ActivityModel>();
  readonly titleChange = output<string>();

  readonly zoom = signal(1);
  readonly pan = signal({ x: 48, y: 16 });
  readonly menu = signal<ActivityMenu | null>(null);
  readonly panning = signal(false);
  readonly dragTop = signal<number | null>(null);
  readonly dragIndex = signal<number | null>(null);
  readonly selectedIds = signal<readonly string[]>([]);
  readonly marquee = signal<Marquee | null>(null);
  private readonly stepDragId = signal<string | null>(null);

  readonly rows = computed(() => {
    const steps = this.model().steps;
    const dragId = this.stepDragId();
    const index = this.dragIndex();
    const ordered = dragId !== null && index !== null
      ? previewMove(steps, dragId, index)
      : steps;
    return ordered.map((step, row) => {
      const shape = activityShape(step.kind);
      const slot = ACTIVITY_ORIGIN + row * ACTIVITY_PITCH;
      const resting = slot + (ACTIVITY_PITCH - shape.height) / 2;
      const top = dragId === step.id && this.dragTop() !== null ? this.dragTop() ?? resting : resting;
      return {
        step,
        top,
        left: ACTIVITY_COLUMN - shape.width / 2,
        width: shape.width,
        height: shape.height,
        dragging: dragId === step.id,
        label: stepLabel(step),
      };
    });
  });

  readonly flowLinks = computed(() => {
    const rows = this.rows();
    const links: { id: string; x: number; y1: number; y2: number }[] = [];
    for (let index = 0; index < rows.length - 1; index += 1) {
      const from = rows[index];
      const to = rows[index + 1];
      if (!from || !to || to.top <= from.top + from.height)
        continue;
      links.push({
        id: `${from.step.id}-${to.step.id}`,
        x: ACTIVITY_COLUMN,
        y1: from.top + from.height,
        y2: to.top,
      });
    }
    return links;
  });

  readonly guideTop = computed(() => {
    const index = this.dragIndex();
    if (index === null || this.stepDragId() === null)
      return null;
    return ACTIVITY_ORIGIN + index * ACTIVITY_PITCH;
  });

  readonly transform = computed(() => {
    const pan = this.pan();
    return `translate(${pan.x}px, ${pan.y}px) scale(${this.zoom()})`;
  });

  readonly marqueeBox = computed(() => {
    const marquee = this.marquee();
    if (!marquee)
      return null;
    return normalizeRect(marquee.x0, marquee.y0, marquee.x1, marquee.y1);
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
    if (target.closest('.tx-act__step, .tx-act__menu, .tx-act__title, .tx-act__backdrop'))
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
    if (this.panDrag) {
      this.pan.set({
        x: this.panDrag.panX + (event.clientX - this.panDrag.pointerX),
        y: this.panDrag.panY + (event.clientY - this.panDrag.pointerY),
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
        this.rows().map((row) => ({
          id: row.step.id,
          x: row.left,
          y: row.top,
          width: row.width,
          height: row.height,
        })),
        rect,
        next.base,
      ));
      return;
    }
    const drag = this.stepDrag;
    if (!drag)
      return;
    const dy = event.clientY - drag.pointerY;
    const moved = drag.moved || Math.abs(dy) >= DRAG_THRESHOLD_PX;
    this.stepDrag = { ...drag, moved };
    if (!moved)
      return;
    const top = drag.originTop + dy / this.zoom();
    this.dragTop.set(top);
    const steps = this.model().steps;
    const from = steps.findIndex((step) => step.id === drag.id);
    const slot = activityIndexAt(this.worldPoint(event).y, steps.length);
    this.dragIndex.set(activityRestIndex(steps.length, from, slot));
  }

  handlePointerUp(): void {
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
    const drag = this.stepDrag;
    if (!drag)
      return;
    const index = this.dragIndex();
    const moved = drag.moved;
    this.stepDrag = null;
    this.stepDragId.set(null);
    this.dragTop.set(null);
    this.dragIndex.set(null);
    if (!moved || index === null) {
      this.selectedIds.set(selectionFromClick(
        drag.before,
        drag.id,
        drag.toggle,
        drag.range,
        this.model().steps.map((step) => step.id),
      ));
      return;
    }
    const steps = this.model().steps;
    const before = steps.filter((step) => step.id !== drag.id)[index];
    const next = moveActivityStep(steps, drag.id, before?.id ?? null);
    if (!this.selectedIds().includes(drag.id))
      this.selectedIds.set([drag.id]);
    if (next !== steps)
      this.modelChange.emit({ ...this.model(), steps: next });
  }

  openCanvasMenu(event: MouseEvent): void {
    event.preventDefault();
    const host = this.hostPoint(event);
    const world = this.worldPoint(event);
    this.menu.set({ kind: 'canvas', x: host.x, y: host.y, worldY: world.y });
  }

  openStepMenu(event: MouseEvent, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.selectedIds().includes(id))
      this.selectedIds.set([id]);
    const host = this.hostPoint(event);
    this.menu.set({ kind: 'step', x: host.x, y: host.y, id });
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

  startStepDrag(event: PointerEvent, id: string, top: number): void {
    if (event.button !== 0)
      return;
    event.preventDefault();
    event.stopPropagation();
    this.menu.set(null);
    this.focusViewport();
    const before = this.selectedIds();
    const modified = event.shiftKey || event.ctrlKey || event.metaKey;
    if (!modified && !before.includes(id))
      this.selectedIds.set([id]);
    this.stepDrag = {
      id,
      pointerY: event.clientY,
      originTop: top,
      moved: false,
      before,
      toggle: event.ctrlKey || event.metaKey,
      range: event.shiftKey,
    };
    this.stepDragId.set(id);
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
      this.selectedIds.set(this.model().steps.map((step) => step.id));
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
      if (ids.length !== 1 || !ids[0] || !this.canRename(ids[0]))
        return;
      event.preventDefault();
      event.stopPropagation();
      void this.renameStep(ids[0]);
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')
      return;
    const ids = this.selectedIds();
    if (!ids.length)
      return;
    event.preventDefault();
    event.stopPropagation();
    this.reorderSelection(event.key === 'ArrowUp' ? -1 : 1);
  }

  addStep(kind: ActivityStep['kind']): void {
    const menu = this.menu();
    if (!menu || menu.kind !== 'canvas')
      return;
    this.menu.set(null);
    const steps = this.model().steps;
    const index = activityIndexAt(menu.worldY, steps.length);
    this.modelChange.emit({
      ...this.model(),
      steps: insertActivitySteps(steps, index, kind),
    });
  }

  async renameStep(id: string): Promise<void> {
    this.menu.set(null);
    const step = this.model().steps.find((item) => item.id === id);
    if (!step || (step.kind !== 'action' && step.kind !== 'if'))
      return;
    const label = await this.prompts.ask({
      title: 'Rename',
      body: 'Label',
      initialValue: step.label,
      placeholder: step.kind === 'if' ? 'Condition?' : 'Step',
      multiline: true,
      rows: 3,
    });
    if (label === null)
      return;
    const next = label.replace(/\\n/g, '\n').trim();
    this.modelChange.emit({
      ...this.model(),
      steps: this.model().steps.map((item) => item.id === id ? { ...item, label: next || item.label } : item),
    });
  }

  deleteStep(id: string): void {
    this.menu.set(null);
    const ids = this.selectedIds().includes(id) ? this.selectedIds() : [id];
    this.deleteIds(ids);
  }

  canRename(id: string): boolean {
    const kind = this.model().steps.find((item) => item.id === id)?.kind;
    return kind === 'action' || kind === 'if';
  }

  addLabel(kind: ActivityStep['kind']): string {
    if (kind === 'action')
      return 'Add action';
    if (kind === 'if')
      return 'Add decision';
    if (kind === 'fork')
      return 'Add fork';
    if (kind === 'start')
      return 'Add start';
    return 'Add stop';
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

  private deleteIds(ids: readonly string[]): void {
    let steps = this.model().steps;
    for (const id of ids)
      steps = deleteActivityStep(steps, id);
    const live = new Set(steps.map((step) => step.id));
    this.selectedIds.set(this.selectedIds().filter((id) => live.has(id)));
    this.menu.set(null);
    if (steps !== this.model().steps)
      this.modelChange.emit({ ...this.model(), steps });
  }

  private reorderSelection(direction: -1 | 1): void {
    const picked = new Set(this.selectedIds());
    let steps = this.model().steps;
    const ordered = steps
      .map((step, index) => ({ id: step.id, index }))
      .filter((step) => picked.has(step.id));
    const list = direction < 0 ? ordered : [...ordered].reverse();
    for (const item of list)
      steps = nudgeActivity(steps, item.id, direction);
    if (steps !== this.model().steps)
      this.modelChange.emit({ ...this.model(), steps });
  }

  private focusViewport(): void {
    this.viewport().nativeElement.focus({ preventScroll: true });
  }

  private capture(event: PointerEvent): void {
    this.viewport().nativeElement.setPointerCapture(event.pointerId);
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

function activityShape(kind: ActivityStep['kind']): { width: number; height: number } {
  if (kind === 'start')
    return { width: 22, height: 22 };
  if (kind === 'stop')
    return { width: 28, height: 28 };
  if (kind === 'if')
    return { width: 156, height: 72 };
  if (kind === 'endif')
    return { width: 28, height: 28 };
  if (kind === 'fork' || kind === 'endfork')
    return { width: 196, height: 8 };
  return { width: 188, height: 42 };
}

function stepLabel(step: ActivityStep): string {
  if (step.kind === 'start')
    return 'start';
  if (step.kind === 'stop')
    return 'stop';
  if (step.kind === 'endif')
    return 'endif';
  if (step.kind === 'fork')
    return 'fork';
  if (step.kind === 'endfork')
    return 'end fork';
  return step.label || (step.kind === 'if' ? 'Condition?' : 'Step');
}

function nudgeActivity(
  steps: readonly ActivityStep[],
  id: string,
  direction: -1 | 1,
): readonly ActivityStep[] {
  const index = steps.findIndex((step) => step.id === id);
  if (index < 0)
    return steps;
  if (direction < 0) {
    const before = steps[index - 1];
    if (!before)
      return steps;
    return moveActivityStep(steps, id, before.id);
  }
  const after = steps[index + 2];
  return moveActivityStep(steps, id, after?.id ?? null);
}

function previewMove(steps: readonly ActivityStep[], id: string, index: number): readonly ActivityStep[] {
  const rest = steps.filter((step) => step.id !== id);
  const before = rest[Math.max(0, Math.min(rest.length, index))];
  return moveActivityStep(steps, id, before?.id ?? null);
}
