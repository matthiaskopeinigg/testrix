import type { BrowserWindow } from 'electron';
import { shell } from 'electron';

import { resolveDevServerOrigin } from '../../boot/wait-for-dev-server';
import { usesAngularDevServer } from '../../config/environment';

/**
 * URLs safe to pass to `shell.openExternal` from renderer-triggered navigation.
 */
export function isSafeExternalOpenUrl(url: string): boolean {
  if (typeof url !== 'string' || url.length > 8000) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'http:' ||
      parsed.protocol === 'https:' ||
      parsed.protocol === 'mailto:' ||
      parsed.protocol === 'tel:'
    );
  } catch {
    return false;
  }
}

/**
 * Allow in-window navigation only for the Angular shell (dev server or packaged `file:` UI).
 */
export function isAppShellNavigationUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol === 'file:') {
      return true;
    }

    if (usesAngularDevServer()) {
      const dev = new URL(resolveDevServerOrigin());
      const sameHost = url.hostname === dev.hostname && url.port === dev.port;
      const httpish = url.protocol === 'http:' || url.protocol === 'https:';
      return sameHost && httpish;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * `target=_blank` / `window.open` otherwise create an in-app BrowserWindow; use the OS browser instead.
 */
export function attachExternalLinkHandlers(win: BrowserWindow): void {
  const wc = win.webContents;

  wc.setWindowOpenHandler((details) => {
    const url = details.url;
    if (isSafeExternalOpenUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  wc.on('will-navigate', (event, url) => {
    if (isAppShellNavigationUrl(url)) {
      return;
    }

    event.preventDefault();
    if (isSafeExternalOpenUrl(url)) {
      void shell.openExternal(url);
    }
  });
}
