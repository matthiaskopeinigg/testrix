import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  buildLoadRunReport,
  generateGatlingSimulation,
  generateK6Script,
  generateLoadHtmlReport,
  serializeLoadRunExport,
  type LoadArtifactFields,
  type LoadExportContext,
  type LoadRunRecord,
} from '@testrix/contracts';
import { TxButtonComponent, TxHintComponent } from '@testrix/ui';

export type LtExportKind = 'json' | 'report' | 'download' | 'html' | 'k6' | 'gatling';

/** Artifact identity required to build export scripts. */
export type LtExportArtifact = LoadArtifactFields & { readonly id: string; readonly name: string };

/**
 * Export actions for a saved run: JSON, plain report, HTML, k6, and Gatling.
 */
@Component({
  selector: 'tx-lt-results-export-toolbar',
  standalone: true,
  imports: [TxButtonComponent, TxHintComponent],
  templateUrl: './lt-results-export-toolbar.component.html',
  styleUrl: './lt-results-export-toolbar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtResultsExportToolbarComponent {
  readonly record = input<LoadRunRecord | null>(null);
  readonly artifact = input<LtExportArtifact | null>(null);

  readonly exported = output<{ readonly kind: LtExportKind }>();

  readonly feedback = signal('');
  readonly canScriptExport = computed(() => Boolean(this.record() && this.artifact()));

  async handleCopyJson(): Promise<void> {
    const record = this.record();
    if (!record)
      return;
    await copyText(serializeLoadRunExport(record));
    this.showFeedback('JSON copied');
    this.exported.emit({ kind: 'json' });
  }

  async handleCopyReport(): Promise<void> {
    const context = this.exportContext();
    if (!context)
      return;
    await copyText(buildLoadRunReport(context));
    this.showFeedback('Report copied');
    this.exported.emit({ kind: 'report' });
  }

  handleDownload(): void {
    const record = this.record();
    if (!record)
      return;
    download(`load-test-run-${record.id}.json`, serializeLoadRunExport(record), 'application/json');
    this.showFeedback('Download started');
    this.exported.emit({ kind: 'download' });
  }

  handleSaveHtml(): void {
    const context = this.exportContext();
    if (!context)
      return;
    download(`load-test-${context.run.id}.html`, generateLoadHtmlReport(context), 'text/html');
    this.showFeedback('HTML report saved');
    this.exported.emit({ kind: 'html' });
  }

  handleSaveK6(): void {
    const context = this.exportContext();
    if (!context)
      return;
    download(`load-test-${context.artifact.id}.k6.js`, generateK6Script(context), 'text/javascript');
    this.showFeedback('k6 script saved');
    this.exported.emit({ kind: 'k6' });
  }

  handleSaveGatling(): void {
    const context = this.exportContext();
    if (!context)
      return;
    const className = context.artifact.name.replace(/[^A-Za-z0-9]+/g, '') || 'Testrix';
    download(`${className}Simulation.scala`, generateGatlingSimulation(context), 'text/plain');
    this.showFeedback('Gatling stub saved');
    this.exported.emit({ kind: 'gatling' });
  }

  private exportContext(): LoadExportContext | null {
    const artifact = this.artifact();
    const run = this.record();
    if (!artifact || !run)
      return null;
    return { artifact, run };
  }

  private showFeedback(message: string): void {
    this.feedback.set(message);
    window.setTimeout(() => {
      if (this.feedback() === message)
        this.feedback.set('');
    }, 2000);
  }
}

function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText)
    return navigator.clipboard.writeText(value);
  return Promise.reject(new Error('Clipboard unavailable'));
}

function download(name: string, contents: string, mime: string): void {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
