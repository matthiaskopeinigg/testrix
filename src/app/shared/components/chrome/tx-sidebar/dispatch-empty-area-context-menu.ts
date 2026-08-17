/** Controls that should keep their native or dedicated context menu. */
const CONTEXT_MENU_PASSTHROUGH_SELECTOR =
  'input, textarea, button, a, select, [contenteditable="true"], .tx-input';

/**
 * True when the event started on a control that should not open the sidebar empty-area menu.
 */
export function shouldPassthroughSidebarContextMenu(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(CONTEXT_MENU_PASSTHROUGH_SELECTOR));
}

/**
 * Finds the projected panel body that already handles empty-area context menus.
 */
export function findSidebarEmptyContextTarget(root: ParentNode): HTMLElement | null {
  const shellBody = root.querySelector('.workspace-panel-shell__body');
  if (shellBody) {
    const innerBody = shellBody.querySelector<HTMLElement>(':scope > [class$="__body"]');
    if (innerBody) {
      return innerBody;
    }
    const first = shellBody.firstElementChild;
    if (first instanceof HTMLElement) {
      return first;
    }
  }
  return root.querySelector<HTMLElement>('[class$="__body"]');
}

/**
 * Replays a chrome right-click onto the panel empty-area handler (tree padding, title, toolbar).
 * Returns true when the event was retargeted.
 */
export function dispatchEmptyAreaContextMenu(event: MouseEvent, root: ParentNode): boolean {
  if (shouldPassthroughSidebarContextMenu(event.target)) {
    return false;
  }
  const target = findSidebarEmptyContextTarget(root);
  if (!target || (event.target instanceof Node && target.contains(event.target))) {
    return false;
  }
  event.preventDefault();
  target.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: event.clientX,
      clientY: event.clientY,
    }),
  );
  return true;
}
