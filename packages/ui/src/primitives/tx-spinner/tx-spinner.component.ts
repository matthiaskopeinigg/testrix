import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'tx-spinner',
  standalone: true,
  templateUrl: './tx-spinner.component.html',
  styleUrl: './tx-spinner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'tx-spinner',
    '[attr.aria-busy]': '"true"',
    '[attr.aria-label]': 'label()',
    role: 'status',
  },
})
export class TxSpinnerComponent {
  readonly label = input('Loading');
  readonly size = input<'sm' | 'md'>('sm');
}
