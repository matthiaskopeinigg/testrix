import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxModalComponent } from '@app/shared/components/tx-modal/tx-modal.component';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';

import {
  BatchImportDialogService,
  type BatchImportDialogState,
  type BatchImportPreviewRow,
} from '@app/core/import-export/batch-import-dialog.service';
import { ImportExportFlowService } from '@app/core/import-export/import-export-flow.service';
import { ImportExportDialogService } from '@app/core/import-export/import-export-dialog.service';

@Component({
  selector: 'tx-batch-import-dialog',
  standalone: true,
  imports: [FormsModule, TxModalComponent, TxButtonComponent],
  templateUrl: './tx-batch-import-dialog.component.html',
  styleUrl: './tx-batch-import-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxBatchImportDialogComponent {
  private readonly dialog = inject(BatchImportDialogService);
  private readonly flow = inject(ImportExportFlowService);
  private readonly importDialog = inject(ImportExportDialogService);
  private readonly notifications = inject(TxNotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly open = signal(false);
  protected readonly state = signal<BatchImportDialogState | null>(null);
  protected readonly rows = signal<BatchImportPreviewRow[]>([]);

  constructor() {
    this.dialog.state$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((next) => {
      if (!next) {
        this.open.set(false);
        this.state.set(null);
        return;
      }
      this.state.set(next);
      this.rows.set(next.rows.map((r) => ({ ...r })));
      this.open.set(true);
    });
  }

  protected formatLabel(row: BatchImportPreviewRow): string {
    return this.flow.formatKindLabel(row.format);
  }

  protected handleToggle(row: BatchImportPreviewRow): void {
    this.rows.update((list) =>
      list.map((r) => (r.path === row.path ? { ...r, selected: !r.selected } : r)),
    );
  }

  protected handleClose(): void {
    this.dialog.close();
  }

  protected handleContinue(): void {
    try {
      this.flow.mergeSelectedBatchRows(this.rows());
      this.dialog.close();
    } catch (e: unknown) {
      this.notifications.showError(e instanceof Error ? e.message : 'Import failed.');
    }
  }
}
