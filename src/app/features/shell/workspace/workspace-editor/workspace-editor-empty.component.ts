import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';

@Component({
  selector: 'app-workspace-editor-empty',
  standalone: true,
  imports: [TxButtonComponent],
  templateUrl: './workspace-editor-empty.component.html',
  styleUrl: './workspace-editor-empty.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspaceEditorEmptyComponent {
  readonly showPaneActions = input(false);

  readonly closePane = output<void>();
  readonly resetLayout = output<void>();
}
