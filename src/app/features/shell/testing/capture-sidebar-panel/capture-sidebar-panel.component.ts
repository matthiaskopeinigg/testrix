import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { CaptureWorkbenchStore } from '@app/core/testing/capture-workbench.store';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { testingSidebarSelectionIds } from '@app/features/shell/workspace/workspace-sidebar-selection';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

import { TestingProgrammaticSidebarPanelBase } from '../testing-programmatic-sidebar-panel.base';

@Component({
  selector: 'app-capture-sidebar-panel',
  standalone: true,
  imports: [WorkspaceSidebarPanelShellComponent, TxButtonComponent, TxIconComponent, TxTagComponent],
  templateUrl: './capture-sidebar-panel.component.html',
  styleUrl: './capture-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptureSidebarPanelComponent extends TestingProgrammaticSidebarPanelBase {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly capture = inject(CaptureWorkbenchStore);
  private readonly workspaceEditor = inject(WorkspaceEditorService);

  protected override panelTitle = 'Capture';

  protected readonly navFilter = signal('');
  protected readonly running = this.capture.running;

  protected readonly filtered = computed(() => {
    const q = this.navFilter().trim().toLowerCase();
    return this.capture.items().filter((i) => !q || i.name.toLowerCase().includes(q));
  });

  protected readonly activeItemId = computed(() => {
    const ids = testingSidebarSelectionIds(this.workspaceEditor.activeTab());
    return ids[0] ?? null;
  });

  constructor() {
    super();
    effect(() => {
      this.capture.items();
      this.workspaceEditor.activeTab();
      this.cdr.markForCheck();
    });
  }

  protected handleSearch(query: string): void {
    this.navFilter.set(query);
    this.cdr.markForCheck();
  }

  protected async handleToggle(): Promise<void> {
    if (this.capture.running()) {
      await this.capture.stop();
    } else {
      await this.capture.start();
    }
    this.cdr.markForCheck();
  }

  protected handleAdd(): void {
    const item = this.capture.addItem();
    this.workspaceEditor.openResource({
      resourceId: this.capture.tabResourceId(item.id),
      kind: 'capture',
    });
    this.cdr.markForCheck();
  }

  protected handleOpen(id: string): void {
    this.workspaceEditor.openResource({
      resourceId: this.capture.tabResourceId(id),
      kind: 'capture',
    });
  }
}
