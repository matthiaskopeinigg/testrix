import type { BrowserWindowConstructorOptions } from 'electron';

import { usesAngularDevServer } from '../../config/environment';

/** Fully transparent — corner pixels outside the rounded shell show the desktop. */
export const MAIN_WINDOW_TRANSPARENT_BG = '#00000000';

const WIN32_OPAQUE_BG = '#16181d';

/**
 * Frameless window with transparent corners and a rounded content shell in the renderer
 * (`html.tx-electron-app` + `.tx-shell` in `_electron-window.scss`).
 */
export function mainWindowChromeOptions(): BrowserWindowConstructorOptions {
  if (usesAngularDevServer()) {
    const opaque: BrowserWindowConstructorOptions = {
      transparent: false,
      backgroundColor: WIN32_OPAQUE_BG,
      thickFrame: true,
      hasShadow: true,
      roundedCorners: false,
    };
    if (process.platform === 'darwin') {
      return {
        ...opaque,
        titleBarStyle: 'hidden',
        trafficLightPosition: { x: 12, y: 10 },
      };
    }
    return { ...opaque, frame: false };
  }

  const transparentWindow: Pick<
    BrowserWindowConstructorOptions,
    'transparent' | 'backgroundColor'
  > = {
    transparent: true,
    backgroundColor: MAIN_WINDOW_TRANSPARENT_BG,
  };

  if (process.platform === 'darwin') {
    return {
      ...transparentWindow,
      frame: false,
      hasShadow: true,
      roundedCorners: true,
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 12, y: 10 },
    };
  }

  return {
    ...transparentWindow,
    frame: false,
    hasShadow: true,
  };
}
