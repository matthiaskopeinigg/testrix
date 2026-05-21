import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type TxSpinnerSize = 'sm' | 'md';

@Component({
  selector: 'tx-spinner',
  standalone: true,
  templateUrl: './tx-spinner.component.html',
  styleUrl: './tx-spinner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'status',
    'aria-live': 'polite',
    '[attr.aria-label]': 'ariaLabel()',
    '[attr.data-size]': 'size()',
  },
})
export class TxSpinnerComponent {
  readonly size = input<TxSpinnerSize>('md');
  readonly ariaLabel = input('Loading');
}
