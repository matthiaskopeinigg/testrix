import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import type { TxIconName } from '@app/shared/icons';

import { TxIconComponent } from '../tx-icon/tx-icon.component';

export type TxBannerVariant = 'info' | 'success' | 'warning' | 'error';

const DEFAULT_ICONS: Record<TxBannerVariant, TxIconName> = {
  info: 'info',
  success: 'check',
  warning: 'warning',
  error: 'error',
};

@Component({
  selector: 'tx-banner',
  standalone: true,
  imports: [TxIconComponent],
  templateUrl: './tx-banner.component.html',
  styleUrl: './tx-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-banner-host',
    '[attr.data-variant]': 'variant()',
    '[attr.role]': 'bannerRole()',
  },
})
export class TxBannerComponent {
  readonly variant = input<TxBannerVariant>('info');
  readonly title = input<string | undefined>(undefined);
  readonly dismissible = input(false);
  readonly showIcon = input(true);
  readonly icon = input<TxIconName | undefined>(undefined);
  readonly compact = input(false);

  readonly dismissed = output<void>();

  protected readonly isDismissed = signal(false);

  protected readonly bannerRole = computed(() =>
    this.variant() === 'error' || this.variant() === 'warning' ? 'alert' : 'status',
  );

  protected readonly resolvedIcon = computed(
    (): TxIconName => this.icon() ?? DEFAULT_ICONS[this.variant()],
  );

  protected handleDismiss(): void {
    this.isDismissed.set(true);
    this.dismissed.emit();
  }
}
