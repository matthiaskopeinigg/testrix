import { BrowserWindow } from 'electron';

/**
 * Detached DevTools is a separate BrowserWindow on Win32 that blocks clicks on the app.
 */
export function destroyOrphanDevToolsWindows(mainWindow: BrowserWindow): number {
  let destroyed = 0;

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win === mainWindow) {
      continue;
    }

    const title = win.getTitle().toLowerCase();
    const url = win.webContents.getURL().toLowerCase();
    const isDevTools =
      url.startsWith('devtools://') || title.includes('devtools') || title.includes('developer tools');

    if (!isDevTools) {
      continue;
    }

    win.destroy();
    destroyed += 1;
  }

  return destroyed;
}

/** On Win32, tear down detached DevTools windows that sit above the app and eat clicks. */
export function attachWin32DevToolsGuard(mainWindow: BrowserWindow): void {
  if (process.platform !== 'win32') {
    return;
  }

  mainWindow.webContents.on('devtools-opened', () => {
    destroyOrphanDevToolsWindows(mainWindow);
  });

  mainWindow.once('show', () => {
    destroyOrphanDevToolsWindows(mainWindow);
  });
}
