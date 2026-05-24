import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

import type { BundleSelection } from '@shared/import-export';
import type { ImportFormatKind, TestrixBundleV1 } from '@shared/import-export';

export type ImportExportMode = 'import' | 'export';

export interface ImportExportDialogState {
  readonly mode: ImportExportMode;
  readonly bundle: TestrixBundleV1;
  readonly sourceLabel: string;
  readonly format?: ImportFormatKind | 'legacy_envelope';
  readonly initialSelection?: Partial<BundleSelection>;
}

export interface ImportExportApplyResult {
  readonly summary: string;
}

@Injectable({ providedIn: 'root' })
export class ImportExportDialogService {
  private readonly stateSubject = new Subject<ImportExportDialogState | null>();
  private readonly finishedSubject = new Subject<ImportExportApplyResult | null>();

  readonly state$ = this.stateSubject.asObservable();
  readonly finished$ = this.finishedSubject.asObservable();

  openImport(
    bundle: TestrixBundleV1,
    sourceLabel: string,
    format?: ImportFormatKind | 'legacy_envelope',
  ): void {
    this.stateSubject.next({ mode: 'import', bundle, sourceLabel, format });
  }

  openImportFromText(raw: string, sourceLabel: string, parse: (raw: string, label: string) => {
    bundle: TestrixBundleV1;
    format: ImportFormatKind | 'legacy_envelope';
  }): { ok: true } | { ok: false; error: string } {
    try {
      const { bundle, format } = parse(raw, sourceLabel);
      this.openImport(bundle, sourceLabel, format);
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : 'Could not parse file.' };
    }
  }

  openExport(bundle: TestrixBundleV1, initialSelection?: Partial<BundleSelection>): void {
    this.stateSubject.next({
      mode: 'export',
      bundle,
      sourceLabel: 'Workspace',
      initialSelection,
    });
  }

  close(): void {
    this.stateSubject.next(null);
  }

  notifyFinished(result: ImportExportApplyResult | null): void {
    this.finishedSubject.next(result);
  }
}
