import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { TxHintComponent } from '../../primitives/tx-hint/tx-hint.component';
import { TxToastService } from './tx-toast.service';

@Component({
  selector: 'tx-toast-layer',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './tx-toast.component.html',
  styleUrl: './tx-toast.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxToastLayerComponent {
  readonly toasts = inject(TxToastService);
}
