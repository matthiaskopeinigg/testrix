import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { TxHintLayerService } from './tx-hint-layer.service';

@Component({
  selector: 'tx-hint-layer',
  standalone: true,
  templateUrl: './tx-hint-layer.component.html',
  styleUrl: './tx-hint-layer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxHintLayerComponent {
  readonly layer = inject(TxHintLayerService);
}
