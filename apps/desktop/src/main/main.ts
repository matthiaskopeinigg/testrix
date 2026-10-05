import { app, dialog } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { APP_ID, PRODUCT_NAME } from '@testrix/contracts';
import { appLogger } from '@testrix/electron-core';

import { startApplication } from './start-application';

/**
 * Keep this build out of another Testrix install's instance lock and userData.
 * Unpackaged `npm start` always isolates. Packaged builds opt in with TESTRIX_COMPARE=1.
 */
function applyInstanceIdentity(): void {
  const compare = process.env['TESTRIX_COMPARE'] === '1';
  const isolate = !app.isPackaged || compare;

  if (isolate) {
    const slot = compare ? 'compare' : 'dev';
    app.setName(`${PRODUCT_NAME} 2.0`);
    app.setPath('userData', path.join(app.getPath('appData'), `${PRODUCT_NAME}-2.0-${slot}`));
    if (process.platform === 'win32') {
      app.setAppUserModelId(`${APP_ID}.v2.${slot}`);
    }
    return;
  }

  app.setName(PRODUCT_NAME);
  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_ID);
  }
}

/** Apps & Features may call the main exe with Squirrel-style `--uninstall`. */
function handoffUninstallIfRequested(): boolean {
  const wantsUninstall = process.argv.some(
    (arg) => arg === '--uninstall' || arg === '--mode=uninstall',
  );
  if (!wantsUninstall || !app.isPackaged) return false;
  const setup = path.join(path.dirname(process.execPath), 'setup', `${PRODUCT_NAME}.exe`);
  if (!existsSync(setup)) return false;
  spawn(setup, ['--', '--mode=uninstall'], { detached: true, stdio: 'ignore' }).unref();
  app.exit(0);
  return true;
}

if (!handoffUninstallIfRequested()) {
  applyInstanceIdentity();
  app.commandLine.appendSwitch('disable-features', 'Translate,OptimizationGuideModelDownloading');
  startApplication().catch((error: unknown) => {
    appLogger.error('boot', error);
    dialog.showErrorBox(
      `${PRODUCT_NAME} could not start`,
      error instanceof Error ? error.message : String(error),
    );
    app.exit(1);
  });
}
