import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { TestSuiteFlow } from '@shared/testing';

import { TxTagsInputComponent } from '@app/shared/components/tx-tags-input/tx-tags-input.component';
import { TxToggleComponent } from '@app/shared/components/tx-toggle/tx-toggle.component';

@Component({
  selector: 'app-ts-flow-settings-panel',
  standalone: true,
  imports: [
    FormsModule,
    TxToggleComponent,
    TxTagsInputComponent,
  ],
  templateUrl: './ts-flow-settings-panel.component.html',
  styleUrl: './ts-flow-settings-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TsFlowSettingsPanelComponent {
  readonly flow = input.required<TestSuiteFlow>();
  readonly hasE2eSteps = input(false);

  readonly criticalChange = output<boolean>();
  readonly tagsChange = output<readonly string[]>();
  readonly e2eShowWindowChange = output<boolean>();
  readonly e2eKeepWindowOpenChange = output<boolean>();

  protected e2eShowWindow(): boolean {
    return this.flow().e2eShowWindow !== false;
  }

  protected e2eKeepWindowOpen(): boolean {
    return this.flow().e2eKeepWindowOpen === true;
  }
}
