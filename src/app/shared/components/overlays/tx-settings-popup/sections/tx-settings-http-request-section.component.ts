import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { HttpRequestSettings } from '@shared/config';

import { TxDropdownComponent } from '../../../forms/tx-dropdown/tx-dropdown.component';
import { TxFormFieldComponent } from '../../../forms/tx-form-field/tx-form-field.component';
import { TxSliderComponent } from '../../../forms/tx-slider/tx-slider.component';
import { TxToggleComponent } from '../../../forms/tx-toggle/tx-toggle.component';

import {
  HTTP_METHOD_OPTIONS,
  HTTP_REQUEST_SECTION_OPTIONS,
  HTTP_RESPONSE_TAB_ON_SEND_OPTIONS,
  HTTP_URL_SCHEME_OPTIONS,
} from './tx-settings-http-options';

@Component({
  selector: 'tx-settings-http-request-section',
  standalone: true,
  imports: [
    FormsModule,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxSliderComponent,
    TxToggleComponent,
  ],
  templateUrl: './tx-settings-http-request-section.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxSettingsHttpRequestSectionComponent {
  readonly request = input.required<HttpRequestSettings>();
  readonly requestChange = output<Partial<HttpRequestSettings>>();

  protected readonly methodOptions = HTTP_METHOD_OPTIONS;
  protected readonly sectionOptions = HTTP_REQUEST_SECTION_OPTIONS;
  protected readonly responseTabOnSendOptions = HTTP_RESPONSE_TAB_ON_SEND_OPTIONS;
  protected readonly urlSchemeOptions = HTTP_URL_SCHEME_OPTIONS;

  protected emit(patch: Partial<HttpRequestSettings>): void {
    this.requestChange.emit(patch);
  }
}
