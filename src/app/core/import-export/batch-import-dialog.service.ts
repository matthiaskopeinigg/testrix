import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

import type { ImportFormatKind } from '@shared/import-export';

export interface BatchImportPreviewRow {
  readonly path: string;
  readonly basename: string;
  readonly format: ImportFormatKind | 'legacy_envelope' | 'unknown';
  readonly title: string;
  readonly schemaVersion: number | null;
  readonly raw: string;
  readonly selected: boolean;
}

export type BatchMergeMode = 'flat' | 'folderPerFile' | 'flatWithPrefix';

export interface BatchImportDialogState {
  readonly rows: readonly BatchImportPreviewRow[];
}

@Injectable({ providedIn: 'root' })
export class BatchImportDialogService {
  private readonly stateSubject = new Subject<BatchImportDialogState | null>();
  private readonly finishedSubject = new Subject<string | null>();

  readonly state$ = this.stateSubject.asObservable();
  readonly finished$ = this.finishedSubject.asObservable();

  open(rows: readonly BatchImportPreviewRow[]): void {
    this.stateSubject.next({ rows });
  }

  close(): void {
    this.stateSubject.next(null);
  }

  notifyFinished(message: string | null): void {
    this.finishedSubject.next(message);
  }
}
