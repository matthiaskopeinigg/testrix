import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { RegressionService } from '@app/core/testing/regression.service';
import { TestSuiteService } from '@app/core/testing/test-suite.service';
import { ElectronService } from '@app/core/electron/electron.service';

import { TestingWorkspaceTabShellComponent } from '../testing-workspace-tab-shell/testing-workspace-tab-shell.component';

@Component({
  selector: 'app-regression-workspace-tab',
  standalone: true,
  imports: [TestingWorkspaceTabShellComponent],
  template: `
    <app-testing-workspace-tab-shell
      [title]="title()"
      [resourceId]="resourceId()"
      description="Run linked test-suite flows and review pass/fail history."
      primaryActionLabel="Run regression"
      (primaryAction)="handleRun()"
    >
      @if (artifact(); as a) {
        <p class="regression-workspace-tab__flows">{{ a.flowIds.length }} linked flow(s)</p>
        <p class="regression-workspace-tab__runs">{{ a.runs.length }} run(s) in history</p>
      }
    </app-testing-workspace-tab-shell>
  `,
  styleUrl: './regression-workspace-tab.component.scss',
  host: {
    class: 'testing-workspace-tab-host',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegressionWorkspaceTabComponent {
  private readonly regression = inject(RegressionService);
  private readonly testSuite = inject(TestSuiteService);
  private readonly electron = inject(ElectronService);

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  protected readonly artifact = computed(() => {
    const id = this.resourceId().startsWith('rg:') ? this.resourceId().slice(3) : '';
    return this.regression.find(id);
  });

  protected readonly title = computed(() => this.regression.labelForResource(this.resourceId()));

  protected handleRun(): void {
    const flows = this.artifact()?.flowIds ?? [];
    const api = this.electron.bridge()?.testing;
    for (const flowId of flows) {
      void (api?.e2eExecuteFlow(flowId) ?? this.testSuite.findFlow(flowId));
    }
  }
}
