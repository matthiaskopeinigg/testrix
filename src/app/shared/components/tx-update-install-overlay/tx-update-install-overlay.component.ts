import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { UpdateService } from '@app/core/updater/update.service';

import { TxSpinnerComponent } from '../tx-spinner/tx-spinner.component';
import { TxIconComponent } from '../tx-icon/tx-icon.component';

@Component({
  selector: 'tx-update-install-overlay',
  standalone: true,
  imports: [TxSpinnerComponent, TxIconComponent],
  templateUrl: './tx-update-install-overlay.component.html',
  styleUrl: './tx-update-install-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-update-install-overlay-host',
    '[class.tx-update-install-overlay-host--visible]': 'visible()',
  },
})
export class TxUpdateInstallOverlayComponent {
  private readonly updates = inject(UpdateService);

  readonly visible = input(false);

  protected readonly versionLabel = computed(() => {
    const version = this.updates.status().info?.version;
    return version ? `v${version}` : null;
  });
}
