import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { InterceptorWorkspaceStore } from '@app/core/testing/interceptor-workspace.store';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { testingSidebarSelectionIds } from '@app/features/shell/workspace/workspace-sidebar-selection';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';
import type { InterceptorRule, InterceptorTreeItem } from '@shared/testing';

import { TestingProgrammaticSidebarPanelBase } from '../testing-programmatic-sidebar-panel.base';

@Component({
  selector: 'app-interceptor-sidebar-panel',
  standalone: true,
  imports: [WorkspaceSidebarPanelShellComponent, TxButtonComponent, TxIconComponent, TxTagComponent],
  templateUrl: './interceptor-sidebar-panel.component.html',
  styleUrl: './interceptor-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InterceptorSidebarPanelComponent extends TestingProgrammaticSidebarPanelBase {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly interceptor = inject(InterceptorWorkspaceStore);
  private readonly workspaceEditor = inject(WorkspaceEditorService);

  protected override panelTitle = 'Interceptor';

  protected readonly navFilter = signal('');
  protected readonly running = this.interceptor.running;

  protected readonly rules = computed((): readonly InterceptorRule[] => {
    const q = this.navFilter().trim().toLowerCase();
    const collect = (items: readonly InterceptorTreeItem[]): InterceptorRule[] => {
      const out: InterceptorRule[] = [];
      for (const item of items) {
        if ('matchUrl' in item) {
          if (!q || item.name.toLowerCase().includes(q)) {
            out.push(item);
          }
        } else {
          out.push(...collect(item.children));
        }
      }
      return out;
    };
    return collect(this.interceptor.items());
  });

  protected readonly activeItemId = computed(() => {
    const ids = testingSidebarSelectionIds(this.workspaceEditor.activeTab());
    return ids[0] ?? null;
  });

  constructor() {
    super();
    effect(() => {
      this.workspaceEditor.activeTab();
      this.cdr.markForCheck();
    });
    void this.interceptor.hydrate().then(() => this.cdr.markForCheck());
  }

  protected handleSearch(query: string): void {
    this.navFilter.set(query);
    this.cdr.markForCheck();
  }

  protected async handleToggle(): Promise<void> {
    if (this.interceptor.running()) {
      await this.interceptor.stop();
    } else {
      await this.interceptor.start();
    }
    this.cdr.markForCheck();
  }

  protected handleAdd(): void {
    const rule = this.interceptor.addRule();
    this.workspaceEditor.openResource({
      resourceId: this.interceptor.tabResourceId(rule.id),
      kind: 'interceptor-rule',
    });
    this.cdr.markForCheck();
  }

  protected handleOpen(id: string): void {
    this.workspaceEditor.openResource({
      resourceId: this.interceptor.tabResourceId(id),
      kind: 'interceptor-rule',
    });
  }
}
