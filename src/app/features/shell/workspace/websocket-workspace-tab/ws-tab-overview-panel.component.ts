import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { CollectionWebsocketSettings, WebsocketTabSectionId } from '@shared/config';

import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';
import type { TxTagVariant } from '@app/shared/components/tx-tag/tx-tag.component';
import { TxTagsInputComponent } from '@app/shared/components/tx-tags-input/tx-tags-input.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';

import { buildWsOverviewConfigCards } from './ws-tab-overview-summary';
import type { WsConnectionState } from './ws-tab-messages-panel.component';

@Component({
  selector: 'app-ws-tab-overview-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxFormFieldComponent,
    TxIconComponent,
    TxTagComponent,
    TxTagsInputComponent,
    TxTextareaComponent,
  ],
  templateUrl: './ws-tab-overview-panel.component.html',
  styleUrl: './ws-tab-overview-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WsTabOverviewPanelComponent {
  readonly description = input('');
  readonly tags = input<readonly string[]>([]);
  readonly wsPath = input('');
  readonly parentPath = input('');
  readonly environmentName = input('No environment');
  readonly settings = input.required<CollectionWebsocketSettings>();
  readonly connectionState = input<WsConnectionState>('idle');

  readonly descriptionChange = output<string>();
  readonly tagsChange = output<readonly string[]>();
  readonly sectionSelect = output<WebsocketTabSectionId>();

  protected readonly configCards = computed(() => buildWsOverviewConfigCards(this.settings()));

  protected connectionLabel(): string {
    switch (this.connectionState()) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting';
      default:
        return 'Idle';
    }
  }

  protected connectionTagVariant(): TxTagVariant {
    switch (this.connectionState()) {
      case 'connected':
        return 'success';
      case 'connecting':
        return 'info';
      default:
        return 'default';
    }
  }
}
