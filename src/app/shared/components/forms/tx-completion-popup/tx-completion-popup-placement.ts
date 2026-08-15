/** Where a fixed completion popup is anchored relative to its field. */
export type TxCompletionPlacement = 'above' | 'below';

export const TX_COMPLETION_PLACEMENT_DEFAULT: TxCompletionPlacement = 'above';

export interface CompletionClipRect {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

export interface PositionFixedCompletionPopupInput {
  readonly anchor: HTMLElement;
  readonly panel: HTMLElement;
  readonly placement: TxCompletionPlacement;
  readonly gapPx?: number;
  readonly viewportMarginPx?: number;
  /** Visible bounds; defaults to overflow ancestors intersected with the viewport. */
  readonly clipRect?: CompletionClipRect;
}

export interface ResolveCompletionPlacementInput {
  readonly placement: TxCompletionPlacement;
  readonly anchorTop: number;
  readonly anchorBottom: number;
  readonly panelHeight: number;
  readonly gapPx?: number;
  readonly viewportMarginPx?: number;
  readonly viewportHeight: number;
  readonly clipTop?: number;
  readonly clipBottom?: number;
}

/**
 * Chooses above/below placement, flipping when the preferred side lacks room.
 */
export function resolveCompletionPlacement(input: ResolveCompletionPlacementInput): TxCompletionPlacement {
  const gap = input.gapPx ?? 4;
  const margin = input.viewportMarginPx ?? 8;
  const required = input.panelHeight + gap;
  const clipTop = input.clipTop ?? 0;
  const clipBottom = input.clipBottom ?? input.viewportHeight;
  const spaceAbove = input.anchorTop - clipTop - margin;
  const spaceBelow = clipBottom - input.anchorBottom - margin;
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
 * Positions a fixed completion panel against an anchor rect.
 * Flips above/below when a clipping ancestor (tab pane, overflow) lacks room.
 * Returns the resolved placement after auto-flip/clamp.
 */
export function positionFixedCompletionPopup(
  input: PositionFixedCompletionPopupInput,
): TxCompletionPlacement {
  const gap = input.gapPx ?? 4;
  const margin = input.viewportMarginPx ?? 8;
  const rect = input.anchor.getBoundingClientRect();
  const clip = input.clipRect ?? clipRectForFixedPopup(input.anchor);
  const panelHeight = input.panel.offsetHeight;
  const resolved = resolveCompletionPlacement({
    placement: input.placement,
    anchorTop: rect.top,
    anchorBottom: rect.bottom,
    panelHeight,
    gapPx: gap,
    viewportMarginPx: margin,
    viewportHeight: globalThis.innerHeight,
    clipTop: clip.top,
    clipBottom: clip.bottom,
  });

  const available =
    resolved === 'above'
      ? rect.top - clip.top - gap - margin
      : clip.bottom - rect.bottom - gap - margin;
  input.panel.style.maxHeight = `${Math.max(96, Math.min(220, available))}px`;
  const height = input.panel.offsetHeight;

  let top: number;
  if (resolved === 'above') {
    top = rect.top - height - gap;
    top = Math.max(clip.top + margin, top);
  } else {
    top = rect.bottom + gap;
    const maxTop = clip.bottom - height - margin;
    top = Math.min(maxTop, Math.max(clip.top + margin, top));
  }

  input.panel.style.top = `${top}px`;
  input.panel.style.left = `${rect.left}px`;
  input.panel.style.width = `${rect.width}px`;
  return resolved;
}

/**
 * Visible rectangle that can clip a `position: fixed` popup from {@link anchor}.
 */
export function clipRectForFixedPopup(anchor: HTMLElement): CompletionClipRect {
  let top = 0;
  let left = 0;
  let right = globalThis.innerWidth;
  let bottom = globalThis.innerHeight;
  let node: HTMLElement | null = anchor.parentElement;
  while (node) {
    const style = globalThis.getComputedStyle(node);
    if (overflowClips(style)) {
      const rect = node.getBoundingClientRect();
      top = Math.max(top, rect.top);
      left = Math.max(left, rect.left);
      right = Math.min(right, rect.right);
      bottom = Math.min(bottom, rect.bottom);
    }
    node = node.parentElement;
  }
  return { top, left, right, bottom };
}

/** Runs after layout so {@link positionFixedCompletionPopup} can read panel height. */
export function scheduleFixedCompletionPosition(run: () => void): void {
  queueMicrotask(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  });
}

function overflowClips(style: CSSStyleDeclaration): boolean {
  return clipsOnAxis(style.overflowX) || clipsOnAxis(style.overflowY);
}

function clipsOnAxis(value: string): boolean {
  return value === 'hidden' || value === 'auto' || value === 'scroll' || value === 'clip';
}
