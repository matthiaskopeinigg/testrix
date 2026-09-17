import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TxHintComponent } from '../../primitives/tx-hint/tx-hint.component';

@Component({
  selector: 'tx-window-titlebar',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './tx-window-titlebar.component.html',
  styleUrl: './tx-window-titlebar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxWindowTitlebarComponent {
  readonly logoSrc = input('assets/logo.svg');
  readonly productName = input('Testrix');
  readonly platform = input('win32');
  readonly isMaximized = input(false);
  readonly minimize = output();
  readonly maximize = output();
  readonly close = output();
  readonly openSettings = output();
}
