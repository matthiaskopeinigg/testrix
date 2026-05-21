import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { ElectronService } from '@app/core/electron/electron.service';
import { parseTestSuiteTabResourceId } from '@shared/testing';

import { TestingWorkspaceTabShellComponent } from '../testing-workspace-tab-shell/testing-workspace-tab-shell.component';

@Component({
  selector: 'app-test-suite-workspace-tab',
  standalone: true,
  imports: [TestingWorkspaceTabShellComponent],
  template: `
    <app-testing-workspace-tab-shell
      [title]="title()"
      [resourceId]="resourceId()"
      [description]="description()"
      [primaryActionLabel]="runLabel()"
      (primaryAction)="handleRun()"
    >
      @if (flow(); as f) {
        <p class="test-suite-workspace-tab__meta">{{ f.nodes.length }} step(s)</p>
        <ul class="test-suite-workspace-tab__nodes">
          @for (node of f.nodes; track node.id) {
            <li>{{ node.type }} — {{ node.label || node.id }}</li>
          }
        </ul>
      }
    </app-testing-workspace-tab-shell>
  `,
  styleUrl: './test-suite-workspace-tab.component.scss',
  host: {
    class: 'testing-workspace-tab-host',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestSuiteWorkspaceTabComponent {
  private readonly testSuite = inject(TestSuiteService);
  private readonly electron = inject(ElectronService);

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  protected readonly parsed = computed(() => parseTestSuiteTabResourceId(this.resourceId()));

  protected readonly flow = computed(() => {
    const p = this.parsed();
    return p?.kind === 'flow' ? this.testSuite.findFlow(p.id) : null;
  });

  protected readonly title = computed(() => this.testSuite.labelForResource(this.resourceId()));

  protected readonly description = computed(() => {
    const p = this.parsed();
    if (p?.kind === 'folder') {
      return 'Folder overview — add flows from the Test Suite sidebar.';
    }
    return 'Edit flow steps and run against your collections.';
  });

  protected readonly runLabel = computed(() => (this.flow() ? 'Run flow' : null));

  protected handleRun(): void {
    const p = this.parsed();
    if (!p || p.kind !== 'flow') {
      return;
    }
    void this.electron.bridge()?.testing.e2eExecuteFlow(p.id);
  }
}
