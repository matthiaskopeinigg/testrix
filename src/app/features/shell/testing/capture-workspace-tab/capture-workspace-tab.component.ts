import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { CaptureWorkbenchStore } from '@app/core/testing/capture-workbench.store';
import { ElectronService } from '@app/core/electron/electron.service';

import { TestingWorkspaceTabShellComponent } from '../testing-workspace-tab-shell/testing-workspace-tab-shell.component';

@Component({
  selector: 'app-capture-workspace-tab',
  standalone: true,
  imports: [TestingWorkspaceTabShellComponent],
  template: `
    <app-testing-workspace-tab-shell
      [title]="title()"
      [resourceId]="resourceId()"
      description="Traffic captured from the embedded browser appears here."
    >
      @if (item(); as i) {
        <p class="capture-workspace-tab__url">Start URL: {{ i.startUrl }}</p>
      }
      <ul class="capture-workspace-tab__log">
        @for (entry of entries(); track entry.id) {
          <li><strong>{{ entry.method }}</strong> {{ entry.url }}</li>
        } @empty {
          <li>No traffic captured yet.</li>
        }
      </ul>
    </app-testing-workspace-tab-shell>
  `,
  styleUrl: './capture-workspace-tab.component.scss',
  host: {
    class: 'testing-workspace-tab-host',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptureWorkspaceTabComponent {
  private readonly capture = inject(CaptureWorkbenchStore);
  private readonly electron = inject(ElectronService);

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  protected readonly entries = signal<
    readonly { readonly id: string; readonly method: string; readonly url: string; readonly at: string }[]
  >([]);

  protected readonly item = computed(() => {
    const id = this.resourceId().startsWith('cap:') ? this.resourceId().slice(4) : '';
    return this.capture.find(id);
  });

  protected readonly title = computed(() => this.capture.labelForResource(this.resourceId()));

  constructor() {
    void this.refreshEntries();
  }

  private async refreshEntries(): Promise<void> {
    const api = this.electron.bridge()?.testing;
    if (!api) {
      return;
    }
    this.entries.set(await api.captureListEntries());
  }
}
