import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxTextareaComponent } from '@app/shared/components/forms/tx-textarea/tx-textarea.component';

import { DevToolClipboardService } from '../shell/dev-tool-clipboard.service';
import { DevToolLayoutComponent } from '../shell/dev-tool-layout.component';
import { DevToolToolbarComponent } from '../shell/dev-tool-toolbar.component';
import { createDevToolStateBinding } from './dev-tool-session.harness';
import { formatPemInspection, inspectPem } from './logic/cert-inspector.logic';

@Component({
  selector: 'app-cert-inspector-dev-tool',
  standalone: true,
  imports: [
    FormsModule,
    DevToolLayoutComponent,
    DevToolToolbarComponent,
    TxButtonComponent,
    TxFormFieldComponent,
    TxTextareaComponent,
  ],
  templateUrl: './cert-inspector-dev-tool.component.html',
  styleUrl: './url-dev-tool.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CertInspectorDevToolComponent {
  private readonly clipboard = inject(DevToolClipboardService);
  protected readonly state = createDevToolStateBinding('cert-inspector');

  protected async handleInspect(): Promise<void> {
    const blocks = await inspectPem(this.state().pem);
    this.state.update((s) => ({ ...s, output: formatPemInspection(blocks) }));
  }

  protected async handleCopy(): Promise<void> {
    await this.clipboard.copy(this.state().output, 'Inspection copied');
  }
}
