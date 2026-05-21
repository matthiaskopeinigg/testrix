import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { HttpTestingSettings } from '@shared/config';

import { TxButtonComponent } from '../../tx-button/tx-button.component';
import { TxFormFieldComponent } from '../../tx-form-field/tx-form-field.component';
import { TxInputComponent } from '../../tx-input/tx-input.component';

@Component({
  selector: 'tx-settings-http-testing-section',
  standalone: true,
  imports: [FormsModule, TxButtonComponent, TxFormFieldComponent, TxInputComponent],
  templateUrl: './tx-settings-http-testing-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxSettingsHttpTestingSectionComponent {
  readonly testing = input.required<HttpTestingSettings>();
  readonly canPickDirectory = input(false);

  readonly testingChange = output<Partial<HttpTestingSettings>>();
  readonly pickScreenshotFolder = output<void>();

  protected emit(patch: Partial<HttpTestingSettings>): void {
    this.testingChange.emit(patch);
  }

  protected handleBrowse(): void {
    this.pickScreenshotFolder.emit();
  }
}
