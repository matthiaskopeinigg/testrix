import { app } from 'electron';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * Electron “dev toolkit”: auto-open DevTools, verbose logs. Set only when **`TESTRIX_DEV=1`** (`npm run dev` / **`--devtools`**).
 * Splash is suppressed only when **`TESTRIX_NO_SPLASH=1`**. (**`npm start`** vs **`dev`** splash path is identical; **`ng serve`** boot timeout follows **`usesAngularDevServer`** in **`start-application`.)
 */
export function isDevMode(): boolean {
  return process.env.TESTRIX_DEV === '1';
}

/** Main window loads the Angular CLI dev server (`ng serve`). Set for **`npm start`** and **`npm run dev`. */
export function usesAngularDevServer(): boolean {
  return process.env.TESTRIX_SERVE_RENDERER === '1';
}

/** Preview entry `npm run splash`. */
export function isSplashOnlyPreview(): boolean {
  return process.env.TESTRIX_SPLASH_ONLY === '1';
}

/** Opt out of splash for local iteration (`TESTRIX_NO_SPLASH=1`). */
export function isSplashExplicitlyDisabled(): boolean {
  return process.env.TESTRIX_NO_SPLASH === '1';
}

/**
 * Splash during boot mirrors production UX for all Electron entry flows.
 *
 * - Disabled for **`npm run splash`** (`TESTRIX_SPLASH_ONLY`).
 * - Skipped only when **`TESTRIX_NO_SPLASH=1`** (faster loops when iterating on Electron boot alone).
 */
export function shouldShowSplashBoot(): boolean {
  if (isSplashOnlyPreview()) {
    return false;
  }
  if (isSplashExplicitlyDisabled()) {
    return false;
  }
  return true;
}

/** True when Electron is executing from an ASAR/production bundle (`npm run start:dist` is still unpackaged). */
export function isPackagedRuntime(): boolean {
  return app.isPackaged;
}

export function userDataDir(): string {
  return app.getPath('userData');
}

export function defaultConfigDir(): string {
  const platform = process.platform;
  if (platform === 'win32') {
    return path.join(os.homedir(), 'Documents', 'Testrix');
  }
  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Documents', 'Testrix');
  }
  const base = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
  return path.join(base, 'testrix');
}
