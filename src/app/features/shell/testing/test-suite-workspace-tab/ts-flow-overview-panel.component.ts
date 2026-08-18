import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { TestSuiteFlowSectionId } from '@shared/config';
import type { TestSuiteFlow } from '@shared/testing';

import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxIconComponent } from '@app/shared/components/forms/tx-icon/tx-icon.component';
import { TxTagComponent } from '@app/shared/components/forms/tx-tag/tx-tag.component';
import { TxTextareaComponent } from '@app/shared/components/forms/tx-textarea/tx-textarea.component';

import type { FlowRunSummary } from './flow-run-summary';
import { buildFlowOverviewConfigCards } from './flow-tab-overview-summary';

@Component({
  selector: 'app-ts-flow-overview-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxButtonComponent,
    TxFormFieldComponent,
    TxIconComponent,
    TxTagComponent,
    TxTextareaComponent,
  ],
  templateUrl: './ts-flow-overview-panel.component.html',
  styleUrl: './ts-flow-overview-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowOverviewPanelComponent {
  readonly flow = input.required<TestSuiteFlow>();
  readonly environmentName = input('No environment');
  readonly hasE2eSteps = input(false);
  readonly runSummary = input<FlowRunSummary | null>(null);

  readonly descriptionChange = output<string>();
  readonly sectionSelect = output<TestSuiteFlowSectionId>();
  readonly openSteps = output<void>();

  protected readonly configCards = computed(() =>
    buildFlowOverviewConfigCards(this.flow(), this.hasE2eSteps()),
  );

  protected readonly lastRunStats = computed(() => {
    const summary = this.runSummary();
    if (!summary) {
      return [];
    }
    return [
      { label: 'Result', value: summary.statusLabel, icon: 'checkCircle' as const },
      { label: 'Duration', value: summary.durationLabel ?? '—', icon: 'clock' as const },
      { label: 'Passed', value: String(summary.passedCount), icon: 'checkCircle' as const },
      { label: 'Failed', value: String(summary.failedCount), icon: 'xCircle' as const },
    ];
  });
}
