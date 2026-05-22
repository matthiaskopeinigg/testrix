import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';

@Component({
  selector: 'app-rg-tab-docs-panel',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxTextareaComponent],
  template: `
    <div class="request-panel request-panel--fill">
      <p class="request-panel__hint">
        Long-form notes, runbooks, and context for this regression suite.
      </p>
      <tx-form-field label="Documentation" controlId="rg-docs">
        <tx-textarea
          id="rg-docs"
          class="rg-docs-editor"
          [ngModel]="docs()"
          (ngModelChange)="docsChange.emit($event)"
          placeholder="Markdown-friendly notes…"
        />
      </tx-form-field>
    </div>
  `,
  styleUrl: './rg-tab-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RgTabDocsPanelComponent {
  readonly docs = input('');

  readonly docsChange = output<string>();
}
