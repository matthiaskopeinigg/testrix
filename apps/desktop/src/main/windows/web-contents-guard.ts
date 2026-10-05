import { shell, type Session, type WebContents } from 'electron';

import { appLogger } from '@testrix/electron-core';

import { isTrustedSenderUrl } from '../ipc/ipc-handle';

const WORKBENCH_PERMISSIONS: ReadonlySet<string> = new Set([
  'clipboard-read',
  'clipboard-sanitized-write',
  'fullscreen',
]);

/** http(s) links leave the app through the system browser; nothing else is opened. */
export function openExternalIfWeb(url: string): void {
  if (!isWebUrl(url))
    return;
  shell.openExternal(url).catch((error: unknown) => appLogger.warn('navigation', `Could not open ${url}: ${String(error)}`));
}

/**
 * Locks a workbench `WebContents` to the app: no popups, no top-level navigation,
 * no `<webview>`. Links to the web open in the system browser instead.
 */
export function guardWorkbenchContents(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    openExternalIfWeb(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (isWebUrl(url) && !isTrustedSenderUrl(url))
      openExternalIfWeb(url);
  });
  contents.on('will-redirect', (event, url) => {
    if (!isTrustedSenderUrl(url))
      event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
}

/** The workbench gets clipboard and fullscreen; every other permission is refused. */
export function installWorkbenchPermissions(target: Session): void {
  target.setPermissionRequestHandler((contents, permission, callback, details) => {
    const url = details.requestingUrl || contents?.getURL() || '';
    const isAllowed = isWorkbenchPermission(permission, url);
    if (!isAllowed)
      appLogger.debug('permissions', `Denied ${permission} for ${url || '(unknown)'}`);
    callback(isAllowed);
  });
  target.setPermissionCheckHandler((_contents, permission, requestingOrigin) =>
    isWorkbenchPermission(permission, requestingOrigin),
  );
}

export function isWorkbenchPermission(permission: string, url: string): boolean {
  return WORKBENCH_PERMISSIONS.has(permission) && isTrustedSenderUrl(url);
}

function isWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}
