import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { findDevelopmentTool } from '@app/core/development-tools/development-tool.registry';
import type { DevelopmentToolId } from '@shared/config';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';

@Component({
  selector: 'app-dev-tool-layout',
  standalone: true,
  imports: [TxIconComponent],
  templateUrl: './dev-tool-layout.component.html',
  styleUrl: './_dev-tool-chrome.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'dev-tool-tab-host',
  },
})
export class DevToolLayoutComponent {
  readonly toolId = input.required<DevelopmentToolId>();
  /** When true, body and fill-marked panes expand to use remaining tab height. */
  readonly fillHeight = input(false);

  protected meta() {
    return findDevelopmentTool(this.toolId());
  }
}
