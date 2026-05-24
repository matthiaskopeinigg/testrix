import type { BrowserWindowConstructorOptions } from 'electron';

import { usesAngularDevServer } from '../../config/environment';
import { resolveBootWindowBackgroundColor } from '../../config/window-background';

/** Fully transparent — corner pixels outside the rounded shell show the desktop. */
export const MAIN_WINDOW_TRANSPARENT_BG = '#00000000';

function transparentFramelessChrome(): BrowserWindowConstructorOptions {
  return {
    transparent: true,
    backgroundColor: MAIN_WINDOW_TRANSPARENT_BG,
    frame: false,
    hasShadow: true,
    thickFrame: false,
  };
}

/** Opaque frameless shell — matches api-workbench Win32 chrome (DWM minimize animation). */
function opaqueFramelessChrome(): BrowserWindowConstructorOptions {
  return {
    transparent: false,
    backgroundColor: resolveBootWindowBackgroundColor(),
    frame: false,
    titleBarStyle: 'hidden',
    // Default `thickFrame: true` — setting false removes Win32 minimize/maximize animations.
    hasShadow: true,
  };
}

/**
 * Frameless window with transparent corners and a rounded content shell in the renderer
 * (`html.tx-electron-app` + `.tx-shell` in `_electron-window.scss`).
 */
export function mainWindowChromeOptions(): BrowserWindowConstructorOptions {
  if (process.platform === 'win32') {
    // Transparent layered windows skip the OS minimize animation (instant hide).
    return opaqueFramelessChrome();
  }

  if (usesAngularDevServer()) {
    const opaque: BrowserWindowConstructorOptions = {
      transparent: false,
      backgroundColor: resolveBootWindowBackgroundColor(),
      thickFrame: false,
      hasShadow: true,
      roundedCorners: true,
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 12, y: 10 },
    };
    return opaque;
  }

  if (process.platform === 'darwin') {
    return {
      ...transparentFramelessChrome(),
      roundedCorners: true,
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 12, y: 10 },
    };
  }

  return transparentFramelessChrome();
}
