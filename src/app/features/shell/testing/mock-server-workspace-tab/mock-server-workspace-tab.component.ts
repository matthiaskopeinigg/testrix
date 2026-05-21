import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { MockServerService } from '@app/core/testing/mock-server.service';

import { TestingWorkspaceTabShellComponent } from '../testing-workspace-tab-shell/testing-workspace-tab-shell.component';

@Component({
  selector: 'app-mock-server-workspace-tab',
  standalone: true,
  imports: [TestingWorkspaceTabShellComponent],
  template: `
    <app-testing-workspace-tab-shell
      [title]="title()"
      [resourceId]="resourceId()"
      description="Edit response body, status, and latency for this mock endpoint."
    >
      @if (endpoint(); as e) {
        <dl class="mock-server-workspace-tab__dl">
          <dt>Method</dt><dd>{{ e.method }}</dd>
          <dt>Path</dt><dd>{{ e.path }}</dd>
          <dt>Status</dt><dd>{{ e.statusCode }}</dd>
          <dt>Latency</dt><dd>{{ e.latencyMs }} ms</dd>
        </dl>
        <pre class="mock-server-workspace-tab__body">{{ e.body }}</pre>
      }
    </app-testing-workspace-tab-shell>
  `,
  styleUrl: './mock-server-workspace-tab.component.scss',
  host: {
    class: 'testing-workspace-tab-host',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MockServerWorkspaceTabComponent {
  private readonly mockServer = inject(MockServerService);

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  protected readonly endpoint = computed(() => {
    const id = this.resourceId().startsWith('ms:') ? this.resourceId().slice(3) : '';
    return this.mockServer.find(id);
  });

  protected readonly title = computed(() => this.mockServer.labelForResource(this.resourceId()));
}
