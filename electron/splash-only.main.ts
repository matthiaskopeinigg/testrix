import { app } from 'electron';

import { configureAppIdentity } from './config/app-icon';
import { startSplashPreview } from './boot/start-splash-preview';

configureAppIdentity();

void startSplashPreview().catch((reason: unknown) => {
  console.error('[electron splash-only]', reason);
  app.quit();
});
