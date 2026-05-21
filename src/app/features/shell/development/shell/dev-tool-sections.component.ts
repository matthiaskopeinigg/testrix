import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-dev-tool-sections',
  standalone: true,
  styleUrl: './_dev-tool-shell-widgets.scss',
  template: `
    <div class="dev-tool-tab__sections">
      <nav class="dev-tool-tab__sections-bar" role="tablist">
        <ng-content />
      </nav>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevToolSectionsComponent {}
