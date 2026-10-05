import { nextPlantumlId, type ActivityStep } from './plantuml-generator';

const PITCH = 88;

/** Top of the first activity step. */
export const ACTIVITY_ORIGIN = 64;

/** Index of the step a vertical drop should land before. */
export function activityIndexAt(worldY: number, count: number): number {
  const index = Math.round((worldY - ACTIVITY_ORIGIN) / PITCH);
  return Math.max(0, Math.min(count, index));
}

/**
 * Index into the list after `from` is removed.
 * `slot` is an index in the full list. `length` means after the last step.
 * A pointer past the dragged step shifts back by one so the gap under the pointer is the landing spot.
 */
export function activityRestIndex(length: number, from: number, slot: number): number {
  const restLength = Math.max(0, length - (from < 0 ? 0 : 1));
  const shifted = from >= 0 && slot > from ? slot - 1 : slot;
  return Math.max(0, Math.min(restLength, shifted));
}

/**
 * Insert an action, or an if/fork with its closer.
 * The closer lands just before the enclosing endif or end fork, otherwise
 * just before the next stop. An empty insert keeps the pair adjacent.
 */
export function insertActivitySteps(
  steps: readonly ActivityStep[],
  index: number,
  kind: ActivityStep['kind'],
): ActivityStep[] {
  const at = Math.max(0, Math.min(steps.length, index));
  if (kind !== 'if' && kind !== 'fork')
    return [...steps.slice(0, at), ...pairFor(kind), ...steps.slice(at)];
  const opener = kind;
  const closer = kind === 'if' ? 'endif' : 'endfork';
  const [openStep, closeStep] = pairFor(kind);
  if (!openStep || !closeStep)
    return [...steps];
  const endAt = closerIndex(steps, at, opener, closer);
  if (endAt <= at)
    return [...steps.slice(0, at), openStep, closeStep, ...steps.slice(at)];
  return [
    ...steps.slice(0, at),
    openStep,
    ...steps.slice(at, endAt),
    closeStep,
    ...steps.slice(endAt),
  ];
}

/** Delete a step. Deleting an if or fork also removes its matching closer. */
export function deleteActivityStep(steps: readonly ActivityStep[], id: string): ActivityStep[] {
  const index = steps.findIndex((step) => step.id === id);
  if (index < 0)
    return [...steps];
  const kind = steps[index]?.kind;
  const closer = kind === 'if' ? 'endif' : kind === 'fork' ? 'endfork' : null;
  if (!closer)
    return steps.filter((step) => step.id !== id);
  const end = matchingCloser(steps, index, kind, closer);
  const drop = new Set<string>([id]);
  if (end >= 0)
    drop.add(steps[end]?.id ?? '');
  return steps.filter((step) => !drop.has(step.id));
}

/** Move a step so it sits before `beforeId`. Null appends. Returns the same list when the order does not change. */
export function moveActivityStep(
  steps: readonly ActivityStep[],
  id: string,
  beforeId: string | null,
): readonly ActivityStep[] {
  const from = steps.findIndex((step) => step.id === id);
  if (from < 0)
    return steps;
  const moving = steps[from];
  if (!moving)
    return steps;
  const rest = steps.filter((step) => step.id !== id);
  const to = beforeId ? rest.findIndex((step) => step.id === beforeId) : rest.length;
  const at = to < 0 ? rest.length : to;
  if (at === from)
    return steps;
  return [...rest.slice(0, at), moving, ...rest.slice(at)];
}

export const ACTIVITY_PITCH = PITCH;

function pairFor(kind: ActivityStep['kind']): ActivityStep[] {
  if (kind === 'if') {
    return [
      { id: nextPlantumlId('a'), label: 'Condition?', kind: 'if' },
      { id: nextPlantumlId('a'), label: '', kind: 'endif' },
    ];
  }
  if (kind === 'fork') {
    return [
      { id: nextPlantumlId('a'), label: '', kind: 'fork' },
      { id: nextPlantumlId('a'), label: '', kind: 'endfork' },
    ];
  }
  const label = kind === 'action' ? 'Step' : '';
  return [{ id: nextPlantumlId('a'), label, kind }];
}

function closerIndex(
  steps: readonly ActivityStep[],
  at: number,
  opener: ActivityStep['kind'],
  closer: ActivityStep['kind'],
): number {
  let depth = 0;
  for (let index = 0; index < at; index += 1) {
    const kind = steps[index]?.kind;
    if (kind === opener)
      depth += 1;
    else if (kind === closer)
      depth = Math.max(0, depth - 1);
  }
  if (depth > 0) {
    let nested = depth;
    for (let index = at; index < steps.length; index += 1) {
      const kind = steps[index]?.kind;
      if (kind === opener)
        nested += 1;
      else if (kind === closer) {
        nested -= 1;
        if (nested < depth)
          return index;
      }
    }
    return steps.length;
  }
  for (let index = at; index < steps.length; index += 1) {
    if (steps[index]?.kind === 'stop')
      return index;
  }
  return steps.length;
}

function matchingCloser(
  steps: readonly ActivityStep[],
  openerIndex: number,
  opener: ActivityStep['kind'],
  closer: ActivityStep['kind'],
): number {
  let depth = 0;
  for (let index = openerIndex + 1; index < steps.length; index += 1) {
    const kind = steps[index]?.kind;
    if (kind === opener)
      depth += 1;
    else if (kind === closer) {
      if (depth === 0)
        return index;
      depth -= 1;
    }
  }
  return -1;
}
