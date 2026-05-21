import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';
import { TxToggleComponent } from '@app/shared/components/tx-toggle/tx-toggle.component';

import { DevToolClipboardService } from '../shell/dev-tool-clipboard.service';
import { DevToolLayoutComponent } from '../shell/dev-tool-layout.component';
import { DevToolModeChipComponent } from '../shell/dev-tool-mode-chip.component';
import { DevToolToolbarComponent } from '../shell/dev-tool-toolbar.component';
import { createDevToolStateBinding } from './dev-tool-session.harness';
import { parseUrl, transformUrl } from './logic/url.logic';

@Component({
  selector: 'app-url-dev-tool',
  standalone: true,
  imports: [
    FormsModule,
    DevToolLayoutComponent,
    DevToolToolbarComponent,
    DevToolModeChipComponent,
    TxBannerComponent,
    TxButtonComponent,
    TxFormFieldComponent,
    TxTextareaComponent,
    TxToggleComponent,
  ],
  templateUrl: './url-dev-tool.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UrlDevToolComponent {
  private readonly clipboard = inject(DevToolClipboardService);
  protected readonly state = createDevToolStateBinding('url');

  protected readonly transform = computed(() => {
    const s = this.state();
    if (s.mode === 'parse') {
      return { output: '', error: null };
    }
    return transformUrl({
      value: s.input,
      encode: s.mode === 'encode',
      componentOnly: s.componentOnly,
    });
  });

  protected readonly parsed = computed(() => parseUrl(this.state().input));

  protected setMode(mode: 'encode' | 'decode' | 'parse'): void {
    this.state.update((s) => ({ ...s, mode }));
  }

  protected handleClear(): void {
    this.state.update((s) => ({ ...s, input: '' }));
  }

  protected async handleCopyOutput(): Promise<void> {
    const text = this.state().mode === 'parse' ? this.parsed().href : this.transform().output;
    await this.clipboard.copy(text);
  }
}
