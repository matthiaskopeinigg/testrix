/**
 * FLIP layout animation for the collections tree after a drop commit.
 * Captures first positions, then plays invert→none on matching nodes.
 */

const FLIP_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const FLIP_MS = 300;
const FLIP_MOVED_MS = 280;

/** Only the corner a FLIP needs. `DOMRect` satisfies it. */
export interface FlipRect {
  readonly left: number;
  readonly top: number;
}

export interface FlipCaptureOptions {
  /** Override first rect for the dragged node (usually the floating preview). */
  readonly previewRect?: FlipRect | null;
  readonly draggedId?: string | null;
}

/**
 * Reads current viewport rects keyed by `data-flip-id`.
 */
export function captureFlipPositions(
  root: ParentNode,
  options: FlipCaptureOptions = {},
): Map<string, FlipRect> {
  const positions = new Map<string, FlipRect>();
  root.querySelectorAll('[data-flip-id]').forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const id = node.dataset['flipId'];
    if (!id) {
      return;
    }
    positions.set(id, node.getBoundingClientRect());
  });

  const { previewRect, draggedId } = options;
  if (previewRect && draggedId) {
    positions.set(draggedId, previewRect);
  }

  return positions;
}

function readMotionScale(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--tx-motion-scale').trim();
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value >= 0 ? value : 1;
}

/**
 * True when an ancestor flip node is also translating — child should ride along.
 */
function isCoveredByAncestorFlip(el: HTMLElement, first: Map<string, FlipRect>): boolean {
  let current: HTMLElement | null = el.parentElement;
  while (current) {
    const ancestor = current.closest('[data-flip-id]');
    if (!(ancestor instanceof HTMLElement) || ancestor === el) {
      current = current.parentElement;
      continue;
    }

    const ancestorId = ancestor.dataset['flipId'];
    if (!ancestorId) {
      current = ancestor.parentElement;
      continue;
    }

    const prev = first.get(ancestorId);
    if (prev) {
      const next = ancestor.getBoundingClientRect();
      if (Math.abs(prev.left - next.left) >= 0.5 || Math.abs(prev.top - next.top) >= 0.5) {
        return true;
      }
    }

    current = ancestor.parentElement;
  }
  return false;
}

/**
 * Animates tree rows from `first` positions to their post-layout positions.
 */
export function playTreeFlip(
  root: ParentNode,
  first: Map<string, FlipRect>,
  movedId: string | null,
): void {
  if (first.size === 0) {
    return;
  }

  const scale = readMotionScale();
  if (scale === 0) {
    return;
  }
  const duration = Math.round(FLIP_MS * scale);
  const movedDuration = Math.round(FLIP_MOVED_MS * scale);

  root.querySelectorAll('[data-flip-id]').forEach((node) => {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const id = node.dataset['flipId'];
    if (!id) {
      return;
    }

    if (isCoveredByAncestorFlip(node, first)) {
      return;
    }

    const prev = first.get(id);
    const next = node.getBoundingClientRect();

    if (!prev) {
      node.animate(
        [
          { opacity: 0.2, transform: 'translateY(-8px) scale(0.98)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration, easing: FLIP_EASE, fill: 'both' },
      );
      return;
    }

    const dy = prev.top - next.top;
    if (Math.abs(dy) < 0.5) {
      return;
    }

    // Rows are the full width of the scroller. Any translateX — even a few pixels from
    // a vertical scrollbar appearing on drop — overflows and flashes a horizontal bar.
    const isMoved = id === movedId;
    node.style.zIndex = isMoved ? '3' : '1';
    const animation = node.animate(
      isMoved
        ? [
            { transform: `translateY(${dy}px)`, offset: 0 },
            { transform: `translateY(${dy * 0.18}px)`, offset: 0.72 },
            { transform: 'none', offset: 1 },
          ]
        : [{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
      {
        duration: isMoved ? movedDuration : duration,
        easing: FLIP_EASE,
        fill: 'both',
      },
    );

    animation.finished
      .catch(() => undefined)
      .finally(() => {
        node.style.zIndex = '';
      });
  });
}
