/**
 * True when a guest `executeJavaScript` failure is a navigation / frame-detach race
 * rather than a real selector or assertion error.
 *
 * @param message Error message from Electron or Chromium.
 */
export function isGuestNavigationRaceError(message: unknown): boolean {
  const text = String(message ?? '').toLowerCase();
  if (!text) {
    return false;
  }
  return (
    text.includes('script failed to execute') ||
    text.includes('a navigation happened') ||
    text.includes('execution context was destroyed') ||
    text.includes('render frame was disposed') ||
    text.includes('frame was detached') ||
    text.includes('document was unloaded') ||
    text.includes('most likely because of a navigation')
  );
}
