import { Overlay, OverlayModule, type OverlayRef } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import {
  afterNextRender,
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
  untracked,
  type TemplateRef,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { playLeaveThen } from '@testrix/ui';

import { PromptDialogService, type PromptDialogRequest } from '../../../core/prompt-dialog.service';
import {
  sequenceBreaks,
  type SequenceArrow,
  type SequenceLineStyle,
  type SequenceModel,
  type SequenceParticipant,
  type SequenceStep,
} from './plantuml-generator';
import {
  frameChromeIds,
  layoutSequence,
  placeFrameBoxes,
  stepIdBeforeY,
  type SequenceActivationBar,
  type SequenceLaneGeom,
  type SequenceMessageRow,
  type SequenceNoteRow,
} from './plantuml-sequence-layout';
import { isTypingTarget, selectionFromClick } from './plantuml-selection';

export interface PlantumlGridCamera {
  readonly zoom: number;
  readonly x: number;
  readonly y: number;
}

export interface PlantumlGridAddParticipant {
  readonly role: 'actor' | 'participant';
  readonly x: number;
  readonly y: number;
}

export interface PlantumlGridParticipantChange {
  readonly id: string;
  readonly field: 'name' | 'alias' | 'color' | 'role' | 'lineColor' | 'lineStyle';
  readonly value: string;
}

export interface PlantumlGridReorder {
  readonly fromIndex: number;
  readonly toIndex: number;
}

export interface PlantumlGridSectionChange {
  readonly id: string;
  readonly field: 'label';
  readonly value: string;
}

const DRAG_THRESHOLD_PX = 4;
/** Empty lifeline kept below the last row while editing. */
const EDIT_LIFELINE_TAIL = 720;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.4;
const DEFAULT_LINE_COLOR = '#5f6368';

const COLOR_PRESETS = [
  { id: 'magenta', label: 'Magenta', value: '#magenta', hex: '#ff00ff' },
  { id: 'green', label: 'Light green', value: '#LightGreen', hex: '#90ee90' },
  { id: 'white', label: 'White', value: '#white', hex: '#e8eaed' },
  { id: 'clear', label: 'Default', value: '', hex: '' },
] as const;

const LINE_COLOR_PRESETS = [
  { id: 'white', label: 'White', value: '#white', hex: '#e8eaed' },
  { id: 'magenta', label: 'Magenta', value: '#magenta', hex: '#ff00ff' },
  { id: 'green', label: 'Light green', value: '#LightGreen', hex: '#90ee90' },
  { id: 'blue', label: 'Blue', value: '#blue', hex: '#42a5f5' },
  { id: 'orange', label: 'Orange', value: '#orange', hex: '#ffa726' },
  { id: 'clear', label: 'Default', value: '', hex: '' },
] as const;

const LINE_STYLE_PRESETS: readonly { readonly id: SequenceLineStyle; readonly label: string }[] = [
  { id: 'dotted', label: 'Dotted' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'solid', label: 'Clean' },
  { id: 'bold', label: 'Bold' },
];

const ARROW_PRESETS: readonly {
  readonly id: SequenceArrow;
  readonly label: string;
  readonly dashed: boolean;
  readonly open: boolean;
}[] = [
  { id: '->', label: 'Solid', dashed: false, open: false },
  { id: '-->', label: 'Dashed', dashed: true, open: false },
  { id: '->>', label: 'Open', dashed: false, open: true },
  { id: '-->>', label: 'Dashed open', dashed: true, open: true },
];

type CanvasMenuState =
  | { readonly kind: 'canvas' }
  | { readonly kind: 'node'; readonly participantId: string }
  | { readonly kind: 'line'; readonly participantId: string }
  | { readonly kind: 'section'; readonly sectionId: string }
  | { readonly kind: 'message' | 'note' | 'frame' | 'else'; readonly stepId: string }
  | { readonly kind: 'activation'; readonly activateId: string; readonly deactivateId: string | null }
  | { readonly kind: 'title' };

type MenuPanel = 'root' | 'add' | 'design' | 'line-color' | 'line-style' | 'arrow';

export interface PlantumlGridAddAlt {
  readonly label: string;
  readonly beforeStepId: string | null;
}

export interface PlantumlGridFrameEdit {
  readonly id: string;
  readonly mode: 'move' | 'start' | 'end';
  readonly beforeStepId: string | null;
}

export interface PlantumlGridStepMove {
  readonly id: string;
  readonly beforeStepId: string | null;
}

export interface PlantumlGridAddBlock {
  readonly kind: 'note' | 'else' | 'loop' | 'group';
  readonly label: string;
  readonly overId: string | null;
  readonly beforeStepId: string | null;
}

export interface PlantumlGridStepChange {
  readonly id: string;
  readonly field: 'label' | 'text' | 'arrow' | 'over';
  readonly value: string;
}

interface LaneDragState {
  readonly id: string;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly originX: number;
  readonly fromIndex: number;
  readonly offsetX: number;
  readonly hoverIndex: number;
  readonly moved: boolean;
}

export interface PlantumlGridAddMessage {
  readonly fromId: string;
  readonly toId: string;
  readonly label: string;
  readonly beforeStepId: string | null;
}

interface MessageDragState {
  readonly pointerId: number;
  readonly fromId: string;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly y: number;
  readonly x: number;
  readonly toId: string | null;
  readonly moved: boolean;
}

interface NoteLane {
  readonly center: number;
  readonly alias: string;
}

interface NoteDragState {
  readonly id: string;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly anchorIndex: number;
  readonly moved: boolean;
  readonly lanes: readonly NoteLane[];
  readonly over: string;
}

interface FrameAnchor {
  readonly y: number;
  readonly id: string;
}

interface FrameDragState {
  readonly id: string;
  readonly mode: 'move' | 'start' | 'end';
  readonly pointerId: number;
  readonly startClientY: number;
  readonly guideY: number;
  readonly moved: boolean;
  readonly anchors: readonly FrameAnchor[];
}

interface OrderDragState {
  readonly id: string;
  readonly pointerId: number;
  readonly startClientY: number;
  readonly guideY: number;
  readonly moved: boolean;
  readonly settling: boolean;
  readonly anchors: readonly FrameAnchor[];
}

interface MessageDraftView {
  readonly left: number;
  readonly width: number;
  readonly y: number;
  readonly headAtEnd: boolean;
}

@Component({
  selector: 'tx-plantuml-sequence-grid',
  standalone: true,
  imports: [OverlayModule],
  templateUrl: './plantuml-sequence-grid.component.html',
  styleUrl: './plantuml-sequence-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlantumlSequenceGridComponent {
  private readonly overlay = inject(Overlay);
  private readonly vcr = inject(ViewContainerRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly prompt = inject(PromptDialogService);
  private overlayRef: OverlayRef | null = null;
  private menuCloseToken = 0;
  private resizeObserver: ResizeObserver | null = null;
  private panning = false;
  private panOrigin = { x: 0, y: 0, panX: 0, panY: 0 };
  private suppressClick = false;
  private frameCommit: string | null | undefined = undefined;
  private orderCommit: string | null | undefined = undefined;
  private orderSettleToken = 0;
  private framePassTarget: Element | null = null;
  private menuWorldX = 0;
  private menuWorldY = 0;
  private cameraRestored = false;

  readonly model = input.required<SequenceModel>();
  readonly savedCamera = input<PlantumlGridCamera | null>(null);
  readonly cameraChange = output<PlantumlGridCamera>();

  readonly addParticipant = output<PlantumlGridAddParticipant>();
  readonly removeParticipant = output<string>();
  readonly participantChange = output<PlantumlGridParticipantChange>();
  readonly addSection = output<string>();
  readonly addMessage = output<PlantumlGridAddMessage>();
  readonly addAlt = output<PlantumlGridAddAlt>();
  readonly addBlock = output<PlantumlGridAddBlock>();
  readonly frameEdit = output<PlantumlGridFrameEdit>();
  readonly stepMove = output<PlantumlGridStepMove>();
  readonly titleChange = output<string>();
  readonly reorderParticipants = output<PlantumlGridReorder>();
  readonly sectionChange = output<PlantumlGridSectionChange>();
  readonly removeSection = output<string>();
  readonly stepChange = output<PlantumlGridStepChange>();
  readonly removeSteps = output<readonly string[]>();

  private readonly menuTemplate = viewChild.required<TemplateRef<unknown>>('canvasMenu');
  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');

  readonly selectedId = signal<string | null>(null);
  readonly selectedIds = signal<readonly string[]>([]);
  readonly menuState = signal<CanvasMenuState | null>(null);
  readonly menuPanel = signal<MenuPanel>('root');
  readonly colorPresets = COLOR_PRESETS;
  readonly arrowPresets = ARROW_PRESETS;
  readonly lineColorPresets = LINE_COLOR_PRESETS;
  readonly lineStylePresets = LINE_STYLE_PRESETS;
  readonly viewportWidth = signal(960);
  readonly zoom = signal(1);
  readonly pan = signal({ x: 0, y: 0 });
  readonly isPanning = signal(false);
  readonly laneDrag = signal<LaneDragState | null>(null);
  readonly messageDrag = signal<MessageDragState | null>(null);
  readonly frameDrag = signal<FrameDragState | null>(null);
  readonly noteDrag = signal<NoteDragState | null>(null);
  readonly orderDrag = signal<OrderDragState | null>(null);

  readonly transform = computed(
    () => `translate(${this.pan().x}px, ${this.pan().y}px) scale(${this.zoom()})`,
  );

  readonly diagram = computed(() => {
    const laid = layoutSequence(
      { ...this.model(), hideFootbox: true },
      this.viewportWidth(),
    );
    return {
      ...laid,
      laneHeight: laid.laneHeight + EDIT_LIFELINE_TAIL,
      height: laid.height + EDIT_LIFELINE_TAIL,
    };
  });

  readonly lanes = computed(() => {
    const participants = this.model().participants;
    const diagram = this.diagram();
    const drag = this.laneDrag();
    const orderIds = participants.map((item) => item.id);
    if (drag && orderIds.length > 0) {
      const next = [...orderIds];
      const [id] = next.splice(drag.fromIndex, 1);
      if (id)
        next.splice(drag.hoverIndex, 0, id);
      return this.buildLanes(next, participants, diagram.lanes, drag, diagram.laneHeight);
    }
    return this.buildLanes(orderIds, participants, diagram.lanes, null, diagram.laneHeight);
  });

  readonly frames = computed(() => {
    const rows = this.diagram().frames;
    const boxes = new Map(
      placeFrameBoxes(
        rows,
        this.lanes().map((lane) => ({ id: lane.participant.id, center: lane.x + lane.width / 2 })),
      ).map((box) => [box.id, box]),
    );
    return rows.map((frame) => {
      const box = boxes.get(frame.id);
      return {
        ...frame,
        left: box?.left ?? this.diagram().start,
        width: box?.width ?? 120,
      };
    });
  });

  readonly messageDraft = computed((): MessageDraftView | null => {
    const drag = this.messageDrag();
    if (!drag?.moved)
      return null;
    const from = this.lanes().find((lane) => lane.participant.id === drag.fromId);
    if (!from)
      return null;
    const fromX = from.x + from.width / 2;
    const to = drag.toId
      ? this.lanes().find((lane) => lane.participant.id === drag.toId)
      : null;
    const toX = to ? to.x + to.width / 2 : drag.x;
    const span = Math.abs(toX - fromX);
    if (span < 12)
      return null;
    return {
      left: Math.min(fromX, toX),
      width: span,
      y: drag.y,
      headAtEnd: toX >= fromX,
    };
  });

  readonly menuParticipant = computed(() => {
    const state = this.menuState();
    if (!state || (state.kind !== 'node' && state.kind !== 'line'))
      return null;
    return this.model().participants.find((item) => item.id === state.participantId) ?? null;
  });

  readonly menuSection = computed(() => {
    const state = this.menuState();
    if (!state || state.kind !== 'section')
      return null;
    const step = this.model().steps.find((item) => item.id === state.sectionId);
    return step?.kind === 'divider' ? step : null;
  });

  readonly menuStep = computed(() => {
    const state = this.menuState();
    if (!state || !('stepId' in state))
      return null;
    return this.model().steps.find((item) => item.id === state.stepId) ?? null;
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
    this.destroyRef.onDestroy(() => {
      this.closeMenu(true);
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
    });
    afterNextRender(() => {
      const host = this.viewport().nativeElement;
      this.measureViewport();
      this.resizeObserver = new ResizeObserver(() => this.measureViewport());
      this.resizeObserver.observe(host);
    });
  }

  handleWheel(event: WheelEvent): void {
    event.preventDefault();
    const host = this.viewport().nativeElement;
    const rect = host.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    this.zoomAt(cx, cy, factor);
  }

  handlePointerDown(event: PointerEvent): void {
    if (event.button !== 1)
      return;
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu(true);
    this.panning = true;
    this.isPanning.set(true);
    const pan = this.pan();
    this.panOrigin = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    const host = this.viewport().nativeElement;
    host.setPointerCapture(event.pointerId);
  }

  handleLanePointerDown(participantId: string, event: PointerEvent): void {
    if (event.button !== 0 || this.panning)
      return;
    const participants = this.model().participants;
    const fromIndex = participants.findIndex((item) => item.id === participantId);
    if (fromIndex < 0)
      return;
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu(true);
    this.primeSelection(participantId, event);
    const originX = this.lanes().find((lane) => lane.participant.id === participantId)?.x ?? this.diagram().start;
    this.laneDrag.set({
      id: participantId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      originX,
      fromIndex,
      offsetX: 0,
      hoverIndex: fromIndex,
      moved: false,
    });
    this.viewport().nativeElement.setPointerCapture(event.pointerId);
  }

  handleLifelinePointerDown(participantId: string, event: PointerEvent): void {
    if (event.button !== 0 || this.panning || this.laneDrag())
      return;
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu(true);
    const world = this.worldPoint(event);
    this.messageDrag.set({
      pointerId: event.pointerId,
      fromId: participantId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      y: this.messageY(world.y),
      x: world.x,
      toId: null,
      moved: false,
    });
    this.viewport().nativeElement.setPointerCapture(event.pointerId);
  }

  passFramePointer(event: PointerEvent): void {
    if (event.button !== 0)
      return;
    const under = this.elementUnderFrameBodies(event.clientX, event.clientY);
    const target = under?.closest('.tx-seq-grid__lifeline, .tx-seq-grid__box');
    if (!target)
      return;
    event.stopPropagation();
    this.framePassTarget = target;
    target.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      button: event.button,
      buttons: event.buttons,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    }));
  }

  handleFrameBodyClick(frameId: string, event: MouseEvent): void {
    const under = this.framePassTarget;
    this.framePassTarget = null;
    if (!under) {
      this.selectNode(frameId, event);
      return;
    }
    event.stopPropagation();
    under.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      button: event.button,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    }));
  }

  startFrameDrag(frameId: string, mode: 'move' | 'start' | 'end', event: PointerEvent): void {
    if (event.button !== 0 || this.panning || this.laneDrag() || this.messageDrag() || this.orderDrag())
      return;
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu(true);
    this.primeSelection(frameId, event);
    this.frameCommit = undefined;
    const world = this.worldPoint(event);
    this.frameDrag.set({
      id: frameId,
      mode,
      pointerId: event.pointerId,
      startClientY: event.clientY,
      guideY: this.messageY(world.y),
      moved: false,
      anchors: this.frameAnchors(frameId, mode),
    });
    this.viewport().nativeElement.setPointerCapture(event.pointerId);
  }

  startOrderDrag(stepId: string, event: PointerEvent): void {
    if (
      event.button !== 0
      || this.panning
      || this.laneDrag()
      || this.messageDrag()
      || this.frameDrag()
      || this.noteDrag()
      || this.orderDrag()
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu(true);
    this.orderCommit = undefined;
    this.primeSelection(stepId, event);
    const world = this.worldPoint(event);
    this.orderDrag.set({
      id: stepId,
      pointerId: event.pointerId,
      startClientY: event.clientY,
      guideY: this.messageY(world.y),
      moved: false,
      settling: false,
      anchors: this.stepAnchors().filter((anchor) => anchor.id !== stepId),
    });
    this.viewport().nativeElement.setPointerCapture(event.pointerId);
  }

  orderTop(id: string, layoutY: number): number {
    const drag = this.orderDrag();
    if (!drag || drag.id !== id || !drag.moved)
      return layoutY;
    return drag.guideY;
  }

  startNoteDrag(noteId: string, event: PointerEvent): void {
    if (event.button !== 0 || this.panning || this.laneDrag() || this.messageDrag() || this.frameDrag() || this.orderDrag())
      return;
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu(true);
    this.primeSelection(noteId, event);
    const world = this.worldPoint(event);
    const lanes = this.noteLanes();
    const anchorIndex = this.nearestLaneIndex(lanes, world.x);
    this.noteDrag.set({
      id: noteId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      anchorIndex,
      moved: false,
      lanes,
      over: '',
    });
    this.viewport().nativeElement.setPointerCapture(event.pointerId);
  }

  selectMessage(event: MouseEvent): void {
    const row = this.messageAt(event);
    if (!row)
      return;
    this.selectNode(row.id, event);
  }

  handlePointerMove(event: PointerEvent): void {
    const ordering = this.orderDrag();
    if (ordering && ordering.pointerId === event.pointerId && !ordering.settling) {
      event.preventDefault();
      const moved = ordering.moved || Math.abs(event.clientY - ordering.startClientY) > DRAG_THRESHOLD_PX;
      const world = this.worldPoint(event);
      const guideY = this.messageY(world.y);
      this.orderDrag.set({ ...ordering, guideY, moved });
      if (!moved)
        return;
      const beforeStepId = stepIdBeforeY(ordering.anchors, guideY);
      if (beforeStepId === this.orderCommit)
        return;
      this.orderCommit = beforeStepId;
      this.stepMove.emit({ id: ordering.id, beforeStepId });
      return;
    }
    const noting = this.noteDrag();
    if (noting && noting.pointerId === event.pointerId) {
      event.preventDefault();
      const moved = noting.moved || Math.abs(event.clientX - noting.startClientX) > DRAG_THRESHOLD_PX;
      if (!moved) {
        this.noteDrag.set({ ...noting, moved });
        return;
      }
      const world = this.worldPoint(event);
      const index = this.nearestLaneIndex(noting.lanes, world.x);
      if (index === noting.anchorIndex)
        return;
      const over = this.noteOver(noting.lanes, noting.anchorIndex, index);
      this.noteDrag.set({ ...noting, moved: true, over });
      if (over && over !== noting.over)
        this.stepChange.emit({ id: noting.id, field: 'over', value: over });
      return;
    }
    const framing = this.frameDrag();
    if (framing && framing.pointerId === event.pointerId) {
      event.preventDefault();
      const world = this.worldPoint(event);
      const moved = framing.moved || Math.abs(event.clientY - framing.startClientY) > DRAG_THRESHOLD_PX;
      const guideY = this.messageY(world.y);
      this.frameDrag.set({ ...framing, guideY, moved });
      if (!moved)
        return;
      const beforeStepId = stepIdBeforeY(framing.anchors, guideY);
      if (beforeStepId === this.frameCommit)
        return;
      this.frameCommit = beforeStepId;
      this.frameEdit.emit({ id: framing.id, mode: framing.mode, beforeStepId });
      return;
    }
    const drawing = this.messageDrag();
    if (drawing && drawing.pointerId === event.pointerId) {
      event.preventDefault();
      const world = this.worldPoint(event);
      const moved = drawing.moved
        || Math.hypot(event.clientX - drawing.startClientX, event.clientY - drawing.startClientY) > DRAG_THRESHOLD_PX;
      const toId = this.laneIdAt(world.x);
      const target = toId && toId !== drawing.fromId
        ? this.lanes().find((lane) => lane.participant.id === toId)
        : null;
      this.messageDrag.set({
        ...drawing,
        y: this.messageY(world.y),
        x: target ? target.x + target.width / 2 : world.x,
        toId: target ? toId : null,
        moved,
      });
      return;
    }
    const drag = this.laneDrag();
    if (drag && drag.pointerId === event.pointerId) {
      event.preventDefault();
      const scale = this.zoom() || 1;
      const offsetX = (event.clientX - drag.startClientX) / scale;
      const moved = drag.moved || Math.abs(event.clientX - drag.startClientX) > DRAG_THRESHOLD_PX;
      const slots = this.diagram().lanes;
      const dragged = this.lanes().find((lane) => lane.participant.id === drag.id);
      const centerX = drag.originX + offsetX + (dragged?.width ?? 40) / 2;
      let hoverIndex = drag.fromIndex;
      let best = Number.POSITIVE_INFINITY;
      slots.forEach((slot, index) => {
        const distance = Math.abs(slot.center - centerX);
        if (distance < best) {
          best = distance;
          hoverIndex = index;
        }
      });
      this.laneDrag.set({ ...drag, offsetX, hoverIndex, moved });
      return;
    }
    if (!this.panning)
      return;
    event.preventDefault();
    this.pan.set({
      x: this.panOrigin.panX + (event.clientX - this.panOrigin.x),
      y: this.panOrigin.panY + (event.clientY - this.panOrigin.y),
    });
  }

  handlePointerUp(event: PointerEvent): void {
    const ordering = this.orderDrag();
    if (ordering && ordering.pointerId === event.pointerId) {
      this.finishOrderDrag(ordering);
      return;
    }
    const noting = this.noteDrag();
    if (noting && noting.pointerId === event.pointerId) {
      this.finishNoteDrag(noting);
      return;
    }
    const framing = this.frameDrag();
    if (framing && framing.pointerId === event.pointerId) {
      this.finishFrameDrag(framing);
      return;
    }
    const drawing = this.messageDrag();
    if (drawing && drawing.pointerId === event.pointerId) {
      void this.finishMessageDrag(drawing);
      return;
    }
    const drag = this.laneDrag();
    if (drag && drag.pointerId === event.pointerId) {
      this.finishLaneDrag(drag);
      return;
    }
    if (!this.panning)
      return;
    this.panning = false;
    this.isPanning.set(false);
    const host = this.viewport().nativeElement;
    if (host.hasPointerCapture(event.pointerId))
      host.releasePointerCapture(event.pointerId);
    this.emitCamera();
  }

  handleAuxClick(event: MouseEvent): void {
    if (event.button === 1)
      event.preventDefault();
  }

  handleCanvasContextMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.menuPanel.set('root');
    this.rememberMenuPoint(event);
    this.menuState.set({ kind: 'canvas' });
    this.openMenu(event);
  }

  handleNodeContextMenu(participant: SequenceParticipant, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.pinSelection(participant.id);
    this.menuPanel.set('root');
    this.menuState.set({ kind: 'node', participantId: participant.id });
    this.openMenu(event);
  }

  handleLineContextMenu(participant: SequenceParticipant, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.pinSelection(participant.id);
    this.menuPanel.set('root');
    this.rememberMenuPoint(event);
    this.menuState.set({ kind: 'line', participantId: participant.id });
    this.openMenu(event);
  }

  handleSectionContextMenu(sectionId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.pinSelection(sectionId);
    this.menuPanel.set('root');
    this.menuState.set({ kind: 'section', sectionId });
    this.openMenu(event);
  }

  handleCanvasClick(): void {
    this.clearSelection();
    this.closeMenu();
  }

  selectNode(id: string, event: Event): void {
    event.stopPropagation();
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    const mouse = event instanceof MouseEvent ? event : null;
    const next = selectionFromClick(
      this.selectedIds(),
      id,
      !!(mouse?.ctrlKey || mouse?.metaKey),
      !!mouse?.shiftKey,
      this.selectionOrder(),
    );
    this.selectedIds.set(next);
    this.selectedId.set(next.includes(id) ? id : next.at(-1) ?? null);
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
      this.clearSelection();
      this.closeMenu();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      event.stopPropagation();
      const ids = this.selectionOrder();
      this.selectedIds.set(ids);
      this.selectedId.set(ids.at(-1) ?? null);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!this.selectedIds().length && !this.selectedId())
        return;
      event.preventDefault();
      event.stopPropagation();
      this.deleteSelection();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      this.nudgeParticipant(event);
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown')
      this.nudgeStep(event);
  }

  addActor(): void {
    this.emitAdd('actor');
  }

  addParticipantNode(): void {
    this.emitAdd('participant');
  }

  openAddPanel(): void {
    this.menuPanel.set('add');
  }

  async addSectionNode(): Promise<void> {
    this.closeMenu(true);
    const next = await this.askText({
      title: 'Add section',
      body: 'Label for this sequence section.',
      inputLabel: 'Section',
      initialValue: 'Section',
      confirmLabel: 'Add',
    });
    if (next == null)
      return;
    this.addSection.emit(next || 'Section');
  }

  async addAltNode(): Promise<void> {
    const beforeStepId = stepIdBeforeY(this.stepAnchors(), this.menuWorldY);
    this.closeMenu(true);
    const next = await this.askText({
      title: 'Add alt',
      body: 'Condition for this alternative.',
      inputLabel: 'Condition',
      initialValue: 'condition',
      confirmLabel: 'Add',
    });
    if (next == null)
      return;
    this.addAlt.emit({ label: next || 'condition', beforeStepId });
  }

  addNoteNode(): void {
    void this.promptBlock('note', 'Add note', 'Text for this note.', 'Note', 'Note');
  }

  addElseNode(): void {
    void this.promptBlock('else', 'Add else', 'Label for this else branch. Leave it blank for a plain else.', 'Else', '');
  }

  addLoopNode(): void {
    void this.promptBlock('loop', 'Add loop', 'Condition for this loop.', 'Loop', 'loop');
  }

  addGroupNode(): void {
    void this.promptBlock('group', 'Add group', 'Label for this group.', 'Group', 'group');
  }

  openTitleMenu(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.menuPanel.set('root');
    this.menuState.set({ kind: 'title' });
    this.openMenu(event);
  }

  addTitleNode(): void {
    this.closeMenu(true);
    void this.renameTitle();
  }

  addElseToFrame(): void {
    const step = this.menuStep();
    if (!step)
      return;
    const endId = frameChromeIds(this.model().steps, step.id)[1] ?? null;
    this.menuWorldY = 0;
    this.closeMenu(true);
    void this.promptBlock('else', 'Add else', 'Label for this else branch. Leave it blank for a plain else.', 'Else', '', endId);
  }

  handleActivationContextMenu(
    bar: { activateId: string; deactivateId: string | null },
    event: MouseEvent,
  ): void {
    event.preventDefault();
    event.stopPropagation();
    this.menuPanel.set('root');
    this.menuState.set({
      kind: 'activation',
      activateId: bar.activateId,
      deactivateId: bar.deactivateId,
    });
    this.openMenu(event);
  }

  deleteActivation(): void {
    const state = this.menuState();
    if (!state || state.kind !== 'activation')
      return;
    const ids = [state.activateId];
    if (state.deactivateId)
      ids.push(state.deactivateId);
    this.removeSteps.emit(ids);
    this.closeMenu();
  }

  async renameAlias(): Promise<void> {
    const participant = this.menuParticipant();
    if (!participant)
      return;
    this.closeMenu(true);
    const next = await this.prompt.ask({
      title: 'Alias',
      body: 'Short name used by messages and notes.',
      inputLabel: 'Alias',
      initialValue: participant.alias,
      confirmLabel: 'Save',
    });
    if (next == null)
      return;
    const alias = next.trim();
    if (!alias)
      return;
    this.participantChange.emit({ id: participant.id, field: 'alias', value: alias });
  }

  openDesignPanel(): void {
    this.menuPanel.set('design');
  }

  openLineColorPanel(): void {
    this.menuPanel.set('line-color');
  }

  openLineStylePanel(): void {
    this.menuPanel.set('line-style');
  }

  closeToRootPanel(): void {
    this.menuPanel.set('root');
  }

  setRole(role: 'actor' | 'participant'): void {
    const participant = this.menuParticipant();
    if (!participant)
      return;
    this.participantChange.emit({ id: participant.id, field: 'role', value: role });
    if (role === 'actor' && participant.color)
      this.participantChange.emit({ id: participant.id, field: 'color', value: '' });
    this.closeMenu();
  }

  setColor(value: string): void {
    const participant = this.menuParticipant();
    if (!participant || (participant.role ?? 'participant') === 'actor')
      return;
    this.participantChange.emit({ id: participant.id, field: 'color', value });
    this.closeMenu();
  }

  setLineColor(value: string): void {
    const participant = this.menuParticipant();
    if (!participant)
      return;
    this.participantChange.emit({ id: participant.id, field: 'lineColor', value });
    this.closeMenu();
  }

  setLineStyle(value: SequenceLineStyle): void {
    const participant = this.menuParticipant();
    if (!participant)
      return;
    this.participantChange.emit({ id: participant.id, field: 'lineStyle', value });
    this.closeMenu();
  }

  async renameParticipant(): Promise<void> {
    const participant = this.menuParticipant();
    if (!participant)
      return;
    this.closeMenu(true);
    const next = await this.askText({
      title: 'Rename',
      body: 'Display name for this lifeline.',
      inputLabel: 'Name',
      initialValue: participant.name,
      confirmLabel: 'Rename',
    });
    if (!next)
      return;
    this.participantChange.emit({ id: participant.id, field: 'name', value: next });
  }

  deleteParticipant(): void {
    const participant = this.menuParticipant();
    if (!participant)
      return;
    this.removeParticipant.emit(participant.id);
    this.closeMenu();
  }

  async renameSection(): Promise<void> {
    const section = this.menuSection();
    if (!section)
      return;
    this.closeMenu(true);
    const next = await this.askText({
      title: 'Rename section',
      body: 'Label for this sequence section.',
      inputLabel: 'Section',
      initialValue: section.label,
      confirmLabel: 'Rename',
    });
    if (!next)
      return;
    this.sectionChange.emit({ id: section.id, field: 'label', value: next });
  }

  deleteSection(): void {
    const section = this.menuSection();
    if (!section)
      return;
    this.removeSection.emit(section.id);
    this.closeMenu();
  }

  async renameTitle(): Promise<void> {
    this.closeMenu(true);
    const next = await this.askText({
      title: 'Diagram title',
      body: 'Shown above the sequence.',
      inputLabel: 'Title',
      initialValue: this.model().title,
      confirmLabel: 'Save',
    });
    if (next == null)
      return;
    this.titleChange.emit(next);
  }

  deleteTitle(): void {
    this.titleChange.emit('');
    this.closeMenu();
  }

  handleMessageContextMenu(event: MouseEvent): void {
    const row = this.messageAt(event);
    if (!row)
      return;
    this.openStepMenu('message', row.id, event);
  }

  handleNoteContextMenu(stepId: string, event: MouseEvent): void {
    this.openStepMenu('note', stepId, event);
  }

  handleFrameContextMenu(stepId: string, event: MouseEvent): void {
    this.openStepMenu('frame', stepId, event);
  }

  handleElseContextMenu(stepId: string, event: MouseEvent): void {
    this.openStepMenu('else', stepId, event);
  }

  openArrowPanel(): void {
    this.menuPanel.set('arrow');
  }

  async renameMessage(): Promise<void> {
    await this.renameStep('Rename message', 'Label for this arrow.', 'label', 'Message');
  }

  async renameNote(): Promise<void> {
    await this.renameStep('Rename note', 'Text for this note.', 'text', 'Note');
  }

  async renameFrame(): Promise<void> {
    const step = this.menuStep();
    const title = step?.kind === 'loop' || step?.kind === 'alt' || step?.kind === 'group'
      ? `Rename ${step.kind}`
      : 'Rename';
    await this.renameStep(title, 'Label for this block.', 'label', 'Label');
  }

  async renameElse(): Promise<void> {
    await this.renameStep('Rename else', 'Label for this else branch.', 'label', 'Else');
  }

  setMessageArrow(arrow: SequenceArrow): void {
    const step = this.menuStep();
    if (!step || step.kind !== 'message')
      return;
    this.stepChange.emit({ id: step.id, field: 'arrow', value: arrow });
    this.closeMenu();
  }

  deleteMessage(): void {
    this.deleteOpenStep(false);
  }

  deleteNote(): void {
    this.deleteOpenStep(false);
  }

  deleteElse(): void {
    this.deleteOpenStep(false);
  }

  deleteFrame(): void {
    this.deleteOpenStep(true);
  }

  laneCenter(id: string): number {
    const lane = this.lanes().find((item) => item.participant.id === id);
    return lane ? lane.x + lane.width / 2 : this.diagram().start;
  }

  messageLeft(row: SequenceMessageRow): number {
    if (row.self)
      return this.laneCenter(row.fromId);
    return Math.min(this.laneCenter(row.fromId), this.laneCenter(row.toId));
  }

  messageWidth(row: SequenceMessageRow): number {
    if (row.self)
      return 56;
    return Math.max(24, Math.abs(this.laneCenter(row.toId) - this.laneCenter(row.fromId)));
  }

  messageX(row: SequenceMessageRow, end: 'from' | 'to'): number {
    const center = end === 'from' ? this.laneCenter(row.fromId) : this.laneCenter(row.toId);
    return center - this.messageLeft(row);
  }

  shaftEnd(row: SequenceMessageRow, end: 'from' | 'to'): number {
    const x = this.messageX(row, end);
    const headHere = (end === 'to' && row.headAtTo) || (end === 'from' && !row.headAtTo);
    if (!headHere || row.self)
      return x;
    const other = this.messageX(row, end === 'to' ? 'from' : 'to');
    const dir = x >= other ? 1 : -1;
    return x - dir * 9;
  }

  arrowPoints(row: SequenceMessageRow): string {
    const end = row.headAtTo ? 'to' : 'from';
    const tip = this.messageX(row, end);
    const other = this.messageX(row, end === 'to' ? 'from' : 'to');
    const dir = tip >= other ? 1 : -1;
    const y = row.height - 8;
    const base = tip - dir * 8;
    return `${tip},${y} ${base},${y - 4} ${base},${y + 4}`;
  }

  selfPath(row: SequenceMessageRow): string {
    const y = row.height - 8;
    return `M 0 ${y - 14} H 46 V ${y} H 8`;
  }

  noteBox(row: SequenceNoteRow): { readonly left: number; readonly width: number } {
    const lanes = row.participantIds
      .map((id) => this.lanes().find((lane) => lane.participant.id === id))
      .filter((lane) => !!lane);
    if (lanes.length === 0)
      return { left: this.diagram().start, width: Math.max(160, row.textWidth + 24) };
    const min = Math.min(...lanes.map((lane) => lane.x + lane.width / 2));
    const max = Math.max(...lanes.map((lane) => lane.x + lane.width / 2));
    const width = Math.max(max - min + 96, row.textWidth + 48);
    return { left: (min + max) / 2 - width / 2, width };
  }

  activationLeft(bar: SequenceActivationBar): number {
    return this.laneCenter(bar.participantId) - 5 + bar.depth * 5;
  }

  dividerLeft(): number {
    const lanes = this.lanes();
    if (lanes.length === 0)
      return 8;
    return Math.min(...lanes.map((lane) => lane.x)) - 4;
  }

  dividerWidth(): number {
    const lanes = this.lanes();
    if (lanes.length === 0)
      return 240;
    const min = Math.min(...lanes.map((lane) => lane.x));
    const max = Math.max(...lanes.map((lane) => lane.x + lane.width));
    return max - min + 8;
  }

  lineStyleLabel(style: SequenceLineStyle | undefined): string {
    const id = style ?? 'dashed';
    return this.lineStylePresets.find((item) => item.id === id)?.label ?? 'Dashed';
  }

  private measureViewport(): void {
    const host = this.viewport()?.nativeElement;
    if (!host)
      return;
    const width = host.clientWidth;
    if (width > 0)
      this.viewportWidth.set(width);
  }

  private emitCamera(): void {
    this.cameraChange.emit({
      zoom: this.zoom(),
      x: Math.round(this.pan().x),
      y: Math.round(this.pan().y),
    });
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

  private emitAdd(role: 'actor' | 'participant'): void {
    const lanes = this.diagram().lanes;
    const last = lanes.at(-1);
    const x = last ? last.left + last.width + 22 : this.diagram().start;
    this.addParticipant.emit({ role, x, y: 48 });
    this.closeMenu();
  }

  private finishLaneDrag(drag: LaneDragState): void {
    const host = this.viewport().nativeElement;
    if (host.hasPointerCapture(drag.pointerId))
      host.releasePointerCapture(drag.pointerId);
    if (drag.moved && drag.hoverIndex !== drag.fromIndex)
      this.reorderParticipants.emit({ fromIndex: drag.fromIndex, toIndex: drag.hoverIndex });
    this.laneDrag.set(null);
    if (drag.moved)
      this.suppressClick = true;
  }

  private buildLanes(
    orderIds: readonly string[],
    participants: readonly SequenceParticipant[],
    slots: readonly SequenceLaneGeom[],
    drag: LaneDragState | null,
    height: number,
  ) {
    const byId = new Map(slots.map((slot) => [slot.id, slot]));
    return orderIds.flatMap((id, displayIndex) => {
      const participant = participants.find((item) => item.id === id);
      const own = byId.get(id);
      const slot = slots[displayIndex];
      if (!participant || !own || !slot)
        return [];
      const isActor = (participant.role ?? 'participant') === 'actor';
      const tint = isActor ? null : resolveTintHex(participant.color);
      const lineStyle = participant.lineStyle ?? 'dashed';
      const lineTint = resolveTintHex(participant.lineColor) ?? DEFAULT_LINE_COLOR;
      const isDragging = drag?.id === id;
      return [{
        participant,
        x: isDragging && drag ? drag.originX + drag.offsetX : slot.left,
        width: own.width,
        height,
        hideFoot: true,
        isActor,
        isDragging,
        tint,
        bg: isActor ? null : (tint ?? '#222222'),
        border: isActor ? 'transparent' : '#5f6368',
        fg: '#e8eaed',
        lineStyle,
        lineColor: hexToRgba(lineTint, lineStyle === 'bold' ? 0.95 : 0.75),
        lineWidth: lineStyle === 'bold' ? 2 : 1,
      }];
    });
  }

  private async finishMessageDrag(drag: MessageDragState): Promise<void> {
    this.messageDrag.set(null);
    this.suppressClick = drag.moved;
    const host = this.viewport().nativeElement;
    if (host.hasPointerCapture(drag.pointerId))
      host.releasePointerCapture(drag.pointerId);
    if (!drag.moved || !drag.toId || drag.toId === drag.fromId)
      return;
    const from = this.model().participants.find((item) => item.id === drag.fromId);
    const to = this.model().participants.find((item) => item.id === drag.toId);
    if (!from || !to)
      return;
    const next = await this.askText({
      title: 'Add message',
      body: `Arrow from ${from.name} to ${to.name}. The number is added automatically.`,
      inputLabel: 'Label',
      placeholder: 'POST /login',
      confirmLabel: 'Add',
    });
    if (next == null)
      return;
    this.addMessage.emit({
      fromId: drag.fromId,
      toId: drag.toId,
      label: next || 'message',
      beforeStepId: stepIdBeforeY(this.stepAnchors(), drag.y),
    });
  }

  private finishNoteDrag(drag: NoteDragState): void {
    this.noteDrag.set(null);
    this.suppressClick = drag.moved;
    const host = this.viewport().nativeElement;
    if (host.hasPointerCapture(drag.pointerId))
      host.releasePointerCapture(drag.pointerId);
  }

  private noteLanes(): NoteLane[] {
    return this.lanes().map((lane) => ({
      center: lane.x + lane.width / 2,
      alias: lane.participant.alias || lane.participant.name,
    }));
  }

  private nearestLaneIndex(lanes: readonly NoteLane[], x: number): number {
    let best = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    lanes.forEach((lane, index) => {
      const dist = Math.abs(lane.center - x);
      if (dist < bestDist) {
        best = index;
        bestDist = dist;
      }
    });
    return best;
  }

  private noteOver(lanes: readonly NoteLane[], from: number, to: number): string {
    if (lanes.length === 0)
      return '';
    const start = Math.max(0, Math.min(from, to));
    const end = Math.min(lanes.length - 1, Math.max(from, to));
    return lanes.slice(start, end + 1).map((lane) => lane.alias).filter((alias) => alias.length > 0).join(', ');
  }

  private messageAt(event: MouseEvent): SequenceMessageRow | null {
    const world = this.worldPoint(event);
    let best: SequenceMessageRow | null = null;
    let bestDist = 18;
    for (const row of this.diagram().messages) {
      const left = this.messageLeft(row);
      const right = left + this.messageWidth(row);
      if (world.x < left - 6 || world.x > right + 6)
        continue;
      const dist = Math.abs(world.y - row.arrowY);
      if (dist <= bestDist) {
        best = row;
        bestDist = dist;
      }
    }
    return best;
  }

  private finishOrderDrag(drag: OrderDragState): void {
    this.orderCommit = undefined;
    this.suppressClick = drag.moved;
    const host = this.viewport().nativeElement;
    if (host.hasPointerCapture(drag.pointerId))
      host.releasePointerCapture(drag.pointerId);
    if (!drag.moved) {
      this.orderDrag.set(null);
      return;
    }
    this.orderDrag.set({ ...drag, settling: true });
    const token = ++this.orderSettleToken;
    requestAnimationFrame(() => {
      if (this.orderSettleToken !== token)
        return;
      this.orderDrag.set(null);
    });
  }

  private finishFrameDrag(drag: FrameDragState): void {
    this.frameDrag.set(null);
    this.frameCommit = undefined;
    this.suppressClick = drag.moved;
    const host = this.viewport().nativeElement;
    if (host.hasPointerCapture(drag.pointerId))
      host.releasePointerCapture(drag.pointerId);
  }

  private elementUnderFrameBodies(clientX: number, clientY: number): Element | null {
    const bodies = this.viewport().nativeElement.querySelectorAll<HTMLElement>('.tx-seq-grid__frame-body');
    bodies.forEach((node) => {
      node.style.pointerEvents = 'none';
    });
    const under = document.elementFromPoint(clientX, clientY);
    bodies.forEach((node) => {
      node.style.pointerEvents = '';
    });
    return under;
  }

  private frameAnchors(frameId: string, mode: 'move' | 'start' | 'end'): FrameAnchor[] {
    const steps = this.model().steps;
    const hidden = new Set(frameChromeIds(steps, frameId));
    if (mode === 'move') {
      const start = steps.findIndex((step) => step.id === frameId);
      const endId = frameChromeIds(steps, frameId)[1];
      const end = endId ? steps.findIndex((step) => step.id === endId) : start;
      if (start >= 0 && end >= start) {
        for (let index = start; index <= end; index += 1) {
          const step = steps[index];
          if (step)
            hidden.add(step.id);
        }
      }
    }
    return this.stepAnchors().filter((anchor) => !hidden.has(anchor.id));
  }

  private rememberMenuPoint(event: MouseEvent): void {
    const world = this.worldPoint(event);
    this.menuWorldX = world.x;
    this.menuWorldY = this.messageY(world.y);
  }

  breaks(value: string): string {
    return sequenceBreaks(value);
  }

  headMin(isActor: boolean): number {
    const band = this.diagram().headBand;
    return isActor ? band : band - 45;
  }

  footMin(isActor: boolean, name: string): number | null {
    if (isActor)
      return null;
    const lines = Math.max(1, sequenceBreaks(name).split('\n').length);
    return 30 + (lines - 1) * 16;
  }

  private async askText(request: PromptDialogRequest): Promise<string | null> {
    const next = await this.prompt.ask({
      ...request,
      multiline: true,
      initialValue: sequenceBreaks(request.initialValue ?? ''),
    });
    if (next == null)
      return null;
    return sequenceBreaks(next);
  }

  private async promptBlock(
    kind: PlantumlGridAddBlock['kind'],
    title: string,
    body: string,
    inputLabel: string,
    initialValue: string,
    beforeStepId = stepIdBeforeY(this.stepAnchors(), this.menuWorldY),
  ): Promise<void> {
    const overId = kind === 'note' ? this.laneIdAt(this.menuWorldX) : null;
    this.closeMenu(true);
    const next = await this.askText({
      title,
      body,
      inputLabel,
      initialValue,
      confirmLabel: 'Add',
    });
    if (next == null)
      return;
    const label = kind === 'else' ? next : (next || initialValue || kind);
    this.addBlock.emit({ kind, label, overId, beforeStepId });
  }

  private worldPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.viewport().nativeElement.getBoundingClientRect();
    const zoom = this.zoom() || 1;
    const pan = this.pan();
    return {
      x: (event.clientX - rect.left - pan.x) / zoom,
      y: (event.clientY - rect.top - pan.y) / zoom,
    };
  }

  private messageY(worldY: number): number {
    const diagram = this.diagram();
    const top = diagram.laneTop + diagram.headBand + 8;
    const bottom = diagram.laneTop + Math.max(diagram.laneHeight, diagram.headBand + 40) - 16;
    return Math.min(Math.max(worldY, top), Math.max(bottom, top));
  }

  private laneIdAt(x: number): string | null {
    let bestId: string | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const lane of this.lanes()) {
      const center = lane.x + lane.width / 2;
      const distance = Math.abs(center - x);
      const reach = Math.max(48, lane.width / 2 + 24);
      if (distance <= reach && distance < best) {
        best = distance;
        bestId = lane.participant.id;
      }
    }
    return bestId;
  }

  private openStepMenu(kind: 'message' | 'note' | 'frame' | 'else', stepId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.pinSelection(stepId);
    this.menuPanel.set('root');
    this.menuState.set({ kind, stepId });
    this.openMenu(event);
  }

  private async renameStep(
    title: string,
    body: string,
    field: 'label' | 'text',
    inputLabel: string,
  ): Promise<void> {
    const step = this.menuStep();
    if (!step)
      return;
    const initialValue = stepField(step, field);
    this.closeMenu(true);
    const value = await this.askText({
      title,
      body,
      inputLabel,
      initialValue,
      confirmLabel: 'Rename',
    });
    if (value == null)
      return;
    if (field === 'label' && !value)
      return;
    this.stepChange.emit({ id: step.id, field, value });
  }

  private primeSelection(id: string, event: PointerEvent): void {
    if (event.shiftKey || event.ctrlKey || event.metaKey)
      return;
    if (this.selectedIds().includes(id)) {
      this.selectedId.set(id);
      return;
    }
    this.selectedIds.set([id]);
    this.selectedId.set(id);
  }

  private pinSelection(id: string): void {
    if (!this.selectedIds().includes(id))
      this.selectedIds.set([id]);
    this.selectedId.set(id);
  }

  private clearSelection(): void {
    this.selectedIds.set([]);
    this.selectedId.set(null);
  }

  private selectionOrder(): readonly string[] {
    return [
      ...this.model().participants.map((item) => item.id),
      ...this.model().steps
        .filter((step) => step.kind !== 'end' && step.kind !== 'activate' && step.kind !== 'deactivate')
        .map((step) => step.id),
    ];
  }

  private deleteSelection(): void {
    const ids = new Set(this.selectedIds());
    const primary = this.selectedId();
    if (primary)
      ids.add(primary);
    if (!ids.size)
      return;
    const steps = this.model().steps;
    const drop = new Set<string>();
    for (const step of steps) {
      if (!ids.has(step.id))
        continue;
      if (step.kind === 'alt' || step.kind === 'loop' || step.kind === 'group')
        frameChromeIds(steps, step.id).forEach((id) => drop.add(id));
      else if (step.kind !== 'activate' && step.kind !== 'deactivate')
        drop.add(step.id);
    }
    if (drop.size)
      this.removeSteps.emit([...drop]);
    for (const participant of this.model().participants) {
      if (ids.has(participant.id))
        this.removeParticipant.emit(participant.id);
    }
    this.clearSelection();
    this.closeMenu();
  }

  private nudgeParticipant(event: KeyboardEvent): void {
    const id = this.selectedId();
    if (!id)
      return;
    const participants = this.model().participants;
    const index = participants.findIndex((item) => item.id === id);
    if (index < 0)
      return;
    const to = event.key === 'ArrowLeft' ? index - 1 : index + 1;
    if (to < 0 || to >= participants.length)
      return;
    event.preventDefault();
    event.stopPropagation();
    this.reorderParticipants.emit({ fromIndex: index, toIndex: to });
  }

  private nudgeStep(event: KeyboardEvent): void {
    const id = this.selectedId();
    if (!id)
      return;
    const steps = this.model().steps;
    const index = steps.findIndex((step) => step.id === id);
    const step = steps[index];
    if (!step || step.kind === 'end' || step.kind === 'activate' || step.kind === 'deactivate')
      return;
    if (event.key === 'ArrowUp' && index <= 0)
      return;
    event.preventDefault();
    event.stopPropagation();
    const beforeStepId = event.key === 'ArrowUp'
      ? steps[index - 1]?.id ?? null
      : steps[index + 2]?.id ?? null;
    if (step.kind === 'alt' || step.kind === 'loop' || step.kind === 'group')
      this.frameEdit.emit({ id, mode: 'move', beforeStepId });
    else
      this.stepMove.emit({ id, beforeStepId });
  }

  private deleteOpenStep(frame: boolean): void {
    const step = this.menuStep();
    if (!step)
      return;
    const ids = frame ? frameChromeIds(this.model().steps, step.id) : [step.id];
    this.removeSteps.emit(ids);
    this.closeMenu();
  }

  private stepAnchors(): { y: number; id: string }[] {
    const diagram = this.diagram();
    return [
      ...diagram.messages.map((row) => ({ y: row.arrowY, id: row.id })),
      ...diagram.dividers.map((row) => ({ y: row.y, id: row.id })),
      ...diagram.notes.map((row) => ({ y: row.y, id: row.id })),
      ...diagram.frames.map((row) => ({ y: row.y, id: row.id })),
    ];
  }

  private openMenu(event: MouseEvent): void {
    const state = this.menuState();
    const panel = this.menuPanel();
    this.closeOverlay(true);
    this.menuState.set(state);
    this.menuPanel.set(panel);
    const position = this.overlay
      .position()
      .global()
      .left(`${event.clientX}px`)
      .top(`${event.clientY}px`);
    this.overlayRef = this.overlay.create({
      positionStrategy: position,
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      scrollStrategy: this.overlay.scrollStrategies.close(),
    });
    this.overlayRef.attach(new TemplatePortal(this.menuTemplate(), this.vcr));
    this.overlayRef.backdropClick().subscribe(() => this.closeMenu());
  }

  private closeMenu(immediate = false): void {
    this.closeOverlay(immediate, true);
  }

  private closeOverlay(immediate = false, clearState = false): void {
    const overlayRef = this.overlayRef;
    this.menuCloseToken += 1;
    const token = this.menuCloseToken;
    if (!overlayRef) {
      if (clearState) {
        this.menuState.set(null);
        this.menuPanel.set('root');
      }
      return;
    }
    const dispose = (): void => {
      if (token !== this.menuCloseToken)
        return;
      overlayRef.dispose();
      if (this.overlayRef === overlayRef) {
        this.overlayRef = null;
        if (clearState) {
          this.menuState.set(null);
          this.menuPanel.set('root');
        }
      }
    };
    if (immediate) {
      dispose();
      return;
    }
    const menu = overlayRef.overlayElement.querySelector('.tx-menu');
    playLeaveThen(menu instanceof HTMLElement ? menu : null, dispose);
  }
}

function stepField(step: SequenceStep, field: 'label' | 'text'): string {
  if (step.kind === 'note')
    return field === 'text' ? step.text : '';
  if (
    step.kind === 'message'
    || step.kind === 'divider'
    || step.kind === 'alt'
    || step.kind === 'else'
    || step.kind === 'loop'
    || step.kind === 'group'
  )
    return step.label;
  return '';
}

function resolveTintHex(raw: string | undefined): string | null {
  if (!raw?.trim())
    return null;
  const value = raw.trim().replace(/^#/, '');
  const named: Record<string, string> = {
    magenta: '#ff00ff',
    lightgreen: '#90ee90',
    white: '#e8eaed',
    red: '#ef5350',
    blue: '#42a5f5',
    cyan: '#26c6da',
    orange: '#ffa726',
  };
  const hex = named[value.toLowerCase()] ?? (/^[0-9a-fA-F]{3,8}$/.test(value) ? `#${value.slice(0, 6)}` : null);
  return hex;
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '');
  const full = raw.length === 3
    ? raw.split('').map((ch) => `${ch}${ch}`).join('')
    : raw.slice(0, 6);
  const value = Number.parseInt(full, 16);
  if (!Number.isFinite(value))
    return `rgba(232, 234, 237, ${alpha})`;
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
