import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';

import {
  buildLoadTestRunReport,
  generateGatlingSimulation,
  generateK6Script,
  generateLoadTestHtmlReport,
  serializeLoadTestRunExport,
  type LoadTestArtifact,
  type LoadTestRunRecord,
} from '@shared/testing';

import { FileDialogService } from '@app/core/platform/file-dialog.service';
import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';

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
      <tx-button variant="secondary" [disabled]="!canScriptExport()" (pressed)="handleSaveHtml()">
        HTML report
      </tx-button>
      <tx-button variant="secondary" [disabled]="!canScriptExport()" (pressed)="handleSaveK6()">
        k6
      </tx-button>
      <tx-button variant="secondary" [disabled]="!canScriptExport()" (pressed)="handleSaveGatling()">
        Gatling
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
  private readonly files = inject(FileDialogService);

  readonly record = input<LoadTestRunRecord | null>(null);
  readonly artifact = input<LoadTestArtifact | null>(null);

  readonly exported = output<{ readonly kind: 'json' | 'report' | 'download' | 'html' | 'k6' | 'gatling' }>();

  protected readonly feedback = signal('');

  protected canScriptExport(): boolean {
    return Boolean(this.record() && this.artifact());
  }

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

  protected async handleSaveHtml(): Promise<void> {
    const context = this.exportContext();
    if (!context) {
      return;
    }
    const path = await this.files.saveText(generateLoadTestHtmlReport(context), `load-test-${context.record.id}.html`, [
      { name: 'HTML', extensions: ['html'] },
    ]);
    if (path) {
      this.showFeedback('HTML report saved');
      this.exported.emit({ kind: 'html' });
    }
  }

  protected async handleSaveK6(): Promise<void> {
    const context = this.exportContext();
    if (!context) {
      return;
    }
    const path = await this.files.saveText(generateK6Script(context), `load-test-${context.artifact.id}.k6.js`, [
      { name: 'JavaScript', extensions: ['js'] },
    ]);
    if (path) {
      this.showFeedback('k6 script saved');
      this.exported.emit({ kind: 'k6' });
    }
  }

  protected async handleSaveGatling(): Promise<void> {
    const context = this.exportContext();
    if (!context) {
      return;
    }
    const path = await this.files.saveText(
      generateGatlingSimulation(context),
      `${context.artifact.name.replace(/[^A-Za-z0-9]+/g, '') || 'Testrix'}Simulation.scala`,
      [{ name: 'Scala', extensions: ['scala'] }],
    );
    if (path) {
      this.showFeedback('Gatling stub saved');
      this.exported.emit({ kind: 'gatling' });
    }
  }

  private exportContext() {
    const artifact = this.artifact();
    const record = this.record();
    if (!artifact || !record) {
      return null;
    }
    return { artifact, record };
  }

  private showFeedback(message: string): void {
    this.feedback.set(message);
    setTimeout(() => this.feedback.set(''), 2000);
  }
}
