/** Default open sidebar width in pixels. */
export const TX_SIDEBAR_DEFAULT_WIDTH = 248;

/** Smallest allowed open width. */
export const TX_SIDEBAR_MIN_WIDTH = 200;

/** Largest allowed open width. */
export const TX_SIDEBAR_MAX_WIDTH = 480;

/** Dragging below this width collapses the sidebar on release. */
export const TX_SIDEBAR_COLLAPSE_WIDTH = 148;

/**
 * Clamps a sidebar width into the open range.
 */
export function clampSidebarWidth(width: number): number {
  return Math.round(Math.min(TX_SIDEBAR_MAX_WIDTH, Math.max(TX_SIDEBAR_MIN_WIDTH, width)));
}
