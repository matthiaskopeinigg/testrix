import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'tx-empty-state',
  standalone: true,
  templateUrl: './tx-empty-state.component.html',
  styleUrl: './tx-empty-state.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxEmptyStateComponent {
  readonly title = input('Nothing here yet');
  readonly body = input('');
}
