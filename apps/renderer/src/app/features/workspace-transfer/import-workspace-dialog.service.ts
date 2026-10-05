import { Injectable, signal } from '@angular/core';
import type { WorkspaceImportInspectResult } from '@testrix/contracts';

export type ImportWizardStep = 'format' | 'mode' | 'selection';

/**
 * Opens the import workspace wizard with a prior inspect result.
 */
@Injectable({ providedIn: 'root' })
export class ImportWorkspaceDialogService {
  readonly open = signal(false);
  readonly inspect = signal<WorkspaceImportInspectResult | null>(null);
  readonly step = signal<ImportWizardStep>('format');

  show(result: WorkspaceImportInspectResult): void {
    this.inspect.set(result);
    this.step.set('format');
    this.open.set(true);
  }

  hide(): void {
    this.open.set(false);
    this.inspect.set(null);
    this.step.set('format');
  }

  setStep(step: ImportWizardStep): void {
    this.step.set(step);
  }
}
