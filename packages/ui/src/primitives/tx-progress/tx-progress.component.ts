import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'tx-progress',
  standalone: true,
  templateUrl: './tx-progress.component.html',
  styleUrl: './tx-progress.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxProgressComponent {
  readonly value = input<number | null>(null);
  readonly label = input('Working…');
}
