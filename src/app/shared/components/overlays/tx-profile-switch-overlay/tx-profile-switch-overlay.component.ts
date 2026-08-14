import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { TxIconComponent } from '../../forms/tx-icon/tx-icon.component';
import { TxSpinnerComponent } from '../../feedback/tx-spinner/tx-spinner.component';

@Component({
  selector: 'tx-profile-switch-overlay',
  standalone: true,
  imports: [TxIconComponent, TxSpinnerComponent],
  templateUrl: './tx-profile-switch-overlay.component.html',
  styleUrl: './tx-profile-switch-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-profile-switch-overlay-host',
    '[class.tx-profile-switch-overlay-host--visible]': 'visible()',
  },
})
export class TxProfileSwitchOverlayComponent {
  readonly visible = input(false);
  readonly title = input('Switching profile');
  readonly description = input('Loading workspace data…');
}
