import { app } from 'electron';
import path from 'node:path';

import { APP_ID } from '@testrix/contracts';

import { startApplication } from './start-application';

/**
 * Keep this build out of another Testrix install's instance lock and userData.
 * Unpackaged `npm start` always isolates. Packaged builds opt in with TESTRIX_COMPARE=1.
 */
function applyInstanceIdentity(): void {
  const compare = process.env.TESTRIX_COMPARE === '1';
  const isolate = !app.isPackaged || compare;

  if (isolate) {
    const slot = compare ? 'compare' : 'dev';
    app.setName('Testrix 2.0');
    app.setPath('userData', path.join(app.getPath('appData'), `Testrix-2.0-${slot}`));
    if (process.platform === 'win32') {
      app.setAppUserModelId(`${APP_ID}.v2.${slot}`);
    }
    return;
  }

  app.setName('Testrix');
  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_ID);
  }
}

applyInstanceIdentity();
app.commandLine.appendSwitch('disable-features', 'Translate,OptimizationGuideModelDownloading');

void startApplication();
