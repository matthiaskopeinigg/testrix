import { app } from 'electron';
import * as fs from 'node:fs';
import * as os from 'node:os';

import { usesAngularDevServer } from './environment';
import { resolveDevChromiumLayout } from './dev-chromium-layout';
import {
  resolveLocalDevConfigDir,
  resolveLocalDevElectronUserDataDir,
} from './local-dev-config-dir';

/**
 * Isolates Chromium disk cache per Electron process during `npm start` / `npm run dev`.
 *
 * Workspace JSON lives in the repo `.config` folder. Chromium session data lives under
 * `.config/electron` so profile files stay easy to edit. Disk cache stays per-pid in temp.
 *
 * Imported as a side effect from `main.ts` (first import) so switches run before
 * the rest of the main bundle initializes Chromium.
 */
export function configureDevChromiumPaths(): void {
  if (!usesAngularDevServer()) {
    return;
  }

  const configDir = resolveLocalDevConfigDir({
    cwd: process.cwd(),
    configDirEnv: process.env.TESTRIX_CONFIG_DIR,
    serveRenderer: true,
  });
  if (configDir && !app.isReady()) {
    if (!process.env.TESTRIX_CONFIG_DIR?.trim()) {
      process.env.TESTRIX_CONFIG_DIR = configDir;
    }
    const electronUserData = resolveLocalDevElectronUserDataDir(configDir);
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(electronUserData, { recursive: true });
    app.setPath('userData', electronUserData);
  }

  const layout = resolveDevChromiumLayout({
    tmpdir: os.tmpdir(),
    userData: app.getPath('userData'),
    pid: process.pid,
  });

  fs.mkdirSync(layout.diskCacheDir, { recursive: true });
  fs.mkdirSync(layout.gpuCacheDir, { recursive: true });
  fs.mkdirSync(layout.appCacheDir, { recursive: true });
  fs.mkdirSync(layout.sessionDataDir, { recursive: true });

  app.commandLine.appendSwitch('disk-cache-dir', layout.diskCacheDir);
  app.commandLine.appendSwitch('gpu-shader-disk-cache-dir', layout.gpuCacheDir);
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

  if (!app.isReady()) {
    app.setPath('cache', layout.appCacheDir);
    app.setPath('sessionData', layout.sessionDataDir);
  }
}

configureDevChromiumPaths();
