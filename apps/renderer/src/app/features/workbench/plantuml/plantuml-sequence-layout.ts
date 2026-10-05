import { sequenceBreaks, type SequenceModel, type SequenceParticipant, type SequenceStep } from './plantuml-generator';

/** Participant box height in the dark PlantUML skin. */
export const SEQ_BOX = 30;
/** Space above the box where an actor stick figure sits. */
export const SEQ_HEAD_MARGIN = 45;
/** Head band from the top of the actor figure to the lifeline. */
export const SEQ_HEAD_BAND = SEQ_HEAD_MARGIN + SEQ_BOX;

/**
 * Step that should sit just under a drop on the canvas.
 * Returns null when the drop is below every existing row.
 */
export function stepIdBeforeY(
  anchors: readonly { readonly y: number; readonly id: string }[],
  worldY: number,
): string | null {
  let best: { y: number; id: string } | null = null;
  for (const anchor of anchors) {
    if (anchor.y < worldY - 10)
      continue;
    if (!best || anchor.y < best.y)
      best = anchor;
  }
  return best?.id ?? null;
}

/**
 * Opening step and the `end` that closes it.
 * Inner messages stay in the diagram.
 */
export function frameChromeIds(
  steps: readonly { readonly id: string; readonly kind: string }[],
  openId: string,
): string[] {
  const start = steps.findIndex((step) => step.id === openId);
  if (start < 0)
    return [openId];
  let depth = 0;
  for (let index = start; index < steps.length; index += 1) {
    const step = steps[index];
    if (step.kind === 'alt' || step.kind === 'loop' || step.kind === 'group')
      depth += 1;
    else if (step.kind === 'end') {
      depth -= 1;
      if (depth === 0)
        return [openId, step.id];
    }
  }
  return [openId];
}

interface FrameStep {
  readonly id: string;
  readonly kind: string;
}

/**
 * Move an alt, loop, or group, including everything inside it, to a new place.
 * `beforeStepId` null appends the block.
 */
export function moveFrameBlock<T extends FrameStep>(
  steps: readonly T[],
  openId: string,
  beforeStepId: string | null,
): readonly T[] {
  const span = frameSpan(steps, openId);
  if (!span)
    return steps;
  const block = steps.slice(span.start, span.end + 1);
  if (block.some((step) => step.id === beforeStepId))
    return steps;
  const rest = [...steps.slice(0, span.start), ...steps.slice(span.end + 1)];
  const index = indexOfStep(rest, beforeStepId);
  rest.splice(index, 0, ...block);
  return sameStepIds(steps, rest) ? steps : rest;
}

/**
 * Drag the top or bottom of a frame.
 * The bottom moves the matching end. The top moves the opening step.
 * Nested frames stay intact.
 */
export function resizeFrameEdge<T extends FrameStep>(
  steps: readonly T[],
  openId: string,
  edge: 'start' | 'end',
  beforeStepId: string | null,
): readonly T[] {
  const span = frameSpan(steps, openId);
  if (!span || span.end <= span.start)
    return steps;
  const open = steps[span.start];
  const end = steps[span.end];
  if (!open || !end)
    return steps;
  if (edge === 'end') {
    const without = [...steps.slice(0, span.end), ...steps.slice(span.end + 1)];
    const openIndex = without.findIndex((step) => step.id === openId);
    const index = nearestOpenIndex(without, openIndex, indexOfStep(without, beforeStepId));
    const next = [...without];
    next.splice(index, 0, end);
    return sameStepIds(steps, next) ? steps : next;
  }
  const without = [...steps.slice(0, span.start), ...steps.slice(span.start + 1)];
  const endIndex = without.findIndex((step) => step.id === end.id);
  const index = nearestClosedIndex(without, indexOfStep(without, beforeStepId), endIndex);
  const next = [...without];
  next.splice(index, 0, open);
  return sameStepIds(steps, next) ? steps : next;
}

/**
 * Move one step, such as an arrow or a section, to a new place in the sequence.
 * `beforeStepId` null appends it. The same array is returned when the order does not change.
 */
export function moveSequenceStep<T extends { readonly id: string }>(
  steps: readonly T[],
  id: string,
  beforeStepId: string | null,
): readonly T[] {
  const from = steps.findIndex((step) => step.id === id);
  const moving = steps[from];
  if (!moving)
    return steps;
  const rest = [...steps.slice(0, from), ...steps.slice(from + 1)];
  const index = beforeStepId ? rest.findIndex((step) => step.id === beforeStepId) : -1;
  rest.splice(index < 0 ? rest.length : index, 0, moving);
  const unchanged = rest.length === steps.length && rest.every((step, at) => step.id === steps[at]?.id);
  return unchanged ? steps : rest;
}

function frameSpan(steps: readonly FrameStep[], openId: string): { start: number; end: number } | null {
  const start = steps.findIndex((step) => step.id === openId);
  if (start < 0)
    return null;
  const endId = frameChromeIds(steps, openId)[1];
  if (!endId)
    return null;
  const end = steps.findIndex((step) => step.id === endId);
  if (end < start)
    return null;
  return { start, end };
}

function indexOfStep(steps: readonly FrameStep[], id: string | null): number {
  if (!id)
    return steps.length;
  const index = steps.findIndex((step) => step.id === id);
  return index < 0 ? steps.length : index;
}

function sameStepIds(left: readonly FrameStep[], right: readonly FrameStep[]): boolean {
  return left.length === right.length && left.every((step, index) => step.id === right[index]?.id);
}

function closest(indexes: readonly number[], want: number, fallback: number): number {
  if (indexes.length === 0)
    return fallback;
  let best = indexes[0] ?? fallback;
  let bestDistance = Math.abs(best - want);
  for (const index of indexes) {
    const distance = Math.abs(index - want);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
}

function nearestOpenIndex(steps: readonly FrameStep[], openIndex: number, want: number): number {
  const valid: number[] = [];
  let depth = 1;
  for (let index = openIndex + 1; index <= steps.length; index += 1) {
    if (depth === 1)
      valid.push(index);
    if (index === steps.length)
      break;
    const kind = steps[index]?.kind;
    if (kind === 'alt' || kind === 'loop' || kind === 'group')
      depth += 1;
    else if (kind === 'end')
      depth = Math.max(0, depth - 1);
  }
  return closest(valid, want, openIndex + 1);
}

function nearestClosedIndex(steps: readonly FrameStep[], want: number, endIndex: number): number {
  const valid: number[] = [];
  let depth = 0;
  const limit = Math.min(Math.max(endIndex, 0), steps.length);
  for (let index = 0; index <= limit; index += 1) {
    if (depth === 0)
      valid.push(index);
    if (index >= steps.length)
      break;
    const kind = steps[index]?.kind;
    if (kind === 'alt' || kind === 'loop' || kind === 'group')
      depth += 1;
    else if (kind === 'end')
      depth = Math.max(0, depth - 1);
  }
  return closest(valid, Math.min(want, limit), 0);
}

export const SEQ_FOOT = 30;

const MESSAGE_PITCH = 29;
const EXTRA_LINE = 15;
const DIVIDER_AFTER_ARROW = 28.5;
const DIVIDER_FROM_HEAD = 28.5;
const AFTER_DIVIDER = 14.5;
const NOTE_AFTER = 13;
const NOTE_TAIL = 0;
const BLOCK_AFTER = 12;
const BLOCK_BODY = 19;
const ELSE_AFTER = 22;
const ELSE_BODY = 9;
const FRAME_TAIL = 8;
const FRAME_PAD = 16;
const PARENT_PAD = 19;
const BOX_GAP = 10;
const LEFT_MARGIN = 8;
const LABEL_RIGHT = 22;
const NUMBER_GAP = 4;
const NUMBER_INSET = 7;
const SELF_GAP = 46;

export interface SequenceDiagramLayout {
  readonly start: number;
  readonly width: number;
  readonly laneTop: number;
  /** Distance from the lane top to the lifeline, including extra name lines. */
  readonly headBand: number;
  readonly laneHeight: number;
  readonly height: number;
  readonly lanes: readonly SequenceLaneGeom[];
  readonly messages: readonly SequenceMessageRow[];
  readonly notes: readonly SequenceNoteRow[];
  readonly dividers: readonly SequenceDividerRow[];
  readonly frames: readonly SequenceFrameRow[];
  readonly activations: readonly SequenceActivationBar[];
}

export interface SequenceLaneGeom {
  readonly id: string;
  readonly left: number;
  readonly width: number;
  readonly center: number;
}

export interface SequenceMessageRow {
  readonly id: string;
  readonly y: number;
  readonly height: number;
  readonly arrowY: number;
  readonly fromId: string;
  readonly toId: string;
  readonly label: string;
  readonly arrow: string;
  readonly dashed: boolean;
  readonly openHead: boolean;
  readonly headAtTo: boolean;
  readonly self: boolean;
  readonly numberLabel: string | null;
}

export interface SequenceNoteRow {
  readonly id: string;
  readonly y: number;
  readonly height: number;
  readonly participantIds: readonly string[];
  readonly text: string;
  readonly textWidth: number;
}

export interface SequenceDividerRow {
  readonly id: string;
  readonly y: number;
  readonly height: number;
  readonly label: string;
}

export interface SequenceFrameRow {
  readonly id: string;
  readonly kind: 'alt' | 'loop' | 'group';
  readonly label: string;
  readonly tabLabel: string;
  readonly y: number;
  readonly height: number;
  readonly depth: number;
  readonly participantIds: readonly string[];
  readonly kindWidth: number;
  readonly headerWidth: number;
  readonly elseMarks: readonly { readonly id: string; readonly y: number; readonly label: string }[];
}

export interface SequenceActivationBar {
  readonly id: string;
  readonly participantId: string;
  readonly y: number;
  readonly height: number;
  readonly depth: number;
  readonly activateId: string;
  readonly deactivateId: string | null;
}

export interface SequenceFrameBox {
  readonly id: string;
  readonly left: number;
  readonly width: number;
  readonly y: number;
  readonly height: number;
}

interface OpenFrame {
  readonly id: string;
  readonly kind: 'alt' | 'loop' | 'group';
  readonly label: string;
  readonly tabLabel: string;
  readonly depth: number;
  readonly y: number;
  readonly kindWidth: number;
  readonly headerWidth: number;
  readonly ids: Set<string>;
  elseMarks: { id: string; y: number; label: string }[];
}

interface OpenActivation {
  readonly stepId: string;
  readonly participantId: string;
  readonly y: number;
  readonly depth: number;
}

interface LaneDraft {
  readonly id: string;
  readonly width: number;
  center: number;
}

/**
 * Place sequence steps using the spacing of the dark PlantUML sequence skin.
 * Lane gaps grow with message labels. `activate` / `deactivate` do not consume a row.
 */
export function layoutSequence(model: SequenceModel, viewportWidth: number): SequenceDiagramLayout {
  const drafts = placeLanes(model);
  const title = sequenceBreaks(model.title);
  const titleLines = Math.max(1, title ? title.split('\n').length : 1);
  const laneTop = title ? 42 + (titleLines - 1) * 16 : 6;
  const nameLines = model.participants.reduce((max, participant) => {
    return Math.max(max, sequenceLines(participant.name).length || 1);
  }, 1);
  const headExtra = (nameLines - 1) * 16;
  const headBand = SEQ_HEAD_BAND + headExtra;
  const lifelineY = laneTop + headBand;
  const byAlias = indexParticipants(model.participants);

  const messages: SequenceMessageRow[] = [];
  const notes: SequenceNoteRow[] = [];
  const dividers: SequenceDividerRow[] = [];
  const frames: SequenceFrameRow[] = [];
  const activations: SequenceActivationBar[] = [];
  const stack: OpenFrame[] = [];
  const live = new Map<string, OpenActivation[]>();
  let last = lifelineY;
  let seen = false;
  let messageNumber = 0;

  for (const step of model.steps)
    consume(step);

  const contentBottom = last + FRAME_TAIL;
  for (const open of live.values()) {
    while (open.length > 0) {
      const bar = open.pop();
      if (bar)
        activations.push(barFrom(bar, contentBottom, null));
    }
  }
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame)
      frames.push(closeFrame(frame, contentBottom));
  }

  const footTop = model.hideFootbox ? contentBottom + 8 : contentBottom + 36;
  const footExtra = model.hideFootbox ? 0 : headExtra;
  const laneHeight = (footTop + (model.hideFootbox ? 0 : SEQ_FOOT + footExtra)) - laneTop;
  const shift = centerShift(drafts, viewportWidth);
  const lanes = drafts.map((lane) => ({
    id: lane.id,
    width: lane.width,
    center: lane.center + shift,
    left: lane.center + shift - lane.width / 2,
  }));
  const leftEdge = lanes.reduce((min, lane) => Math.min(min, lane.left), Number.POSITIVE_INFINITY);
  const rightEdge = lanes.reduce((max, lane) => Math.max(max, lane.left + lane.width), 0);
  const start = Number.isFinite(leftEdge) ? leftEdge : LEFT_MARGIN;

  return {
    start,
    width: Math.max(0, rightEdge - start),
    laneTop,
    headBand,
    laneHeight,
    height: laneTop + laneHeight + (model.participants.some((item) => item.role === 'actor') ? 48 : 16),
    lanes,
    messages,
    notes,
    dividers,
    frames,
    activations,
  };

  function consume(step: SequenceStep): void {
    if (step.kind === 'activate' || step.kind === 'deactivate') {
      const participantId = resolveId(byAlias, step.target);
      if (!participantId)
        return;
      const open = live.get(participantId) ?? [];
      if (step.kind === 'activate') {
        open.push({ stepId: step.id, participantId, y: last, depth: open.length });
        live.set(participantId, open);
        return;
      }
      const bar = open.pop();
      live.set(participantId, open);
      if (bar)
        activations.push(barFrom(bar, last, step.id));
      return;
    }
    if (step.kind === 'end') {
      const frame = stack.pop();
      if (frame)
        frames.push(closeFrame(frame, last + FRAME_TAIL));
      last += 14;
      return;
    }
    if (step.kind === 'else') {
      const label = sequenceBreaks(step.label);
      const lineCount = Math.max(1, sequenceLines(label).length || 1);
      const rise = Math.ceil(((lineCount - 1) * 16) / 2);
      const lineY = last + (seen ? ELSE_AFTER : Math.max(8, ELSE_AFTER - 14)) + rise;
      const alt = [...stack].reverse().find((frame) => frame.kind === 'alt');
      if (alt)
        alt.elseMarks.push({ id: step.id, y: lineY, label });
      last = lineY + ELSE_BODY + (lineCount - 1) * EXTRA_LINE;
      seen = true;
      return;
    }
    if (step.kind === 'alt' || step.kind === 'loop' || step.kind === 'group') {
      const top = last + (seen ? BLOCK_AFTER : Math.max(8, BLOCK_AFTER - 14));
      const label = sequenceBreaks(step.label);
      const tabLabel = step.kind === 'group' || !label ? label : `[${label}]`;
      const lineCount = Math.max(1, sequenceLines(label).length || 1);
      const header = headerMetrics(step.kind, tabLabel);
      stack.push({
        id: step.id,
        kind: step.kind,
        label,
        tabLabel,
        depth: stack.length,
        y: top,
        kindWidth: header.kindWidth,
        headerWidth: header.headerWidth,
        ids: new Set<string>(),
        elseMarks: [],
      });
      last = top + BLOCK_BODY + (lineCount - 1) * EXTRA_LINE;
      seen = true;
      return;
    }
    if (step.kind === 'divider') {
      const rule = last + (seen ? DIVIDER_AFTER_ARROW : DIVIDER_FROM_HEAD);
      const label = sequenceBreaks(step.label) || 'Section';
      const lineCount = Math.max(1, sequenceLines(label).length);
      const height = 23 + (lineCount - 1) * EXTRA_LINE;
      dividers.push({
        id: step.id,
        y: rule - height / 2,
        height,
        label,
      });
      last = rule + AFTER_DIVIDER + (lineCount - 1) * EXTRA_LINE;
      seen = true;
      return;
    }
    if (step.kind === 'note') {
      const lines = sequenceLines(step.text);
      const drawn = lines.filter((line) => line.length > 0);
      const textWidth = Math.max(40, ...(drawn.length > 0 ? drawn : ['']).map((line) => measureSequenceText(line, 13, false)));
      const height = 32 + Math.max(0, lines.length - 1) * EXTRA_LINE;
      const top = last + (seen ? NOTE_AFTER : Math.max(8, NOTE_AFTER - 6));
      const participantIds = step.over
        .split(',')
        .map((part) => resolveId(byAlias, part))
        .filter((id): id is string => !!id);
      notes.push({ id: step.id, y: top, height, participantIds, text: lines.join('\n'), textWidth });
      remember(participantIds);
      last = top + height + NOTE_TAIL;
      seen = true;
      return;
    }
    if (step.kind !== 'message')
      return;
    const lines = sequenceLines(step.label);
    const lineCount = Math.max(1, lines.length);
    const fromId = resolveId(byAlias, step.from) ?? '';
    const toId = resolveId(byAlias, step.to) ?? '';
    const self = fromId !== '' && fromId === toId;
    const arrowY = last + MESSAGE_PITCH + (lineCount - 1) * EXTRA_LINE;
    const height = self ? 18 + (lineCount - 1) * EXTRA_LINE : 16;
    messageNumber += model.autonumber ? 1 : 0;
    messages.push({
      id: step.id,
      y: arrowY - (height - 8),
      height,
      arrowY,
      fromId,
      toId,
      label: lines.join('\n'),
      arrow: step.arrow,
      dashed: step.arrow.includes('--'),
      openHead: step.arrow.endsWith('>>'),
      headAtTo: !step.arrow.startsWith('<'),
      self,
      numberLabel: model.autonumber ? `[${String(messageNumber).padStart(2, '0')}]` : null,
    });
    remember([fromId, toId].filter((id) => id.length > 0));
    last = arrowY;
    seen = true;
  }

  function remember(ids: readonly string[]): void {
    for (const frame of stack) {
      for (const id of ids)
        frame.ids.add(id);
    }
  }
}

/**
 * Size each frame to the lifelines it covers, then expand parents around children.
 */
export function placeFrameBoxes(
  frames: readonly SequenceFrameRow[],
  lanes: readonly Pick<SequenceLaneGeom, 'id' | 'center'>[],
): SequenceFrameBox[] {
  const centerOf = new Map(lanes.map((lane) => [lane.id, lane.center]));
  const boxes = new Map<string, { left: number; right: number }>();
  for (const frame of frames) {
    const centers = frame.participantIds
      .map((id) => centerOf.get(id))
      .filter((center): center is number => center != null);
    const fallback = lanes.map((lane) => lane.center);
    const used = centers.length > 0 ? centers : fallback;
    const min = used.length > 0 ? Math.min(...used) : LEFT_MARGIN;
    const max = used.length > 0 ? Math.max(...used) : min + 120;
    const left = min - FRAME_PAD;
    const right = Math.max(max + FRAME_PAD, left + frame.headerWidth + 28);
    boxes.set(frame.id, { left, right });
  }
  const byDepth = [...frames].sort((a, b) => b.depth - a.depth);
  for (const frame of byDepth) {
    const box = boxes.get(frame.id);
    if (!box)
      continue;
    const parent = frames.find((item) =>
      item.depth === frame.depth - 1
      && item.y <= frame.y
      && item.y + item.height >= frame.y + frame.height - 1,
    );
    const parentBox = parent ? boxes.get(parent.id) : undefined;
    if (!parentBox)
      continue;
    parentBox.left = Math.min(parentBox.left, box.left - PARENT_PAD);
    parentBox.right = Math.max(parentBox.right, box.right + PARENT_PAD);
  }
  return frames.map((frame) => {
    const box = boxes.get(frame.id) ?? { left: LEFT_MARGIN, right: LEFT_MARGIN + 120 };
    return {
      id: frame.id,
      left: box.left,
      width: Math.max(48, box.right - box.left),
      y: frame.y,
      height: frame.height,
    };
  });
}

/** Width of a label in the PlantUML sequence font (sans-serif). */
export function measureSequenceText(text: string, size: number, bold: boolean): number {
  const key = `${size}|${bold ? 1 : 0}|${text}`;
  const cached = textWidthCache.get(key);
  if (cached != null)
    return cached;
  const width = measureWithCanvas(text, size, bold) ?? fallbackWidth(text, size, bold);
  textWidthCache.set(key, width);
  return width;
}

const textWidthCache = new Map<string, number>();
let canvas: CanvasRenderingContext2D | null | undefined;

function measureWithCanvas(text: string, size: number, bold: boolean): number | null {
  if (canvas === undefined) {
    canvas = null;
    const host = globalThis.document;
    if (host && typeof host.createElement === 'function') {
      const node = host.createElement('canvas');
      canvas = node.getContext('2d');
    }
  }
  if (!canvas)
    return null;
  canvas.font = `${bold ? 'bold ' : ''}${size}px sans-serif`;
  return canvas.measureText(text).width;
}

function fallbackWidth(text: string, size: number, bold: boolean): number {
  const weight = bold ? 0.62 : 0.56;
  return Math.max(8, text.length * size * weight);
}

function placeLanes(model: SequenceModel): LaneDraft[] {
  const participants = model.participants;
  const drafts: LaneDraft[] = participants.map((participant) => {
    const width = participantWidth(participant);
    return { id: participant.id, width, center: 0 };
  });
  if (drafts.length === 0)
    return drafts;
  const half = (index: number) => drafts[index].width / 2;
  const pos = drafts.map(() => 0);
  pos[0] = LEFT_MARGIN + half(0);
  const indexOf = new Map(participants.map((participant, index) => [participant.id, index]));
  const alias = indexParticipants(participants);
  const numberWidth = model.autonumber ? measureSequenceText('[00]', 13, true) : 0;
  const leftPad = model.autonumber ? NUMBER_INSET + numberWidth + NUMBER_GAP : 8;
  const edges: { from: number; to: number; dist: number }[] = [];
  const link = (fromIndex: number, toIndex: number, distance: number) => {
    if (fromIndex < 0 || toIndex < 0 || toIndex >= pos.length || fromIndex === toIndex || distance <= 0)
      return;
    const from = Math.min(fromIndex, toIndex);
    const to = Math.max(fromIndex, toIndex);
    edges.push({ from, to, dist: distance });
  };
  for (let index = 0; index < pos.length - 1; index += 1)
    link(index, index + 1, half(index) + half(index + 1) + BOX_GAP);

  for (const step of model.steps) {
    if (step.kind === 'message') {
      const fromIndex = indexOf.get(resolveId(alias, step.from) ?? '') ?? -1;
      const toIndex = indexOf.get(resolveId(alias, step.to) ?? '') ?? -1;
      const labelWidth = maxLineWidth(step.label, 13, false);
      if (fromIndex >= 0 && fromIndex === toIndex)
        link(fromIndex, fromIndex + 1, labelWidth + SELF_GAP);
      else
        link(fromIndex, toIndex, leftPad + labelWidth + LABEL_RIGHT);
      continue;
    }
    if (step.kind === 'note' && step.over.split(',').length <= 1) {
      const index = indexOf.get(resolveId(alias, step.over) ?? '') ?? -1;
      if (index < 0)
        continue;
      link(index, index + 1, maxLineWidth(step.text, 13, false) / 2 + 28);
    }
  }

  for (let index = 0; index < pos.length; index += 1) {
    for (const edge of edges) {
      if (edge.from === index)
        pos[edge.to] = Math.max(pos[edge.to], pos[index] + edge.dist);
    }
  }

  return drafts.map((lane, index) => ({ ...lane, center: pos[index] }));
}

function centerShift(lanes: readonly LaneDraft[], viewportWidth: number): number {
  if (lanes.length === 0)
    return 0;
  const minLeft = Math.min(...lanes.map((lane) => lane.center - lane.width / 2));
  const maxRight = Math.max(...lanes.map((lane) => lane.center + lane.width / 2));
  const margin = Math.max(LEFT_MARGIN, (viewportWidth - (maxRight - minLeft)) / 2);
  return margin - minLeft;
}

function participantWidth(participant: SequenceParticipant): number {
  const text = maxLineWidth(participant.name, 14, false);
  if ((participant.role ?? 'participant') === 'actor')
    return Math.max(48, text + 16);
  // Border-box: 7px padding and 1px border on each side, plus a little slack so the label is not clipped.
  return text + 22;
}

function headerMetrics(kind: string, tabLabel: string): { kindWidth: number; headerWidth: number } {
  const kindWidth = measureSequenceText(kind, 13, true) + 12;
  const labelWidth = tabLabel.trim() ? maxLineWidth(tabLabel, 13, false) + 8 : 0;
  return { kindWidth, headerWidth: kindWidth + 10 + labelWidth + 8 };
}

function sequenceLines(value: string): string[] {
  const text = sequenceBreaks(value);
  if (!text)
    return [];
  return text.split('\n').map((line) => line.trim());
}

function maxLineWidth(text: string, size: number, bold: boolean): number {
  const lines = sequenceLines(text).filter((line) => line.length > 0);
  if (lines.length === 0)
    return 0;
  return Math.max(...lines.map((line) => measureSequenceText(line, size, bold)));
}

function barFrom(bar: OpenActivation, endY: number, deactivateId: string | null): SequenceActivationBar {
  return {
    id: bar.stepId,
    participantId: bar.participantId,
    y: bar.y,
    height: Math.max(8, endY - bar.y),
    depth: bar.depth,
    activateId: bar.stepId,
    deactivateId,
  };
}

function closeFrame(frame: OpenFrame, endY: number): SequenceFrameRow {
  return {
    id: frame.id,
    kind: frame.kind,
    label: frame.label,
    tabLabel: frame.tabLabel,
    y: frame.y,
    height: Math.max(BLOCK_BODY, endY - frame.y),
    depth: frame.depth,
    participantIds: [...frame.ids],
    kindWidth: frame.kindWidth,
    headerWidth: frame.headerWidth,
    elseMarks: frame.elseMarks,
  };
}

function indexParticipants(participants: readonly SequenceParticipant[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const participant of participants) {
    map.set(participant.alias.toLowerCase(), participant.id);
    map.set(participant.name.toLowerCase(), participant.id);
  }
  return map;
}

function resolveId(index: Map<string, string>, raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (!key)
    return null;
  return index.get(key) ?? null;
}
