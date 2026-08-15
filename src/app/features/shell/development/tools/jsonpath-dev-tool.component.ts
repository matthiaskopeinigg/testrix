import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { extractJsonPath, formatJsonPathResult } from '@shared/testing/json-path';

import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxTextareaComponent } from '@app/shared/components/forms/tx-textarea/tx-textarea.component';

import { DevToolClipboardService } from '../shell/dev-tool-clipboard.service';
import { DevToolLayoutComponent } from '../shell/dev-tool-layout.component';
import { DevToolToolbarComponent } from '../shell/dev-tool-toolbar.component';
import { createDevToolStateBinding } from './dev-tool-session.harness';

@Component({
  selector: 'app-jsonpath-dev-tool',
  standalone: true,
  imports: [
    FormsModule,
    DevToolLayoutComponent,
    DevToolToolbarComponent,
    TxButtonComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxTextareaComponent,
  ],
  templateUrl: './jsonpath-dev-tool.component.html',
  styleUrl: './url-dev-tool.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JsonpathDevToolComponent {
  private readonly clipboard = inject(DevToolClipboardService);
  protected readonly state = createDevToolStateBinding('jsonpath');

  protected handleEvaluate(): void {
    try {
      const data = JSON.parse(this.state().json);
      const extracted = extractJsonPath(data, this.state().path);
      this.state.update((s) => ({
        ...s,
        result: extracted === undefined ? '(no match)' : formatJsonPathResult(extracted),
      }));
    } catch {
      this.state.update((s) => ({ ...s, result: 'Invalid JSON' }));
    }
  }

  protected async handleCopy(): Promise<void> {
    await this.clipboard.copy(this.state().result, 'Result copied');
  }
}
