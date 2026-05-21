import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';

@Component({
  selector: 'app-lt-tab-docs-panel',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxTextareaComponent],
  template: `
    <div class="request-panel request-panel--fill">
      <p class="request-panel__hint">
        Long-form notes, runbooks, and context for this load test.
      </p>
      <tx-form-field label="Documentation" controlId="lt-docs">
        <tx-textarea
          id="lt-docs"
          class="lt-docs-editor"
          [ngModel]="docs()"
          (ngModelChange)="docsChange.emit($event)"
          placeholder="Markdown-friendly notes…"
        />
      </tx-form-field>
    </div>
  `,
  styleUrl: './lt-tab-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LtTabDocsPanelComponent {
  readonly docs = input('');

  readonly docsChange = output<string>();
}
