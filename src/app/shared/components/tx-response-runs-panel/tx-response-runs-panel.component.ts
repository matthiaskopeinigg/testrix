import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import type { HttpResponseSnapshot } from '@shared/http/outgoing-request.schema';
import { formatRunLabel } from '@shared/http/format-run-label';

import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxTagComponent } from '../tx-tag/tx-tag.component';

@Component({
  selector: 'tx-response-runs-panel',
  standalone: true,
  imports: [TxButtonComponent, TxIconComponent, TxTagComponent],
  templateUrl: './tx-response-runs-panel.component.html',
  styleUrl: './tx-response-runs-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxResponseRunsPanelComponent {
  readonly runs = input<readonly HttpResponseSnapshot[]>([]);
  readonly selectedRunId = input<string | null>(null);
  readonly pinnedBaselineId = input<string | null>(null);

  readonly runSelect = output<string>();
  readonly pinBaseline = output<string>();
  readonly deleteRun = output<string>();

  protected formatLabel(run: HttpResponseSnapshot): string {
    return formatRunLabel(run);
  }

  protected statusVariant(code: number): 'success' | 'warning' | 'error' | 'info' | 'default' {
    if (code >= 200 && code < 300) {
      return 'success';
    }
    if (code >= 400) {
      return 'error';
    }
    if (code >= 300) {
      return 'warning';
    }
    return 'info';
  }

  protected handleRestore(id: string): void {
    this.runSelect.emit(id);
  }

  protected handlePin(id: string): void {
    this.pinBaseline.emit(id);
  }
}
