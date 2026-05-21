import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';

import { ErrorNotificationService } from '@app/core/errors/error-notification.service';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxModalComponent } from '@app/shared/components/tx-modal/tx-modal.component';

@Component({
  selector: 'app-ds-ui-kit-panel',
  standalone: true,
  imports: [TxButtonComponent, TxIconComponent, TxModalComponent],
  templateUrl: './ds-ui-kit-panel.component.html',
  styleUrl: './ds-ui-kit-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsUiKitPanelComponent {
  readonly sectionId = input.required<string>();

  private readonly notifier = inject(ErrorNotificationService);

  readonly modalOpen = signal(false);

  showError(): void {
    this.notifier.reportFromMessage('Request failed', 'Could not reach the upstream API.');
  }

  openModal(): void {
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }
}
