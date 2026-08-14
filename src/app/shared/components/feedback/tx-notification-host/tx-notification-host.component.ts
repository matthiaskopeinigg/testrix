import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { TxNotificationService } from '@app/core/notifications/tx-notification.service';

import { TxNotificationComponent } from '../tx-notification/tx-notification.component';

@Component({
  selector: 'tx-notification-host',
  standalone: true,
  imports: [TxNotificationComponent],
  templateUrl: './tx-notification-host.component.html',
  styleUrl: './tx-notification-host.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxNotificationHostComponent {
  private readonly notifications = inject(TxNotificationService);

  protected readonly active = this.notifications.active;

  protected handleDismiss(id: string): void {
    this.notifications.dismiss(id);
  }
}
