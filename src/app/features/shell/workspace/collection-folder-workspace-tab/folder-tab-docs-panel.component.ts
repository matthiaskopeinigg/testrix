import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';

@Component({
  selector: 'app-folder-tab-docs-panel',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxTextareaComponent],
  template: `
    <div class="request-panel">
      <h2 class="request-panel__title">Documentation</h2>
      <p class="request-panel__hint">
        Markdown notes for this folder and its requests (API overview, conventions, links).
      </p>
      <tx-form-field label="Docs" controlId="folder-docs">
        <tx-textarea
          id="folder-docs"
          [ngModel]="docs()"
          (ngModelChange)="docsChange.emit($event)"
          placeholder="## Overview&#10;&#10;Describe this folder…"
          [rows]="16"
        />
      </tx-form-field>
    </div>
  `,
  styleUrl: '../request-workspace-tab/request-tab-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderTabDocsPanelComponent {
  readonly docs = input('');
  readonly docsChange = output<string>();
}
