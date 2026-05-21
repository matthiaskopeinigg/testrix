import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { LoadTestService } from '@app/core/testing/load-test.service';
import { ElectronService } from '@app/core/electron/electron.service';

import { TestingWorkspaceTabShellComponent } from '../testing-workspace-tab-shell/testing-workspace-tab-shell.component';

@Component({
  selector: 'app-load-test-workspace-tab',
  standalone: true,
  imports: [TestingWorkspaceTabShellComponent],
  template: `
    <app-testing-workspace-tab-shell
      [title]="title()"
      [resourceId]="resourceId()"
      description="Configure virtual users, duration, and target request."
      [primaryActionLabel]="running() ? 'Cancel' : 'Start load test'"
      (primaryAction)="handleRunToggle()"
    >
      @if (artifact(); as a) {
        <dl class="load-test-workspace-tab__dl">
          <dt>Virtual users</dt><dd>{{ a.profile.virtualUsers }}</dd>
          <dt>Duration (s)</dt><dd>{{ a.profile.durationSec }}</dd>
          <dt>Target request</dt><dd>{{ a.targetRequestId || '—' }}</dd>
        </dl>
      }
    </app-testing-workspace-tab-shell>
  `,
  styleUrl: './load-test-workspace-tab.component.scss',
  host: {
    class: 'testing-workspace-tab-host',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadTestWorkspaceTabComponent {
  private readonly loadTest = inject(LoadTestService);
  private readonly electron = inject(ElectronService);

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  protected readonly running = signal(false);

  protected readonly artifact = computed(() => {
    const id = this.resourceId().startsWith('lt:') ? this.resourceId().slice(3) : '';
    return this.loadTest.findArtifact(id);
  });

  protected readonly title = computed(() => this.loadTest.labelForResource(this.resourceId()));

  protected handleRunToggle(): void {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      this.running.update((v) => !v);
      return;
    }
    if (this.running()) {
      void api.loadTestCancel().then((s) => this.running.set(s.running));
    } else {
      void api.loadTestStart().then((s) => this.running.set(s.running));
    }
  }
}
