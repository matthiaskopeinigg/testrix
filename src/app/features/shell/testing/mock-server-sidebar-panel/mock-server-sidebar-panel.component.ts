import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { MockServerService } from '@app/core/testing/mock-server.service';
import { WorkspaceEditorService } from '@app/core/workspace/workspace-editor.service';
import { testingSidebarSelectionIds } from '@app/features/shell/workspace/workspace-sidebar-selection';
import { WorkspaceSidebarPanelShellComponent } from '@app/features/shell/workspace/workspace-sidebar-panel-shell.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';
import { mockServerTabResourceId } from '@shared/testing';

import { TestingProgrammaticSidebarPanelBase } from '../testing-programmatic-sidebar-panel.base';

@Component({
  selector: 'app-mock-server-sidebar-panel',
  standalone: true,
  imports: [WorkspaceSidebarPanelShellComponent, TxButtonComponent, TxIconComponent, TxTagComponent],
  templateUrl: './mock-server-sidebar-panel.component.html',
  styleUrl: './mock-server-sidebar-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MockServerSidebarPanelComponent extends TestingProgrammaticSidebarPanelBase {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly mockServer = inject(MockServerService);
  private readonly workspaceEditor = inject(WorkspaceEditorService);

  protected override panelTitle = 'Mock Server';

  protected readonly navFilter = signal('');
  protected readonly running = this.mockServer.running;
  protected readonly options = this.mockServer.options;

  protected readonly filtered = computed(() => {
    const q = this.navFilter().trim().toLowerCase();
    return this.mockServer.endpoints().filter((e) => !q || e.name.toLowerCase().includes(q));
  });

  protected readonly activeItemId = computed(() => {
    const ids = testingSidebarSelectionIds(this.workspaceEditor.activeTab());
    return ids[0] ?? null;
  });

  constructor() {
    super();
    effect(() => {
      this.mockServer.endpoints();
      this.workspaceEditor.activeTab();
      this.cdr.markForCheck();
    });
  }

  protected handleSearch(query: string): void {
    this.navFilter.set(query);
    this.cdr.markForCheck();
  }

  protected async handleToggleServer(): Promise<void> {
    if (this.mockServer.running()) {
      await this.mockServer.stop();
    } else {
      await this.mockServer.start();
    }
    this.cdr.markForCheck();
  }

  protected handleAdd(): void {
    const endpoint = this.mockServer.addEndpoint();
    this.workspaceEditor.openResource({
      resourceId: mockServerTabResourceId(endpoint.id),
      kind: 'mock-server',
    });
    this.cdr.markForCheck();
  }

  protected handleOpen(id: string): void {
    this.workspaceEditor.openResource({
      resourceId: mockServerTabResourceId(id),
      kind: 'mock-server',
    });
  }
}
