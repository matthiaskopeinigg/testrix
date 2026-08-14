import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { TxBrandLogoComponent } from '@app/shared/components/chrome/tx-brand-logo/tx-brand-logo.component';

@Component({
  selector: 'app-ds-brand-panel',
  standalone: true,
  imports: [TxBrandLogoComponent],
  templateUrl: './ds-brand-panel.component.html',
  styleUrl: './ds-brand-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsBrandPanelComponent {
  readonly sectionId = input.required<string>();
}
