import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { RegressionService } from '@app/core/testing/regression.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { testingSidebarSelectionIds } from '@app/features/shell/workspace/workspace-sidebar-selection';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { regressionTabResourceId } from '@shared/testing';

import { TestingProgrammaticSidebarPanelBase } from '../testing-programmatic-sidebar-panel.base';

@Component({
  selector: 'app-regression-sidebar-panel',
  standalone: true,
  imports: [WorkspaceSidebarPanelShellComponent, TxIconComponent],
  templateUrl: './regression-sidebar-panel.component.html',
  styleUrl: '../testing-list-sidebar-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegressionSidebarPanelComponent extends TestingProgrammaticSidebarPanelBase {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly regression = inject(RegressionService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);

  protected override panelTitle = 'Regression';

  protected readonly navFilter = signal('');

  protected readonly filtered = computed(() => {
    const q = this.navFilter().trim().toLowerCase();
    return this.regression.items().filter((item) => !q || item.name.toLowerCase().includes(q));
  });

  protected readonly activeItemId = computed(() => {
    const ids = testingSidebarSelectionIds(this.workspaceEditor.activeTab());
    return ids[0] ?? null;
  });

  constructor() {
    super();
    effect(() => {
      this.regression.items();
      this.workspaceEditor.activeTab();
      this.cdr.markForCheck();
    });
  }

  protected handleSearch(query: string): void {
    this.navFilter.set(query);
    this.cdr.markForCheck();
  }

  protected handleAdd(): void {
    const item = this.regression.add();
    this.workspaceEditor.openResource({
      resourceId: regressionTabResourceId(item.id),
      kind: 'regression',
    });
    this.cdr.markForCheck();
  }

  protected handleOpen(id: string): void {
    this.workspaceEditor.openResource({
      resourceId: regressionTabResourceId(id),
      kind: 'regression',
    });
  }
}
