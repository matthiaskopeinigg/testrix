import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { HttpRequestService } from '@app/core/http/http-request.service';
import type { HttpResponseSnapshot } from '@shared/http/outgoing-request.schema';
import type { ResponseDiffResult } from '@shared/http/response-diff';
import { formatRunLabel } from '@shared/http/format-run-label';

import { TxButtonComponent } from '../tx-button/tx-button.component';
import { TxDiffViewComponent } from '../tx-diff-view/tx-diff-view.component';
import { TxDropdownComponent } from '../tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '../tx-dropdown/tx-dropdown.types';
import { TxIconComponent } from '../tx-icon/tx-icon.component';
import { TxToggleComponent } from '../tx-toggle/tx-toggle.component';

@Component({
  selector: 'tx-response-diff-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxDropdownComponent,
    TxToggleComponent,
    TxButtonComponent,
    TxIconComponent,
    TxDiffViewComponent,
  ],
  templateUrl: './tx-response-diff-panel.component.html',
  styleUrl: './tx-response-diff-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxResponseDiffPanelComponent {
  private readonly http = inject(HttpRequestService);

  readonly diff = input<ResponseDiffResult | null>(null);
  readonly runs = input<readonly HttpResponseSnapshot[]>([]);
  readonly selectedRunId = input<string | null>(null);
  readonly pinnedBaselineId = input<string | null>(null);
  readonly compareBaselineId = input<string | null>(null);

  readonly compareAgainstChange = output<string>();
  readonly refreshDiff = output<void>();

  protected readonly normalizeJson = signal(true);
  protected readonly pinnedOnly = signal(false);

  protected readonly compareOptions = computed((): readonly TxDropdownOption[] => {
    const selected = this.selectedRunId();
    let list = this.runs().filter((r) => r.id !== selected);
    if (this.pinnedOnly()) {
      const pin = this.pinnedBaselineId();
      list = list.filter((r) => r.id === pin);
    }
    return list.map((r) => ({ value: r.id, label: formatRunLabel(r) }));
  });

  protected readonly compareAgainstValue = computed(() => {
    const explicit = this.compareBaselineId();
    if (explicit) {
      return explicit;
    }
    return this.compareOptions()[0]?.value ?? '';
  });

  protected readonly canCompare = computed(() => this.runs().length >= 2);

  protected readonly summary = computed(() => {
    const d = this.diff();
    if (!d) {
      return { added: 0, removed: 0, equal: 0 };
    }
    if (d.bodyMode === 'json') {
      const added = d.jsonPaths.filter((p) => p.kind === 'added').length + d.summary.headersAdded;
      const removed =
        d.jsonPaths.filter((p) => p.kind === 'removed').length + d.summary.headersRemoved;
      return { added, removed, equal: 0 };
    }
    const added =
      d.lineHunks.filter((h) => h.kind === 'add').length + d.summary.headersAdded;
    const removed =
      d.lineHunks.filter((h) => h.kind === 'remove').length + d.summary.headersRemoved;
    const equal = d.lineHunks.filter((h) => h.kind === 'unchanged').length;
    return { added, removed, equal };
  });

  protected handleCompareChange(runId: string): void {
    if (runId) {
      this.compareAgainstChange.emit(runId);
    }
  }

  protected handleNormalizeChange(checked: boolean): void {
    this.normalizeJson.set(checked);
    this.http.setDiffCompareOptions({ normalizeJson: checked });
  }

  protected handlePinnedOnlyChange(checked: boolean): void {
    this.pinnedOnly.set(checked);
  }

  protected handleRefresh(): void {
    this.refreshDiff.emit();
  }
}
