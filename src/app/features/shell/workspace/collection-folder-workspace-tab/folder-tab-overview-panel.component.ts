import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { CollectionFolderAuth } from '@shared/config';

import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxTagsInputComponent } from '@app/shared/components/tx-tags-input/tx-tags-input.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';

@Component({
  selector: 'app-folder-tab-overview-panel',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxTagsInputComponent, TxTextareaComponent],
  template: `
    <div class="request-panel">
      <tx-form-field label="Description" controlId="folder-description">
        <tx-textarea
          id="folder-description"
          [ngModel]="description()"
          (ngModelChange)="descriptionChange.emit($event)"
          placeholder="Optional notes about this folder"
        />
      </tx-form-field>

      <tx-form-field label="Tags" controlId="folder-tags">
        <p class="request-panel__hint request-panel__hint--compact">Press Enter to add each tag.</p>
        <tx-tags-input
          id="folder-tags"
          placeholder="api, shared"
          [ngModel]="tags()"
          (ngModelChange)="tagsChange.emit($event)"
        />
      </tx-form-field>

      <h2 class="request-panel__title">Authorization</h2>
      <p class="request-panel__hint">Type: <strong>{{ authSummary() }}</strong></p>
      <p class="request-panel__hint">
        Open the <strong>Auth</strong> section to configure how requests in this folder authenticate.
      </p>

      <h2 class="request-panel__title">Folder settings</h2>
      <p class="request-panel__hint">
        <strong>{{ variableCount() }}</strong> collection variable(s),
        <strong>{{ headerCount() }}</strong> default header(s).
      </p>
    </div>
  `,
  styleUrl: '../request-workspace-tab/request-tab-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FolderTabOverviewPanelComponent {
  readonly description = input('');
  readonly tags = input<readonly string[]>([]);
  readonly auth = input.required<CollectionFolderAuth>();
  readonly variableCount = input(0);
  readonly headerCount = input(0);

  readonly descriptionChange = output<string>();
  readonly tagsChange = output<readonly string[]>();

  protected authSummary(): string {
    const auth = this.auth();
    if (auth.type === 'inherit') {
      return 'Inherit from parent folder';
    }
    if (auth.type === 'none') {
      return 'None';
    }
    return auth.type;
  }
}
