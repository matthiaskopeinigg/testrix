import { Injectable, inject } from '@angular/core';

import { TxNotificationService } from '@app/core/notifications/tx-notification.service';

/**
 * Copies development-tool text with toast feedback.
 */
@Injectable({ providedIn: 'root' })
export class DevToolClipboardService {
  private readonly notifications = inject(TxNotificationService);

  async copy(text: string, label = 'Copied'): Promise<boolean> {
    if (!text) {
      return false;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.notifications.showSuccess(label);
      return true;
    } catch {
      this.notifications.showError('Could not copy to clipboard');
      return false;
    }
  }
}
