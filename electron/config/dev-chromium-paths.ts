import { app } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { usesAngularDevServer } from './environment';

/**
 * Gives each dev Electron process its own Chromium cache directory.
 *
 * During `npm run dev`, `launch-electron.mjs` restarts Electron when main/preload
 * bundles change. Without isolation, the new process can fail to move/open the
 * shared disk cache while the previous process is still releasing locks (Win32).
 *
 * Imported as a side effect from `main.ts` (first import) so switches run before
 * the rest of the main bundle initializes Chromium.
 */
export function configureDevChromiumPaths(): void {
  if (!usesAngularDevServer()) {
    return;
  }

  const cacheRoot = path.join(os.tmpdir(), 'testrix-dev-chromium', String(process.pid));
  fs.mkdirSync(cacheRoot, { recursive: true });

  const diskCacheDir = path.join(cacheRoot, 'disk-cache');
  const gpuCacheDir = path.join(cacheRoot, 'gpu-cache');
  const appCacheDir = path.join(cacheRoot, 'app-cache');
  const sessionDataDir = path.join(cacheRoot, 'session-data');

  app.commandLine.appendSwitch('disk-cache-dir', diskCacheDir);
  app.commandLine.appendSwitch('gpu-shader-disk-cache-dir', gpuCacheDir);
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

  if (!app.isReady()) {
    app.setPath('cache', appCacheDir);
    app.setPath('sessionData', sessionDataDir);
  }
}

configureDevChromiumPaths();
