import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { MockServerTabSectionId } from '@shared/config';
import type { MockServerEndpoint } from '@shared/testing';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import type { TxIconName } from '@app/shared/icons/tx-icon.registry';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';
import { TxTagsInputComponent } from '@app/shared/components/tx-tags-input/tx-tags-input.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';

import {
  buildMockServerOverviewConfigCards,
  formatMockResponseBodyLabel,
} from './ms-tab-overview-summary';

interface MockEndpointOverviewStat {
  readonly label: string;
  readonly value: string;
  readonly icon: TxIconName;
}

/**
 * Overview section for a mock endpoint workspace tab (aligned with collection request overview).
 */
@Component({
  selector: 'app-ms-tab-overview-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxTagComponent,
    TxTagsInputComponent,
    TxTextareaComponent,
  ],
  templateUrl: './ms-tab-overview-panel.component.html',
  styleUrls: [
    '../../workspace/request-workspace-tab/request-tab-overview-panel.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MsTabOverviewPanelComponent {
  readonly endpoint = input.required<MockServerEndpoint>();
  readonly routeMethod = input('ANY');
  readonly routePath = input('/');

  readonly descriptionChange = output<string>();
  readonly tagsChange = output<readonly string[]>();
  readonly sectionSelect = output<MockServerTabSectionId>();

  protected readonly description = computed(() => this.endpoint().description);
  protected readonly tags = computed(() => this.endpoint().tags);
  protected readonly enabled = computed(() => this.endpoint().enabled);
  protected readonly configCards = computed(() =>
    buildMockServerOverviewConfigCards(this.endpoint()),
  );

  protected readonly priorityLabel = computed(() => {
    const priority = this.endpoint().priority;
    return priority > 0 ? String(priority) : 'Default (0)';
  });

  protected readonly matcherSummary = computed(() => {
    const total = this.endpoint().matchers.length;
    const enabled = this.endpoint().matchers.filter((m) => m.enabled).length;
    if (total === 0) {
      return 'No matchers yet';
    }
    return `${enabled} of ${total} matcher${total === 1 ? '' : 's'} enabled`;
  });

  protected readonly responseStats = computed((): readonly MockEndpointOverviewStat[] => {
    const { response } = this.endpoint();
    return [
      {
        label: 'Status',
        value: String(response.statusCode),
        icon: 'checkCircle',
      },
      {
        label: 'Latency',
        value: `${response.latencyMs} ms`,
        icon: 'clock',
      },
      {
        label: 'Body',
        value: formatMockResponseBodyLabel(response.body),
        icon: 'fileText',
      },
      {
        label: 'Matchers',
        value: String(this.endpoint().matchers.length),
        icon: 'filter',
      },
    ];
  });
}
