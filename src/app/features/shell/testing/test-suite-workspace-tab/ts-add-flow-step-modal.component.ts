import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { TestSuiteStepType } from '@shared/testing';

import { TxIconComponent } from '@app/shared/components/tx-icon/tx-icon.component';
import { TxModalComponent } from '@app/shared/components/tx-modal/tx-modal.component';

import { FLOW_STEP_ADD_TILES } from './flow-step-editor-options';

@Component({
  selector: 'app-ts-add-flow-step-modal',
  standalone: true,
  imports: [TxModalComponent, TxIconComponent],
  templateUrl: './ts-add-flow-step-modal.component.html',
  styleUrl: './ts-add-flow-step-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsAddFlowStepModalComponent {
  readonly open = input(false);
  readonly parentFolderName = input<string | null>(null);

  readonly select = output<TestSuiteStepType>();
  readonly closed = output<void>();

  protected readonly addTiles = FLOW_STEP_ADD_TILES;

  protected readonly modalTitle = computed(() => 'Add flow step');

  protected readonly parentLabel = computed(() => {
    const name = this.parentFolderName()?.trim();
    return name || 'Flow root';
  });

  protected handleSelect(type: TestSuiteStepType): void {
    this.select.emit(type);
  }
}
