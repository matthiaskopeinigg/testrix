import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { buildDiffDisplayRows, DIFF_MAX_PAIRED_LINES } from '@shared/http/diff-side-by-side';
import type { ResponseDiffResult } from '@shared/http/response-diff';

@Component({
  selector: 'tx-diff-view',
  standalone: true,
  templateUrl: './tx-diff-view.component.html',
  styleUrl: './tx-diff-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxDiffViewComponent {
  protected readonly DIFF_MAX_PAIRED_LINES = DIFF_MAX_PAIRED_LINES;

  readonly diff = input<ResponseDiffResult | null>(null);
  /** API Workbench layout: toolbar stats live in parent; body is side-by-side grid only. */
  readonly workbenchLayout = input(false);

  protected readonly bodyDisplay = computed(() => {
    const hunks = this.diff()?.lineHunks ?? [];
    if (hunks.length === 0) {
      return null;
    }
    return buildDiffDisplayRows(hunks, DIFF_MAX_PAIRED_LINES, { collapseUnchanged: false });
  });

  protected readonly hasTextBody = computed(() => {
    const d = this.diff();
    return !!d && d.bodyMode === 'text' && d.lineHunks.length > 0;
  });

  protected readonly hasJsonBody = computed(() => {
    const d = this.diff();
    return !!d && d.bodyMode === 'json' && d.jsonPaths.length > 0;
  });
}
