import type { TxTreeModel } from './tx-tree.model';
import type {
  TxTreeDnDDebugInfo,
  TxTreeDnDDebugNodeRef,
  TxTreeDnDState,
  TxTreeDropPosition,
} from './tx-tree.types';

/**
 * Builds a design-system-friendly drag trace from live DnD state.
 *
 * @param model - Tree model for policy checks and node labels.
 * @param state - Current DnD controller state.
 * @param pointer - Latest pointer client coordinates, if known.
 */
export function buildTxTreeDnDDebugInfo<TMeta>(
  model: TxTreeModel<TMeta>,
  state: TxTreeDnDState,
  pointer: { readonly x: number; readonly y: number } | null,
): TxTreeDnDDebugInfo {
  const draggingId = state.draggingId;
  const phase = draggingId ? 'dragging' : 'idle';
  const source = draggingId ? model.getNodeDebugRef(draggingId) : null;
  const target = state.dropTargetId ? model.getNodeDebugRef(state.dropTargetId) : null;
  const denied =
    !!state.denyTargetId &&
    !!state.dropTargetId &&
    state.denyTargetId === state.dropTargetId;
  const dropAllowed =
    !!draggingId &&
    !!state.dropTargetId &&
    !!state.dropPosition &&
    !denied &&
    model.canDrop(draggingId, state.dropTargetId, state.dropPosition);

  return {
    phase,
    pointer,
    source,
    target,
    dropPosition: state.dropPosition,
    dropAllowed,
    denied,
    denyTargetId: state.denyTargetId,
    summary: formatDnDDebugSummary(source, target, state.dropPosition, dropAllowed, denied, phase),
    raw: state,
  };
}

function formatDnDDebugSummary(
  source: TxTreeDnDDebugNodeRef | null,
  target: TxTreeDnDDebugNodeRef | null,
  position: TxTreeDropPosition | null,
  dropAllowed: boolean,
  denied: boolean,
  phase: TxTreeDnDDebugInfo['phase'],
): string {
  if (phase === 'idle') {
    return 'Idle';
  }

  if (!source) {
    return 'Dragging…';
  }

  if (!target) {
    return `Dragging “${source.label}” — no drop target`;
  }

  if (!position) {
    return denied
      ? `Dragging “${source.label}” → “${target.label}” (denied)`
      : `Dragging “${source.label}” over “${target.label}”`;
  }

  const relation = describeDropRelation(position);
  const verdict = denied ? 'denied' : dropAllowed ? 'allowed' : 'blocked';

  return `Move “${source.label}” ${relation} “${target.label}” (${verdict})`;
}

function describeDropRelation(position: TxTreeDropPosition): string {
  switch (position) {
    case 'before':
      return 'before';
    case 'after':
      return 'after';
    case 'inside':
      return 'into';
    default:
      return 'near';
  }
}
