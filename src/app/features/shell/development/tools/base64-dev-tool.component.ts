import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';
import { TxToggleComponent } from '@app/shared/components/tx-toggle/tx-toggle.component';

import { DevToolClipboardService } from '../shell/dev-tool-clipboard.service';
import { DevToolLayoutComponent } from '../shell/dev-tool-layout.component';
import { DevToolModeChipComponent } from '../shell/dev-tool-mode-chip.component';
import { DevToolStatStripComponent } from '../shell/dev-tool-stat-strip.component';
import { DevToolToolbarComponent } from '../shell/dev-tool-toolbar.component';
import { createDevToolStateBinding } from './dev-tool-session.harness';
import { transformBase64 } from './logic/base64.logic';

@Component({
  selector: 'app-base64-dev-tool',
  standalone: true,
  imports: [
    FormsModule,
    DevToolLayoutComponent,
    DevToolToolbarComponent,
    DevToolModeChipComponent,
    DevToolStatStripComponent,
    TxBannerComponent,
    TxButtonComponent,
    TxFormFieldComponent,
    TxTextareaComponent,
    TxToggleComponent,
    TxTagComponent,
  ],
  templateUrl: './base64-dev-tool.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Base64DevToolComponent {
  private readonly clipboard = inject(DevToolClipboardService);
  protected readonly state = createDevToolStateBinding('base64');

  protected readonly result = computed(() => {
    const s = this.state();
    return transformBase64({
      value: s.input,
      encode: s.mode === 'encode',
      urlSafe: s.urlSafe,
    });
  });

  protected readonly inputBytes = computed(() => new TextEncoder().encode(this.state().input).length);
  protected readonly outputBytes = computed(() => new TextEncoder().encode(this.result().output).length);

  protected setMode(mode: 'encode' | 'decode'): void {
    this.state.update((s) => ({ ...s, mode }));
  }

  protected handleSwap(): void {
    const out = this.result().output;
    if (!out || this.result().error) return;
    this.state.update((s) => ({
      ...s,
      input: out,
      mode: s.mode === 'encode' ? 'decode' : 'encode',
    }));
  }

  protected handleClear(): void {
    this.state.update((s) => ({ ...s, input: '' }));
  }

  protected async handleCopyOutput(): Promise<void> {
    await this.clipboard.copy(this.result().output);
  }

  protected async handleCopyInput(): Promise<void> {
    await this.clipboard.copy(this.state().input, 'Input copied');
  }
}
