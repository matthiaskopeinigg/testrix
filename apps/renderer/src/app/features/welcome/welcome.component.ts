import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TxButtonComponent, TxHintComponent } from '@testrix/ui';

import { ShellStateService } from '../../core/shell-state.service';

@Component({
  selector: 'tx-welcome',
  standalone: true,
  imports: [TxButtonComponent, TxHintComponent],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WelcomeComponent {
  readonly shell = inject(ShellStateService);

  handleBrowseCollections(): void {
    this.shell.activeRail.set('collections');
    this.shell.showSidebar();
  }
}
