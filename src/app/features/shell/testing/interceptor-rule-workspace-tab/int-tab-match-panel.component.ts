import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';

@Component({
  selector: 'app-int-tab-match-panel',
  standalone: true,
  imports: [FormsModule, TxFormFieldComponent, TxInputComponent],
  templateUrl: './int-tab-match-panel.component.html',
  styleUrl: './int-tab-match-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntTabMatchPanelComponent {
  readonly matchUrl = input('');
  readonly matchUrlChange = output<string>();
}
