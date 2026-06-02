import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';

@Component({
  selector: 'app-testing-workspace-tab-shell',
  standalone: true,
  imports: [TxBannerComponent, TxButtonComponent],
  templateUrl: './testing-workspace-tab-shell.component.html',
  styleUrl: './testing-workspace-tab-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestingWorkspaceTabShellComponent {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly primaryActionLabel = input<string | null>(null);
  readonly primaryAction = output<void>();
}
