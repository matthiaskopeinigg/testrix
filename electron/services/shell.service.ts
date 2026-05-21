import { shell } from 'electron';

import { isSafeExternalOpenUrl } from '../windows/main-window/external-link-handlers';

/**
 * Opens a URL in the user's default browser (or mail/tel handler).
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!isSafeExternalOpenUrl(url)) {
    throw new Error('URL is not allowed for external open');
  }

  await shell.openExternal(url);
}
