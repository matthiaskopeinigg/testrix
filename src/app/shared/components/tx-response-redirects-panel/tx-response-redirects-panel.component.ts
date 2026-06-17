import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';

import { ElectronService } from '@app/core/electron/electron.service';
import type { HttpResponseRedirectHop } from '@shared/http/outgoing-request.schema';
import { copyTextToClipboard } from '@shared/http/response-clipboard';

import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxTooltipDirective } from '../tx-tooltip/tx-tooltip.directive';

@Component({
  selector: 'tx-response-redirects-panel',
  standalone: true,
  imports: [TxButtonComponent, TxIconComponent, TxTooltipDirective],
  templateUrl: './tx-response-redirects-panel.component.html',
  styleUrl: './tx-response-redirects-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxResponseRedirectsPanelComponent {
  private readonly electron = inject(ElectronService);

  readonly redirects = input<readonly HttpResponseRedirectHop[]>([]);

  protected readonly copiedUrl = signal<string | null>(null);

  protected async handleCopy(url: string): Promise<void> {
    const ok = await copyTextToClipboard(url);
    if (ok) {
      this.copiedUrl.set(url);
      setTimeout(() => this.copiedUrl.set(null), 1200);
    }
  }

  protected handleOpen(url: string): void {
    void this.electron.bridge()?.openExternal(url);
  }
}
