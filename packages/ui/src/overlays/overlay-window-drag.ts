import type {} from '@testrix/contracts';

const OVERLAY_OPEN_CLASS = 'tx-overlay-open';
const OVERLAY_NO_DRAG_STYLE_ID = 'tx-overlay-no-drag';
let overlayOpenCount = 0;

const NO_DRAG_CSS = `
html.tx-overlay-open,
html.tx-overlay-open * {
  -webkit-app-region: no-drag !important;
}
`;

/** Turns off the titlebar window-drag region while a popup covers it. */
export function lockOverlayWindowDrag(): void {
  overlayOpenCount += 1;
  document.documentElement.classList.add(OVERLAY_OPEN_CLASS);
  if (overlayOpenCount === 1)
    applyWindowDragLock(true);
}

export function unlockOverlayWindowDrag(): void {
  overlayOpenCount = Math.max(0, overlayOpenCount - 1);
  if (overlayOpenCount > 0)
    return;
  document.documentElement.classList.remove(OVERLAY_OPEN_CLASS);
  applyWindowDragLock(false);
}

function applyWindowDragLock(locked: boolean): void {
  if (locked)
    ensureNoDragStylesheet();
  else
    document.getElementById(OVERLAY_NO_DRAG_STYLE_ID)?.remove();

  for (const el of dragRegionElements()) {
    if (locked)
      el.style.setProperty('-webkit-app-region', 'no-drag');
    else
      el.style.removeProperty('-webkit-app-region');
  }

  refreshNativeDragRegions();
  void window.testrix?.window.setMovable?.(!locked);
}

function ensureNoDragStylesheet(): void {
  if (document.getElementById(OVERLAY_NO_DRAG_STYLE_ID))
    return;
  const style = document.createElement('style');
  style.id = OVERLAY_NO_DRAG_STYLE_ID;
  style.textContent = NO_DRAG_CSS;
  document.head.appendChild(style);
}

function dragRegionElements(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.tx-titlebar, .tx-titlebar__drag')];
}

function refreshNativeDragRegions(): void {
  const titlebar = document.querySelector<HTMLElement>('.tx-titlebar');
  if (!titlebar)
    return;
  const previous = titlebar.style.transform;
  titlebar.style.transform = 'translateZ(0)';
  void titlebar.offsetHeight;
  titlebar.style.transform = previous;
}
