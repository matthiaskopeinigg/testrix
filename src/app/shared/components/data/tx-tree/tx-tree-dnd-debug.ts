import type { TxTreeModel } from './tx-tree.model';
import type {
  TxTreeDnDDebugInfo,
  TxTreeDnDDebugNodeRef,
  TxTreeDnDState,
  TxTreeDropIntent,
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
  const parentId = state.intent?.parentId ?? null;
  const parent = parentId ? model.getNodeDebugRef(parentId) : null;
  const denied = !!state.denyTargetId;
  const dropAllowed =
    !!draggingId && !!state.intent && model.canDropIntent(draggingId, state.intent);

  return {
    phase,
    pointer,
    source,
    parent,
    intent: state.intent,
    dropAllowed,
    denied,
    denyTargetId: state.denyTargetId,
    summary: formatDnDDebugSummary(source, parent, state.intent, dropAllowed, denied, phase),
    raw: state,
  };
}

/** Compact one-line form of an intent, e.g. `reorder → Folder[2] @depth 1`. */
export function formatTxTreeDropIntent(
  intent: TxTreeDropIntent | null,
  parentLabel: string | null,
): string {
  if (!intent) {
    return '—';
  }

  const parent = parentLabel ?? 'root';
  if (intent.kind === 'inside') {
    return `inside → ${parent}`;
  }

  return `reorder → ${parent}[${intent.index}] @depth ${intent.depth}`;
}

function formatDnDDebugSummary(
  source: TxTreeDnDDebugNodeRef | null,
  parent: TxTreeDnDDebugNodeRef | null,
  intent: TxTreeDropIntent | null,
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

  if (!intent) {
    return denied
      ? `Dragging “${source.label}” — no legal drop here`
      : `Dragging “${source.label}” — no drop target`;
  }

  const destination = parent ? `“${parent.label}”` : 'the tree root';
  const verdict = dropAllowed ? 'allowed' : 'blocked';

  if (intent.kind === 'inside') {
    return `Move “${source.label}” into ${destination} (${verdict})`;
  }

  return `Move “${source.label}” to ${destination} index ${intent.index} (${verdict})`;
}
