import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { InterceptorRule } from '@shared/testing';

import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

export type InterceptorRuleTabSectionId = 'overview' | 'match' | 'action';

@Component({
  selector: 'app-int-tab-overview-panel',
  standalone: true,
  imports: [TxButtonComponent, TxIconComponent, TxTagComponent],
  templateUrl: './int-tab-overview-panel.component.html',
  styleUrl: './int-tab-overview-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntTabOverviewPanelComponent {
  readonly rule = input.required<InterceptorRule>();
  readonly interceptorRunning = input(false);

  readonly sectionSelect = output<InterceptorRuleTabSectionId>();

  protected readonly actionLabel = computed(() => {
    switch (this.rule().action) {
      case 'mock':
        return 'Mock response';
      case 'block':
        return 'Block';
      default:
        return 'Proxy';
    }
  });

  protected readonly enabledVariant = computed(() => (this.rule().enabled ? 'success' : 'warning'));
}
