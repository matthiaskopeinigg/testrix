import { Injectable, inject } from '@angular/core';

import { detectImportFormat, formatImportKindLabel, mergeBundles } from '@shared/import-export';

import { BatchImportDialogService, type BatchImportPreviewRow } from './batch-import-dialog.service';
import { ImportExportDialogService } from './import-export-dialog.service';
import { WorkspaceBundleService } from './workspace-bundle.service';
import type { PickedFileContent } from '../platform/file-dialog.service';

/**
 * Routes file picks and drops to the unified or batch import dialogs.
 */
@Injectable({ providedIn: 'root' })
export class ImportExportFlowService {
  private readonly bundleService = inject(WorkspaceBundleService);
  private readonly importDialog = inject(ImportExportDialogService);
  private readonly batchDialog = inject(BatchImportDialogService);

  openFromText(raw: string, sourceLabel: string): { ok: true } | { ok: false; error: string } {
    return this.importDialog.openImportFromText(raw, sourceLabel, (text, label) =>
      this.bundleService.parseFileToBundle(text, label),
    );
  }

  /** Drag-and-drop: single file opens preview; multiple files merge into one preview. */
  openFromFiles(files: readonly PickedFileContent[]): void {
    if (files.length === 0) {
      return;
    }
    if (files.length === 1) {
      const file = files[0]!;
      const result = this.openFromText(file.content, file.fileName);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return;
    }

    const parsedBundles = files.map((file) =>
      this.bundleService.parseFileToBundle(file.content, file.fileName).bundle,
    );
    this.importDialog.openImport(mergeBundles(parsedBundles), `${files.length} files`, 'testrix');
  }

  /** File picker with multiple files: show batch review table first. */
  openBatchReview(files: readonly PickedFileContent[]): void {
    if (files.length === 0) {
      return;
    }
    if (files.length === 1) {
      const file = files[0]!;
      const result = this.openFromText(file.content, file.fileName);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return;
    }

    const rows: BatchImportPreviewRow[] = files.map((file) => {
      let format = detectImportFormat(file.fileName, file.content) as BatchImportPreviewRow['format'];
      let title = file.fileName;
      let schemaVersion: number | null = null;
      try {
        const parsed = JSON.parse(file.content) as Record<string, unknown>;
        if (typeof parsed['schemaVersion'] === 'number') {
          schemaVersion = parsed['schemaVersion'];
        }
        if (parsed['schema'] === 'testrix/v1') {
          format = 'testrix';
        }
      } catch {
        /* yaml / non-json handled at import time */
      }
      return {
        path: file.filePath,
        basename: file.fileName,
        format,
        title,
        schemaVersion,
        raw: file.content,
        selected: format !== 'unknown',
      };
    });
    this.batchDialog.open(rows);
  }

  mergeSelectedBatchRows(rows: readonly BatchImportPreviewRow[]): void {
    const selected = rows.filter((r) => r.selected);
    if (selected.length === 0) {
      throw new Error('Select at least one file.');
    }
    if (selected.length === 1) {
      const file = selected[0]!;
      const result = this.openFromText(file.raw, file.basename);
      if (!result.ok) {
        throw new Error(result.error);
      }
      return;
    }
    const bundles = selected.map(
      (file) => this.bundleService.parseFileToBundle(file.raw, file.basename).bundle,
    );
    this.importDialog.openImport(mergeBundles(bundles), `${selected.length} files`, 'testrix');
  }

  formatKindLabel(kind: BatchImportPreviewRow['format']): string {
    if (kind === 'legacy_envelope') {
      return 'Legacy Testrix export';
    }
    if (kind === 'unknown') {
      return 'Unknown';
    }
    return formatImportKindLabel(kind);
  }
}
