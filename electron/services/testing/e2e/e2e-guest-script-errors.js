'use strict';

/**
 * True when a guest `executeJavaScript` failure is a navigation / frame-detach race
 * rather than a real selector or assertion error.
 *
 * @param {unknown} message
 * @returns {boolean}
 */
function isGuestNavigationRaceError(message) {
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

module.exports = { isGuestNavigationRaceError };
