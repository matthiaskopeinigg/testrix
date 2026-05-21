import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { TxIconName } from '@app/shared/icons';

import { TxIconComponent } from '../tx-icon/tx-icon.component';
import type { TxNotificationTone } from './tx-notification.types';

const TONE_ICONS: Record<TxNotificationTone, TxIconName> = {
  success: 'checkCircle',
  error: 'error',
  info: 'info',
  warning: 'warning',
};

@Component({
  selector: 'tx-notification',
  standalone: true,
  imports: [TxIconComponent],
  templateUrl: './tx-notification.component.html',
  styleUrl: './tx-notification.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-notification-host-item',
    '[attr.data-tone]': 'tone()',
    role: 'status',
  },
})
export class TxNotificationComponent {
  readonly message = input.required<string>();
  readonly tone = input<TxNotificationTone>('info');
  readonly dismissible = input(true);

  readonly dismissed = output<void>();

  protected readonly iconName = computed((): TxIconName => TONE_ICONS[this.tone()]);

  protected handleDismiss(): void {
    this.dismissed.emit();
  }
}
