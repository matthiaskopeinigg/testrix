import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { InterceptorWorkspaceStore } from '@app/core/testing/interceptor-workspace.store';

import { TestingWorkspaceTabShellComponent } from '../testing-workspace-tab-shell/testing-workspace-tab-shell.component';

@Component({
  selector: 'app-interceptor-rule-workspace-tab',
  standalone: true,
  imports: [TestingWorkspaceTabShellComponent],
  template: `
    <app-testing-workspace-tab-shell
      [title]="title()"
      [resourceId]="resourceId()"
      description="Match URLs and choose proxy, mock, or block behavior."
    >
      @if (rule(); as r) {
        <dl class="interceptor-rule-workspace-tab__dl">
          <dt>Match</dt><dd>{{ r.matchUrl }}</dd>
          <dt>Action</dt><dd>{{ r.action }}</dd>
          <dt>Enabled</dt><dd>{{ r.enabled ? 'Yes' : 'No' }}</dd>
        </dl>
      }
    </app-testing-workspace-tab-shell>
  `,
  styleUrl: './interceptor-rule-workspace-tab.component.scss',
  host: {
    class: 'testing-workspace-tab-host',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InterceptorRuleWorkspaceTabComponent {
  private readonly interceptor = inject(InterceptorWorkspaceStore);

  readonly resourceId = input.required<string>();
  readonly active = input(false);

  protected readonly rule = computed(() => {
    const id = this.resourceId().startsWith('int-rule:')
      ? this.resourceId().slice('int-rule:'.length)
      : '';
    return this.interceptor.findRule(id);
  });

  protected readonly title = computed(() => this.interceptor.labelForResource(this.resourceId()));
}
