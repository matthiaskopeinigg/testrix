/**
 * FLIP-style row motion after a structural tree reorder.
 */

/** Minimum screen-space delta (px) before playing a move transition. */
const TX_TREE_MOVE_ANIMATION_THRESHOLD_PX = 1;

/** Captured layout anchor for a visible row before a structural update. */
export interface TreeRowFlipCapture {
  readonly rect: DOMRect;
  readonly depth: number;
}

export interface TreeRowMoveAnimationOptions {
  /** Always animate this node (used after reparent moves). */
  readonly reparentedNodeId?: string;
}

/**
 * Returns a stable anchor rect for FLIP (label position reflects indent + row height).
 */
function measureRowAnchor(host: HTMLElement): DOMRect {
  const label = host.querySelector('.tx-tree-row__label');
  if (label instanceof HTMLElement) {
    return label.getBoundingClientRect();
  }

  const row = host.querySelector('.tx-tree-row');
  if (row instanceof HTMLElement) {
    return row.getBoundingClientRect();
  }

  return host.getBoundingClientRect();
}

function readRowDepth(host: HTMLElement): number {
  return Math.max(0, Number(host.getAttribute('aria-level') ?? 1) - 1);
}

function readIndentPx(root: HTMLElement): number {
  const raw = getComputedStyle(root).getPropertyValue('--tx-tree-indent').trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 16;
}

/** Captures screen positions of visible tree rows keyed by node id. */
export function captureTreeRowRects(root: HTMLElement): Map<string, TreeRowFlipCapture> {
  const map = new Map<string, TreeRowFlipCapture>();

  for (const host of root.querySelectorAll('.tx-tree-row-host')) {
    const el = host as HTMLElement;
    const id = el.dataset['txTreeNodeId'];
    if (!id) {
      continue;
    }
    map.set(id, {
      rect: measureRowAnchor(el),
      depth: readRowDepth(el),
    });
  }

  return map;
}

/**
 * Animates rows from their previous positions to their new layout.
 *
 * @param root - Tree host element containing row hosts.
 * @param beforeCaptures - Positions captured immediately before the DOM update.
 */
export function animateTreeRowMoves(
  root: HTMLElement,
  beforeCaptures: Map<string, TreeRowFlipCapture>,
  options?: TreeRowMoveAnimationOptions,
): void {
  if (beforeCaptures.size === 0 || prefersReducedMotion()) {
    return;
  }

  const indentPx = readIndentPx(root);

  for (const host of root.querySelectorAll('.tx-tree-row-host')) {
    const el = host as HTMLElement;
    const id = el.dataset['txTreeNodeId'];
    if (!id) {
      continue;
    }

    const previous = beforeCaptures.get(id);
    if (!previous) {
      continue;
    }

    const nextRect = measureRowAnchor(el);
    const nextDepth = readRowDepth(el);
    let deltaX = previous.rect.left - nextRect.left;
    let deltaY = previous.rect.top - nextRect.top;

    const isReparent = options?.reparentedNodeId === id;
    if (isReparent) {
      const depthDelta = previous.depth - nextDepth;
      if (depthDelta !== 0) {
        deltaX = depthDelta * indentPx;
      }
    }

    if (
      Math.abs(deltaX) < TX_TREE_MOVE_ANIMATION_THRESHOLD_PX &&
      Math.abs(deltaY) < TX_TREE_MOVE_ANIMATION_THRESHOLD_PX
    ) {
      continue;
    }

    el.classList.add('tx-tree-row-host--moving');
    el.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
    el.style.transition = 'none';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition =
          'transform var(--tx-duration-reorder, 260ms) var(--tx-ease-standard, cubic-bezier(0.2, 0, 0, 1))';
        el.style.transform = '';

        const handleEnd = (event: TransitionEvent): void => {
          if (event.propertyName !== 'transform') {
            return;
          }
          el.classList.remove('tx-tree-row-host--moving');
          el.style.transition = '';
          el.removeEventListener('transitionend', handleEnd);
        };

        el.addEventListener('transitionend', handleEnd);
      });
    });
  }
}

/**
 * Runs FLIP animation after the next paint so layout matches the updated tree.
 */
export function scheduleTreeRowMoveAnimation(
  root: HTMLElement,
  beforeCaptures: Map<string, TreeRowFlipCapture>,
  options?: TreeRowMoveAnimationOptions,
): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      animateTreeRowMoves(root, beforeCaptures, options);
    });
  });
}

function prefersReducedMotion(): boolean {
  return (
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
