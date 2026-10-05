import { watch } from 'node:fs';
import path from 'node:path';

import { usesAngularDevServer } from '@testrix/electron-core';

import { listWorkbenchWindows } from './main-window';

const OVERLAY_JS = `!!(
  document.querySelector('vite-error-overlay')
  || (document.body && document.body.innerText.includes('fix the code to dismiss'))
)`;

/**
 * After a compile error, Electron often keeps Angular's overlay even when the
 * next rebuild succeeds. Reload only those stuck windows when renderer sources
 * change so normal HMR stays intact.
 */
export function watchDevOverlayReload(root = process.cwd()): void {
  if (!usesAngularDevServer())
    return;
  const src = path.join(root, 'apps/renderer/src');
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    watch(src, { recursive: true }, () => {
      if (timer)
        clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void reloadWindowsStuckOnOverlay();
      }, 600);
    });
  } catch {
    // Missing src or an OS that cannot recursive-watch.
  }
}

async function reloadWindowsStuckOnOverlay(): Promise<void> {
  for (const win of listWorkbenchWindows()) {
    if (win.isDestroyed())
      continue;
    try {
      const stuck = (await win.webContents.executeJavaScript(OVERLAY_JS)) === true;
      if (stuck)
        win.webContents.reload();
    } catch {
      // Page may be mid-navigation.
    }
  }
}
