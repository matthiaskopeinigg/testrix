import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { usesAngularDevServer } from './environment';

/** Production browser bundle (packaged vs `npm run start:dist`). */
export function resolveBrowserIndexPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'browser', 'index.html');
  }
  if (usesAngularDevServer()) {
    throw new Error('resolveBrowserIndexPath: Angular dev server mode loads localhost URL, not an index.html path');
  }
  return path.join(process.cwd(), 'dist', 'testrix', 'browser', 'index.html');
}

export function resolveSplashHtmlPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'splash', 'splash.html');
  }

  const roots = [...new Set([app.getAppPath(), process.cwd()])];

  for (const root of roots) {
    const candidate = path.join(root, 'electron', 'splash', 'splash.html');
    try {
      if (fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return path.join(app.getAppPath(), 'electron', 'splash', 'splash.html');
}

export function resolveErrorHtmlPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'error', 'error.html');
  }
  return path.join(process.cwd(), 'electron', 'error', 'error.html');
}

/** Main window preload bundle (`dist/electron/preload`; packaged via `electron-builder`). */
export function resolveMainPreloadPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'preload', 'main.preload.js');
  }
  return path.join(process.cwd(), 'dist', 'electron', 'preload', 'main.preload.js');
}
