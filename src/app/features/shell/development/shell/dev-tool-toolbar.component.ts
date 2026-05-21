import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-dev-tool-toolbar',
  standalone: true,
  styleUrl: './_dev-tool-shell-widgets.scss',
  template: `
    <div class="dev-tool-tab__toolbar-row" role="toolbar">
      <div class="dev-tool-tab__toolbar-leading">
        <ng-content select="[leading]" />
      </div>
      <div class="dev-tool-tab__toolbar-trailing">
        <ng-content select="[trailing]" />
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevToolToolbarComponent {}
