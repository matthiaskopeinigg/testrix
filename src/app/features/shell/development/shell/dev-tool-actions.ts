import { inject } from '@angular/core';

import { DevToolClipboardService } from './dev-tool-clipboard.service';

/**
 * Copies text and shows a success toast when clipboard write succeeds.
 */
export function copyDevToolWithToast(text: string, label = 'Copied'): Promise<boolean> {
  return inject(DevToolClipboardService).copy(text, label);
}
