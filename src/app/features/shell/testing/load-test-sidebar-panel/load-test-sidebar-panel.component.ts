import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import { LoadTestService } from '@app/core/testing/load-test.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { testingSidebarSelectionIds } from '@app/features/shell/workspace/workspace-sidebar-selection';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import type { LoadTestArtifact, LoadTestTreeItem } from '@shared/testing';

@Component({
  selector: 'app-load-test-sidebar-panel',
  standalone: true,
  imports: [WorkspaceSidebarPanelShellComponent, TxIconComponent],
  templateUrl: './load-test-sidebar-panel.component.html',
  styleUrl: './load-test-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadTestSidebarPanelComponent {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly loadTest = inject(LoadTestService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);

  readonly searchPlaceholder = input('Search…');
  readonly searchAriaLabel = input('Search load tests');

  protected readonly navFilter = signal('');

  protected readonly filtered = computed((): readonly LoadTestArtifact[] => {
    const q = this.navFilter().trim().toLowerCase();
    const collect = (items: readonly LoadTestTreeItem[]): LoadTestArtifact[] => {
      const out: LoadTestArtifact[] = [];
      for (const item of items) {
        if ('profile' in item) {
          if (!q || item.name.toLowerCase().includes(q)) {
            out.push(item);
          }
        } else {
          out.push(...collect(item.children));
        }
      }
      return out;
    };
    return collect(this.loadTest.items());
  });

  protected readonly activeItemId = computed(() => {
    const ids = testingSidebarSelectionIds(this.workspaceEditor.activeTab());
    return ids[0] ?? null;
  });

  constructor() {
    effect(() => {
      this.workspaceEditor.activeTab();
      this.cdr.markForCheck();
    });

    void this.loadTest.hydrate().then(() => this.cdr.markForCheck());
  }

  protected handleSearch(query: string): void {
    this.navFilter.set(query);
    this.cdr.markForCheck();
  }

  protected handleAdd(): void {
    const item = this.loadTest.addArtifact();
    this.open(item.id);
    this.cdr.markForCheck();
  }

  protected handleOpen(id: string): void {
    this.open(id);
  }

  private open(id: string): void {
    this.workspaceEditor.openResource({
      resourceId: this.loadTest.tabResourceId(id),
      kind: 'load-test',
    });
  }
}
