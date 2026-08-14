import { app } from 'electron';

import { attachProcessLogging } from '../errors/logger';

import { createSplashWindow } from '../windows/splash-window/splash-window.factory';

export async function startSplashPreview(): Promise<void> {
  await app.whenReady();

  attachProcessLogging((name) => app.getPath(name));

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  createSplashWindow();
}
