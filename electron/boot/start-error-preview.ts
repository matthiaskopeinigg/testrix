import { app } from 'electron';

import { attachProcessLogging } from '../errors/logger';

import { createErrorWindow } from '../windows/error-window/error-window.factory';

export async function startErrorPreview(message: string): Promise<void> {
  await app.whenReady();
  attachProcessLogging((name) => app.getPath(name));
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
  createErrorWindow(message);
}
