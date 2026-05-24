import './config/dev-chromium-paths';

import { app } from 'electron';

import { configureAppIdentity } from './config/app-icon';
import { shouldShowSplashBoot } from './config/environment';

configureAppIdentity();
import { createSplashWindow } from './windows/splash-window/splash-window.factory';
import { startApplication } from './boot/start-application';

/** Splash is created on the first `whenReady` tick so config/CSP work cannot delay the window. */
let bootSplashWindow: ReturnType<typeof createSplashWindow> | null = null;

void app.whenReady().then(() => {
  if (!shouldShowSplashBoot()) {
    return;
  }
  try {
    bootSplashWindow = createSplashWindow();
    console.log('[testrix] splash window shown');
  } catch (reason: unknown) {
    console.error('[testrix] splash window failed:', reason);
  }
});

void startApplication(() => bootSplashWindow).catch((reason: unknown) => {
  console.error('[electron main]', reason);
  app.quit();
});
