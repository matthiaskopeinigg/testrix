export interface ToolbarMenuPosition {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly maxHeight: number;
}

/**
 * Places a toolbar menu under its trigger, with the menu's right edge on the
 * trigger's right edge, and keeps the menu inside the sidebar.
 */
export function placeToolbarMenu(
  trigger: HTMLElement,
  preferredWidth: number,
  gap = 6,
  edge = 8,
): ToolbarMenuPosition {
  const triggerRect = trigger.getBoundingClientRect();
  const bounds =
    trigger.closest('.tx-sidebar')?.getBoundingClientRect() ??
    new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  const width = Math.min(preferredWidth, Math.max(140, bounds.width - edge * 2));
  const minLeft = bounds.left + edge;
  const maxLeft = Math.max(minLeft, bounds.right - width - edge);
  const left = Math.min(Math.max(triggerRect.right - width, minLeft), maxLeft);
  const top = triggerRect.bottom + gap;
  const maxHeight = Math.max(120, Math.floor(bounds.bottom - top - edge));
  return { top, left, width, maxHeight };
}
