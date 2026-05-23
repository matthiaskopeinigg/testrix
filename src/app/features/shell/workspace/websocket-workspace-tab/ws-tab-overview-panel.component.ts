import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { CollectionFolderAuth } from '@shared/config';

import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxTagsInputComponent } from '@app/shared/components/tx-tags-input/tx-tags-input.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';

@Component({
  selector: 'app-ws-tab-overview-panel',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxTagsInputComponent, TxTextareaComponent],
  template: `
    <div class="request-panel">
      <tx-form-field label="Description" controlId="ws-description">
        <tx-textarea
          id="ws-description"
          [ngModel]="description()"
          (ngModelChange)="descriptionChange.emit($event)"
          placeholder="Short notes about this WebSocket"
        />
      </tx-form-field>

      <tx-form-field label="Tags" controlId="ws-tags">
        <tx-tags-input
          controlId="ws-tags"
          [compact]="true"
          placeholder="Add a tag"
          [ngModel]="tags()"
          (ngModelChange)="tagsChange.emit($event)"
        />
      </tx-form-field>

      <h2 class="request-panel__title">Authorization</h2>
      <p class="request-panel__hint">Type: <strong>{{ authSummary() }}</strong></p>

      <h2 class="request-panel__title">Summary</h2>
      <p class="request-panel__hint">
        {{ paramCount() }} query param{{ paramCount() === 1 ? '' : 's' }},
        {{ headerCount() }} header{{ headerCount() === 1 ? '' : 's' }}
      </p>
    </div>
  `,
  styleUrl: './ws-tab-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WsTabOverviewPanelComponent {
  readonly description = input('');
  readonly tags = input<readonly string[]>([]);
  readonly auth = input.required<CollectionFolderAuth>();
  readonly paramCount = input(0);
  readonly headerCount = input(0);

  readonly descriptionChange = output<string>();
  readonly tagsChange = output<readonly string[]>();

  protected authSummary(): string {
    const auth = this.auth();
    if (auth.type === 'inherit') {
      return 'Inherit from folder';
    }
    if (auth.type === 'none') {
      return 'None';
    }
    return auth.type;
  }
}
