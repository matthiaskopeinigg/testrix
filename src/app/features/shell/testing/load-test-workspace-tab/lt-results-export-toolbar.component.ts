import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

import {
  buildLoadTestRunReport,
  serializeLoadTestRunExport,
  type LoadTestRunRecord,
} from '@shared/testing';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';

@Component({
  selector: 'app-lt-results-export-toolbar',
  standalone: true,
  imports: [TxButtonComponent],
  template: `
    <div class="lt-export-toolbar" aria-label="Run export actions">
      <tx-button variant="secondary" [disabled]="!record()" (pressed)="handleCopyJson()">
        Copy JSON
      </tx-button>
      <tx-button variant="secondary" [disabled]="!record()" (pressed)="handleCopyReport()">
        Copy report
      </tx-button>
      <tx-button variant="secondary" [disabled]="!record()" (pressed)="handleDownload()">
        Download JSON
      </tx-button>
      @if (feedback()) {
        <span class="lt-export-toolbar__feedback">{{ feedback() }}</span>
      }
    </div>
  `,
  styleUrl: './lt-results-export-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtResultsExportToolbarComponent {
  readonly record = input<LoadTestRunRecord | null>(null);

  readonly exported = output<{ readonly kind: 'json' | 'report' | 'download' }>();

  protected readonly feedback = signal('');

  protected async handleCopyJson(): Promise<void> {
    const record = this.record();
    if (!record) {
      return;
    }
    await navigator.clipboard.writeText(serializeLoadTestRunExport(record));
    this.showFeedback('JSON copied');
    this.exported.emit({ kind: 'json' });
  }

  protected async handleCopyReport(): Promise<void> {
    const record = this.record();
    if (!record) {
      return;
    }
    await navigator.clipboard.writeText(buildLoadTestRunReport(record));
    this.showFeedback('Report copied');
    this.exported.emit({ kind: 'report' });
  }

  protected handleDownload(): void {
    const record = this.record();
    if (!record) {
      return;
    }
    const blob = new Blob([serializeLoadTestRunExport(record)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `load-test-run-${record.id}.json`;
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
