import { app, net, protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { usesAngularDevServer } from './environment';
import { resolveDevServerOrigin } from '../boot/wait-for-dev-server';

/** Origin for packaged Angular static assets (`testrix://bundle/...`). */
export const BROWSER_PROTOCOL_BASE = 'testrix://bundle/';

/**
 * Registers the privileged custom scheme before `app.whenReady()`.
 */
export function registerBrowserProtocolSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'testrix',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

/**
 * Resolves the on-disk browser bundle root (`resources/browser` when packaged).
 */
export function resolveBrowserRootDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'browser');
  }
  return path.join(process.cwd(), 'dist', 'testrix', 'browser');
}

/**
 * Maps a relative browser asset path to a `testrix://` URL.
 *
 * @param relativeFromPublic Path under `public/` / `resources/browser/`.
 */
export function browserProtocolUrl(relativeFromPublic: string): string {
  const clean = String(relativeFromPublic || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (!clean) {
    return BROWSER_PROTOCOL_BASE;
  }
  return new URL(clean, BROWSER_PROTOCOL_BASE).href;
}

/**
 * Main-window entry URL for the Angular shell.
 */
export function resolvePackagedBrowserIndexUrl(): string {
  return browserProtocolUrl('index.html');
}

/**
 * Installs the protocol handler that serves files from the browser bundle directory.
 */
export function registerBrowserProtocolHandler(): void {
  if (usesAngularDevServer()) {
    return;
  }

  const browserRoot = path.resolve(resolveBrowserRootDir());

  protocol.handle('testrix', (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel.startsWith('/')) {
      rel = rel.slice(1);
    }

    const filePath = path.resolve(path.join(browserRoot, rel));
    if (!filePath.startsWith(browserRoot)) {
      return new Response('Forbidden', { status: 403 });
    }
    if (!fs.existsSync(filePath)) {
      return new Response('Not Found', { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).href);
  });
}

/**
 * Dev-server origin or packaged `testrix://` index URL.
 */
export function resolveRendererOrigin(): string {
  if (usesAngularDevServer()) {
    return resolveDevServerOrigin();
  }
  return BROWSER_PROTOCOL_BASE;
}
