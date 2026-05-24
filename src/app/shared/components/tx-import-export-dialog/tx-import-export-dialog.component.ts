import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { formatImportKindLabel } from '@shared/import-export';

import { FileDialogService } from '@app/core/platform/file-dialog.service';
import { TxNotificationService } from '@app/core/notifications/tx-notification.service';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxModalComponent } from '@app/shared/components/tx-modal/tx-modal.component';

import { ImportExportDialogService, type ImportExportDialogState } from '@app/core/import-export/import-export-dialog.service';
import {
  applyToggle,
  buildBundleSelection,
  computeCheckState,
  selectAllNodes,
} from '@app/core/import-export/import-export-selection';
import { buildImportExportTree, type CheckState, type ImportExportTreeNode } from '@app/core/import-export/import-export-tree';
import { WorkspaceBundleService } from '@app/core/import-export/workspace-bundle.service';

@Component({
  selector: 'tx-import-export-dialog',
  standalone: true,
  imports: [NgTemplateOutlet, FormsModule, TxModalComponent, TxButtonComponent, TxIconComponent],
  templateUrl: './tx-import-export-dialog.component.html',
  styleUrl: './tx-import-export-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxImportExportDialogComponent {
  private readonly dialog = inject(ImportExportDialogService);
  private readonly bundleService = inject(WorkspaceBundleService);
  private readonly fileDialog = inject(FileDialogService);
  private readonly notifications = inject(TxNotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly open = signal(false);
  protected readonly state = signal<ImportExportDialogState | null>(null);
  protected readonly tree = signal<ImportExportTreeNode[]>([]);
  protected readonly selected = signal<Map<string, CheckState>>(new Map());
  protected readonly expandedIds = signal<Set<string>>(new Set());
  protected readonly mergeMode = signal<'merge' | 'replace'>('merge');
  protected readonly busy = signal(false);

  constructor() {
    this.dialog.state$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((next) => {
      if (!next) {
        this.open.set(false);
        this.state.set(null);
        return;
      }
      this.state.set(next);
      const built = buildImportExportTree(next.bundle);
      this.tree.set(built);
      this.selected.set(selectAllNodes(built));
      this.expandedIds.set(collectDefaultExpandedIds(built));
      this.mergeMode.set('merge');
      this.open.set(true);
    });
  }

  protected isExpanded(node: ImportExportTreeNode): boolean {
    return this.expandedIds().has(node.id);
  }

  protected handleToggleExpand(node: ImportExportTreeNode): void {
    const next = new Set(this.expandedIds());
    if (next.has(node.id)) {
      next.delete(node.id);
    } else {
      next.add(node.id);
    }
    this.expandedIds.set(next);
  }

  protected formatBadge(): string {
    const s = this.state();
    if (!s?.format) {
      return 'Testrix';
    }
    if (s.format === 'legacy_envelope') {
      return 'Legacy Testrix export';
    }
    return formatImportKindLabel(s.format);
  }

  protected checkState(node: ImportExportTreeNode): CheckState {
    return this.selected().get(node.id) ?? computeCheckState(node, this.selected());
  }

  protected handleToggle(node: ImportExportTreeNode): void {
    const current = this.checkState(node);
    const next: CheckState = current === 'on' ? 'off' : 'on';
    const map = new Map(this.selected());
    applyToggle(node, next, map);
    this.selected.set(map);
  }

  protected handleSelectAll(): void {
    this.selected.set(selectAllNodes(this.tree()));
  }

  protected handleClearAll(): void {
    const map = new Map<string, CheckState>();
    this.selected.set(map);
  }

  protected handleClose(): void {
    this.dialog.close();
  }

  protected async handleConfirm(): Promise<void> {
    const s = this.state();
    if (!s || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const selection = buildBundleSelection(this.tree(), this.selected());
      const filtered = this.bundleService.filterBundle(s.bundle, selection);

      if (s.mode === 'export') {
        const json = JSON.stringify(filtered, null, 2);
        const saved = await this.fileDialog.saveJson(json, 'testrix-export.json');
        if (saved) {
          this.notifications.showSuccess('Export saved.');
          this.dialog.notifyFinished({ summary: 'Export saved' });
        }
        this.dialog.close();
        return;
      }

      const result = await this.bundleService.applyBundle(filtered, selection, {
        mode: this.mergeMode(),
      });
      this.notifications.showSuccess(result.summary);
      this.dialog.notifyFinished(result);
      this.dialog.close();
    } catch (e: unknown) {
      this.notifications.showError(e instanceof Error ? e.message : 'Import/export failed.');
    } finally {
      this.busy.set(false);
    }
  }
}

function collectDefaultExpandedIds(nodes: readonly ImportExportTreeNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: readonly ImportExportTreeNode[]): void => {
    for (const node of list) {
      if (node.expanded) {
        ids.add(node.id);
      }
      if (node.children.length) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
}
