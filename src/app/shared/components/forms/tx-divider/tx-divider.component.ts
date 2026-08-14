import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'tx-divider',
  standalone: true,
  template: '<hr class="tx-divider" [attr.role]="decorative() ? \'presentation\' : \'separator\'" />',
  styleUrl: './tx-divider.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'tx-divider-host' },
})
export class TxDividerComponent {
  /** When true, the divider is purely visual (no separator semantics). */
  readonly decorative = input(true);
}
