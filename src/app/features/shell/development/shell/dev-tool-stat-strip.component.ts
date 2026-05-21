import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-dev-tool-stat-strip',
  standalone: true,
  styleUrl: './_dev-tool-shell-widgets.scss',
  template: `
    <div class="dev-tool-tab__stats" role="status">
      <ng-content />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevToolStatStripComponent {}
