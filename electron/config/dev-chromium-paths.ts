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
 */
export function configureDevChromiumPaths(): void {
  if (!usesAngularDevServer()) {
    return;
  }

  const cacheRoot = path.join(os.tmpdir(), 'testrix-dev-chromium', String(process.pid));
  fs.mkdirSync(cacheRoot, { recursive: true });

  app.commandLine.appendSwitch('disk-cache-dir', path.join(cacheRoot, 'disk-cache'));
  app.commandLine.appendSwitch('gpu-shader-disk-cache-dir', path.join(cacheRoot, 'gpu-cache'));
}
