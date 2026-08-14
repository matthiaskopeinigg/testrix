/** Where a fixed completion popup is anchored relative to its field. */
export type TxCompletionPlacement = 'above' | 'below';

export const TX_COMPLETION_PLACEMENT_DEFAULT: TxCompletionPlacement = 'above';

export interface PositionFixedCompletionPopupInput {
  readonly anchor: HTMLElement;
  readonly panel: HTMLElement;
  readonly placement: TxCompletionPlacement;
  readonly gapPx?: number;
  readonly viewportMarginPx?: number;
}

export interface ResolveCompletionPlacementInput {
  readonly placement: TxCompletionPlacement;
  readonly anchorTop: number;
  readonly anchorBottom: number;
  readonly panelHeight: number;
  readonly gapPx?: number;
  readonly viewportMarginPx?: number;
  readonly viewportHeight: number;
}

/**
 * Chooses above/below placement, flipping when the preferred side lacks room.
 */
export function resolveCompletionPlacement(input: ResolveCompletionPlacementInput): TxCompletionPlacement {
  const gap = input.gapPx ?? 4;
  const margin = input.viewportMarginPx ?? 8;
  const required = input.panelHeight + gap;
  const spaceAbove = input.anchorTop - margin;
  const spaceBelow = input.viewportHeight - input.anchorBottom - margin;
  const fitsAbove = required <= spaceAbove;
  const fitsBelow = required <= spaceBelow;

  if (input.placement === 'above') {
    if (fitsAbove) {
      return 'above';
    }
    if (fitsBelow) {
      return 'below';
    }
    return spaceBelow >= spaceAbove ? 'below' : 'above';
  }

  if (fitsBelow) {
    return 'below';
  }
  if (fitsAbove) {
    return 'above';
  }
  return spaceAbove >= spaceBelow ? 'above' : 'below';
}

/**
 * Positions a fixed completion panel against an anchor rect (escapes overflow-hidden parents).
 * Returns the resolved placement after auto-flip/clamp.
 */
export function positionFixedCompletionPopup(
  input: PositionFixedCompletionPopupInput,
): TxCompletionPlacement {
  const gap = input.gapPx ?? 4;
  const margin = input.viewportMarginPx ?? 8;
  const rect = input.anchor.getBoundingClientRect();
  const panelHeight = input.panel.offsetHeight;
  const resolved = resolveCompletionPlacement({
    placement: input.placement,
    anchorTop: rect.top,
    anchorBottom: rect.bottom,
    panelHeight,
    gapPx: gap,
    viewportMarginPx: margin,
    viewportHeight: globalThis.innerHeight,
  });

  let top: number;
  if (resolved === 'above') {
    top = rect.top - panelHeight - gap;
    top = Math.max(margin, top);
  } else {
    top = rect.bottom + gap;
    const maxTop = globalThis.innerHeight - panelHeight - margin;
    top = Math.min(maxTop, Math.max(margin, top));
  }

  input.panel.style.top = `${top}px`;
  input.panel.style.left = `${rect.left}px`;
  input.panel.style.width = `${rect.width}px`;
  return resolved;
}

/** Runs after layout so {@link positionFixedCompletionPopup} can read panel height. */
export function scheduleFixedCompletionPosition(run: () => void): void {
  queueMicrotask(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  });
}
