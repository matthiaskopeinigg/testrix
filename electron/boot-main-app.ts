import { app } from 'electron';

import { configureAppIdentity } from './config/app-icon';
import { registerBrowserProtocolSchemes } from './config/browser-protocol';
import { shouldShowSplashBoot } from './config/environment';
import { createSplashWindow } from './windows/splash-window/splash-window.factory';
import { startApplication } from './boot/start-application';

configureAppIdentity();
registerBrowserProtocolSchemes();

/** Splash is created on the first `whenReady` tick so config/CSP work cannot delay the window. */
let bootSplashWindow: ReturnType<typeof createSplashWindow> | null = null;

/** Normal application boot (everything except `--uninstall`). */
export function bootMainApp(): void {
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
}
