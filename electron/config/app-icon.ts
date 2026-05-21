import { app, nativeImage, type BrowserWindowConstructorOptions, type NativeImage } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Matches `appId` in `electron-builder.yml` (Windows taskbar / toast identity). */
export const TESTRIX_APP_USER_MODEL_ID = 'dev.testrix.app';

/**
 * Call before `app.whenReady()` on Windows so the taskbar uses Testrix branding
 * instead of the generic Electron icon when running unpackaged (`npm start`).
 */
export function configureAppIdentity(): void {
  if (process.platform === 'win32') {
    app.setAppUserModelId(TESTRIX_APP_USER_MODEL_ID);
  }
}

function fileExists(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/** Absolute path to `.ico` (Windows) or `.png` (macOS/Linux) for BrowserWindow chrome. */
export function resolveAppIconPath(): string | undefined {
  if (app.isPackaged) {
    const packagedIco = path.join(process.resourcesPath, 'icon.ico');
    if (fileExists(packagedIco)) {
      return packagedIco;
    }
    const packagedPng = path.join(process.resourcesPath, 'icon.png');
    if (fileExists(packagedPng)) {
      return packagedPng;
    }
  }

  const roots = [...new Set([process.cwd(), app.getAppPath()])];

  for (const root of roots) {
    if (process.platform === 'win32') {
      const ico = path.join(root, 'build', 'icons', 'icon.ico');
      if (fileExists(ico)) {
        return ico;
      }
    }

    const png = path.join(root, 'build', 'icons', 'icon-1024.png');
    if (fileExists(png)) {
      return png;
    }
  }

  return undefined;
}

export function appIconNativeImage(): NativeImage | undefined {
  const iconPath = resolveAppIconPath();
  if (!iconPath) {
    return undefined;
  }

  const image = nativeImage.createFromPath(iconPath);
  return image.isEmpty() ? undefined : image;
}

export function appIconBrowserWindowOptions(): Pick<BrowserWindowConstructorOptions, 'icon'> {
  const icon = appIconNativeImage();
  return icon ? { icon } : {};
}
