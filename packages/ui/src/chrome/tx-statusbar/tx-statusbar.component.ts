import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'tx-statusbar',
  standalone: true,
  templateUrl: './tx-statusbar.component.html',
  styleUrl: './tx-statusbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxStatusbarComponent {
  readonly locality = input('Local');
  readonly version = input('');
  readonly motionSpeed = input('normal');
}
