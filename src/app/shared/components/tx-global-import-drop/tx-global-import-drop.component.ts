import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  NgZone,
  OnDestroy,
  inject,
} from '@angular/core';

import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { ImportExportFlowService } from '@app/core/import-export/import-export-flow.service';

/**
 * Full-window overlay for OS file drag-and-drop import.
 *
 * Mounted on {@link App} so the overlay spans the entire frame, including the custom titlebar.
 */
@Component({
  selector: 'tx-global-import-drop',
  standalone: true,
  templateUrl: './tx-global-import-drop.component.html',
  styleUrl: './tx-global-import-drop.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxGlobalImportDropComponent implements OnDestroy {
  private readonly flow = inject(ImportExportFlowService);
  private readonly notifications = inject(TxNotificationService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  protected active = false;
  protected errorMessage: string | null = null;
  private dragDepth = 0;
  private errorTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    if (this.errorTimer) {
      clearTimeout(this.errorTimer);
    }
  }

  @HostListener('window:dragenter', ['$event'])
  onDragEnter(event: DragEvent): void {
    if (!this.isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    this.dragDepth += 1;
    if (!this.active) {
      this.active = true;
      this.cdr.markForCheck();
    }
  }

  @HostListener('window:dragover', ['$event'])
  onDragOver(event: DragEvent): void {
    if (!this.isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  @HostListener('window:dragleave', ['$event'])
  onDragLeave(event: DragEvent): void {
    if (!this.isFileDrag(event)) {
      return;
    }
    const rel = event.relatedTarget;
    if (rel == null || (rel instanceof Node && !document.documentElement.contains(rel))) {
      this.clearFileDragOverlay();
      return;
    }
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (this.dragDepth === 0) {
      this.clearFileDragOverlay();
    }
  }

  @HostListener('window:dragend')
  onDragEnd(): void {
    this.clearFileDragOverlay();
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.clearFileDragOverlay();
    }
  }

  @HostListener('window:blur')
  onWindowBlur(): void {
    this.clearFileDragOverlay();
  }

  @HostListener('window:drop', ['$event'])
  onDrop(event: DragEvent): void {
    if (!this.isFileDrag(event)) {
      this.clearFileDragOverlay();
      return;
    }
    event.preventDefault();
    this.clearFileDragOverlay();
    const files = event.dataTransfer?.files;
    if (!files?.length) {
      return;
    }
    void this.handleFiles(files);
  }

  private isFileDrag(event: DragEvent): boolean {
    const types = event.dataTransfer?.types;
    if (!types) {
      return false;
    }
    return Array.prototype.indexOf.call(types as ArrayLike<string>, 'Files') !== -1;
  }

  private clearFileDragOverlay(): void {
    if (!this.active && this.dragDepth === 0) {
      return;
    }
    this.dragDepth = 0;
    this.active = false;
    this.cdr.markForCheck();
  }

  private async handleFiles(fileList: FileList): Promise<void> {
    const picked: Array<{ filePath: string; fileName: string; content: string }> = [];
    for (const file of Array.from(fileList)) {
      const name = file.name.toLowerCase();
      if (!name.endsWith('.json') && !name.endsWith('.yaml') && !name.endsWith('.yml') && !name.endsWith('.har') && !name.endsWith('.ndjson') && !name.endsWith('.gelf') && !name.endsWith('.jsonl')) {
        continue;
      }
      try {
        const content = await file.text();
        picked.push({ filePath: file.name, fileName: file.name, content });
      } catch {
        this.showError(`Could not read ${file.name}`);
      }
    }
    if (picked.length === 0) {
      this.showError('Drop JSON, YAML, HAR, NDJSON, GELF, or JSONL files to import.');
      return;
    }
    this.zone.run(() => {
      try {
        this.flow.openFromFiles(picked);
      } catch (e: unknown) {
        this.showError(e instanceof Error ? e.message : 'Import failed.');
      }
      this.cdr.markForCheck();
    });
  }

  private showError(message: string): void {
    this.errorMessage = message;
    this.notifications.showError(message);
    if (this.errorTimer) {
      clearTimeout(this.errorTimer);
    }
    this.errorTimer = setTimeout(() => {
      this.errorMessage = null;
      this.errorTimer = null;
      this.cdr.markForCheck();
    }, 3500);
    this.cdr.markForCheck();
  }
}
