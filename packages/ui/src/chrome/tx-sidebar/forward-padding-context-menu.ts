const forwardedMenus = new WeakSet<Event>();

/**
 * A right-click in a surface's padding misses the row and opens no menu.
 * Replay it on the content under the same point so the row or empty chrome handles it.
 *
 * @returns True when the click was in the padding and a new event was sent.
 */
export function forwardPaddingContextMenu(event: MouseEvent): boolean {
  if (forwardedMenus.has(event))
    return false;
  const surface = event.currentTarget;
  if (!(surface instanceof HTMLElement) || event.target !== surface)
    return false;

  const rect = surface.getBoundingClientRect();
  const style = getComputedStyle(surface);
  const padLeft = Number.parseFloat(style.paddingLeft) || 0;
  const padRight = Number.parseFloat(style.paddingRight) || 0;
  const padTop = Number.parseFloat(style.paddingTop) || 0;
  const padBottom = Number.parseFloat(style.paddingBottom) || 0;
  const innerLeft = rect.left + padLeft;
  const innerRight = rect.right - padRight;
  const innerTop = rect.top + padTop;
  const innerBottom = rect.bottom - padBottom;
  if (innerRight - innerLeft < 8 || innerBottom - innerTop < 8)
    return false;

  const inPadding =
    event.clientX < innerLeft ||
    event.clientX > innerRight ||
    event.clientY < innerTop ||
    event.clientY > innerBottom;
  if (!inPadding)
    return false;

  const x = Math.min(innerRight - 1, Math.max(innerLeft + 1, event.clientX));
  const y = Math.min(innerBottom - 1, Math.max(innerTop + 1, event.clientY));
  const hit = document.elementFromPoint(x, y);
  if (!(hit instanceof HTMLElement) || hit === surface || !surface.contains(hit))
    return false;
  if (hit.closest('input, textarea, select, [contenteditable="true"]'))
    return false;

  event.preventDefault();
  event.stopPropagation();
  const forwarded = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    button: 2,
    buttons: event.buttons,
    view: window,
  });
  forwardedMenus.add(forwarded);
  hit.dispatchEvent(forwarded);
  return true;
}
