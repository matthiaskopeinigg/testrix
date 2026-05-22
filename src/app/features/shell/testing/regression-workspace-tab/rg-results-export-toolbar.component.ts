import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

import {
  buildRegressionDiffReport,
  buildRegressionRunReport,
  serializeRegressionRunExport,
  type RegressionRun,
} from '@shared/testing';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';

@Component({
  selector: 'app-rg-results-export-toolbar',
  standalone: true,
  imports: [TxButtonComponent],
  template: `
    <div class="rg-export-toolbar" aria-label="Run export actions">
      <tx-button variant="secondary" [disabled]="!record()" (pressed)="handleCopyJson()">
        Copy JSON
      </tx-button>
      <tx-button variant="secondary" [disabled]="!record()" (pressed)="handleCopyReport()">
        Copy report
      </tx-button>
      <tx-button variant="secondary" [disabled]="!record()" (pressed)="handleDownload()">
        Download JSON
      </tx-button>
      @if (compareRecord()) {
        <tx-button variant="secondary" (pressed)="handleCopyDiffReport()">
          Copy diff
        </tx-button>
      }
      @if (feedback()) {
        <span class="rg-export-toolbar__feedback">{{ feedback() }}</span>
      }
    </div>
  `,
  styleUrl: './rg-results-export-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgResultsExportToolbarComponent {
  readonly record = input<RegressionRun | null>(null);
  readonly compareRecord = input<RegressionRun | null>(null);

  readonly exported = output<{ readonly kind: 'json' | 'report' | 'download' | 'diff' }>();

  protected readonly feedback = signal('');

  protected async handleCopyJson(): Promise<void> {
    const record = this.record();
    if (!record) {
      return;
    }
    await navigator.clipboard.writeText(serializeRegressionRunExport(record));
    this.showFeedback('JSON copied');
    this.exported.emit({ kind: 'json' });
  }

  protected async handleCopyReport(): Promise<void> {
    const record = this.record();
    if (!record) {
      return;
    }
    await navigator.clipboard.writeText(buildRegressionRunReport(record));
    this.showFeedback('Report copied');
    this.exported.emit({ kind: 'report' });
  }

  protected async handleCopyDiffReport(): Promise<void> {
    const record = this.record();
    const compare = this.compareRecord();
    if (!record || !compare) {
      return;
    }
    await navigator.clipboard.writeText(buildRegressionDiffReport(compare, record));
    this.showFeedback('Diff copied');
    this.exported.emit({ kind: 'diff' });
  }

  protected handleDownload(): void {
    const record = this.record();
    if (!record) {
      return;
    }
    const blob = new Blob([serializeRegressionRunExport(record)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `regression-run-${record.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.showFeedback('Download started');
    this.exported.emit({ kind: 'download' });
  }

  private showFeedback(message: string): void {
    this.feedback.set(message);
    setTimeout(() => this.feedback.set(''), 2000);
  }
}
