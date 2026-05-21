import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type {
  CollectionFolderAuth,
  CollectionRequestExample,
  CollectionRequestSavedSnapshot,
} from '@shared/config';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';
import { TxTagsInputComponent } from '@app/shared/components/tx-tags-input/tx-tags-input.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';

@Component({
  selector: 'app-request-tab-overview-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxBannerComponent,
    TxFormFieldComponent,
    TxTagComponent,
    TxTagsInputComponent,
    TxTextareaComponent,
  ],
  template: `
    <div class="request-panel">
      <tx-form-field label="Description" controlId="request-description">
        <tx-textarea
          id="request-description"
          [ngModel]="description()"
          (ngModelChange)="descriptionChange.emit($event)"
          placeholder="Short notes about this request"
        />
      </tx-form-field>

      <tx-form-field label="Tags" controlId="request-tags">
        <p class="request-panel__hint request-panel__hint--compact">Press Enter to add each tag.</p>
        <tx-tags-input
          id="request-tags"
          placeholder="api, v1"
          [ngModel]="tags()"
          (ngModelChange)="tagsChange.emit($event)"
        />
      </tx-form-field>

      <h2 class="request-panel__title">Authorization</h2>
      <p class="request-panel__hint">Type: <strong>{{ authSummary() }}</strong></p>

      @if (inheritedVariableLines().length > 0) {
        <h2 class="request-panel__title">Inherited variables (read-only)</h2>
        <p class="request-panel__hint">From ancestor folders and the active environment.</p>
        <ul class="request-panel__path-list">
          @for (line of inheritedVariableLines(); track line) {
            <li class="request-panel__hint">{{ line }}</li>
          }
        </ul>
      }

      <h2 class="request-panel__title">Examples</h2>
      @if (examples().length === 0) {
        <p class="request-panel__hint">No saved examples. Send a request and use Save as example in the response panel.</p>
      } @else {
        <ul class="request-panel__path-list">
          @for (ex of examples(); track ex.id) {
            <li class="request-panel__example-row">
              <tx-tag [variant]="ex.snapshot.status.ok ? 'success' : 'error'">
                {{ ex.snapshot.status.code }}
              </tx-tag>
              <strong>{{ ex.name }}</strong>
              @if (ex.isDefault) {
                <tx-tag variant="info">Default</tx-tag>
              }
              @if (ex.description) {
                <span class="request-panel__hint"> — {{ ex.description }}</span>
              }
            </li>
          }
        </ul>
      }

      <h2 class="request-panel__title">Snapshots</h2>
      @if (snapshots().length === 0) {
        <p class="request-panel__hint">No named snapshots yet.</p>
      } @else {
        <ul class="request-panel__path-list">
          @for (sn of snapshots(); track sn.id) {
            <li class="request-panel__example-row">
              <tx-tag [variant]="sn.snapshot.status.ok ? 'success' : 'error'">
                {{ sn.snapshot.status.code }}
              </tx-tag>
              <strong>{{ sn.name }}</strong>
            </li>
          }
        </ul>
      }

      <tx-banner variant="info" title="Tests — coming soon">
        Saved test scripts will appear here in a future release.
      </tx-banner>
    </div>
  `,
  styleUrl: './request-tab-panels.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RequestTabOverviewPanelComponent {
  readonly description = input('');
  readonly tags = input<readonly string[]>([]);
  readonly auth = input.required<CollectionFolderAuth>();
  readonly inheritedVariableLines = input<readonly string[]>([]);
  readonly examples = input<readonly CollectionRequestExample[]>([]);
  readonly snapshots = input<readonly CollectionRequestSavedSnapshot[]>([]);

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
