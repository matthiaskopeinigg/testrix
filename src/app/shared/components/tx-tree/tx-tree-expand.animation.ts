/** Max stagger index (matches entrance-stagger cap in `_animations.scss`). */
const TX_TREE_EXPAND_REVEAL_MAX_STAGGER_INDEX = 23;

/**
 * Maps newly visible row ids to stagger indices after a folder expands.
 */
export function buildExpandRevealIndices(
  previousVisibleIds: ReadonlySet<string>,
  visibleRowIds: readonly string[],
): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  let revealIndex = 0;

  for (const id of visibleRowIds) {
    if (previousVisibleIds.has(id)) {
      continue;
    }
    map.set(id, Math.min(revealIndex, TX_TREE_EXPAND_REVEAL_MAX_STAGGER_INDEX));
    revealIndex += 1;
  }

  return map;
}

/**
 * Estimates when expand-reveal animations finish (ms).
 */
export function estimateExpandRevealSettleMs(revealCount: number): number {
  const capped = Math.min(Math.max(0, revealCount - 1), TX_TREE_EXPAND_REVEAL_MAX_STAGGER_INDEX);
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  const styles = root ? getComputedStyle(root) : null;
  const stepMs = styles
    ? Number.parseFloat(styles.getPropertyValue('--tx-tree-expand-stagger-step')) || 28
    : 28;
  const durationMs =
    (styles ? Number.parseFloat(styles.getPropertyValue('--tx-tree-expand-duration')) || 0.22 : 0.22) *
    1000;
  return stepMs * capped + durationMs + 40;
}
