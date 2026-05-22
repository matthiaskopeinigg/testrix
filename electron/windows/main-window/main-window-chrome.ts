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

/**
 * Frameless window with transparent corners and a rounded content shell in the renderer
 * (`html.tx-electron-app` + `.tx-shell` in `_electron-window.scss`).
 */
export function mainWindowChromeOptions(): BrowserWindowConstructorOptions {
  if (usesAngularDevServer()) {
    // Win32: transparent + CSS clip — opaque/native rounding cannot show curved outer corners.
    if (process.platform === 'win32') {
      return transparentFramelessChrome();
    }

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
