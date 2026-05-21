import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxCodeEditorComponent } from '@app/shared/components/tx-code-editor/tx-code-editor.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';
import { TxTextareaComponent } from '@app/shared/components/tx-textarea/tx-textarea.component';

import { DevToolClipboardService } from '../shell/dev-tool-clipboard.service';
import { DevToolLayoutComponent } from '../shell/dev-tool-layout.component';
import { DevToolModeChipComponent } from '../shell/dev-tool-mode-chip.component';
import { DevToolStatStripComponent } from '../shell/dev-tool-stat-strip.component';
import { DevToolToolbarComponent } from '../shell/dev-tool-toolbar.component';
import { createDevToolStateBinding } from './dev-tool-session.harness';
import {
  decodeJwt,
  encodeJwtHs256,
  splitJwt,
  verifyJwtHs256,
} from './logic/jwt.logic';

@Component({
  selector: 'app-jwt-dev-tool',
  standalone: true,
  imports: [
    FormsModule,
    DevToolLayoutComponent,
    DevToolToolbarComponent,
    DevToolModeChipComponent,
    DevToolStatStripComponent,
    TxBannerComponent,
    TxButtonComponent,
    TxCodeEditorComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxTextareaComponent,
    TxTagComponent,
  ],
  templateUrl: './jwt-dev-tool.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JwtDevToolComponent {
  private readonly clipboard = inject(DevToolClipboardService);
  protected readonly state = createDevToolStateBinding('jwt');

  /** HS256 secret — memory only, not persisted. */
  protected readonly secret = signal('');

  protected readonly encodedToken = signal('');
  protected readonly verifyValid = signal<boolean | null>(null);
  protected readonly encodeError = signal<string | null>(null);

  protected readonly decoded = computed(() => decodeJwt(this.state().token));

  protected readonly parts = computed(() => splitJwt(this.state().token));

  protected setMode(mode: 'decode' | 'encode' | 'verify'): void {
    this.state.update((s) => ({ ...s, mode }));
    this.encodeError.set(null);
    this.verifyValid.set(null);
  }

  protected async handleEncode(): Promise<void> {
    const result = await encodeJwtHs256(
      this.state().headerJson,
      this.state().payloadJson,
      this.secret(),
    );
    this.encodedToken.set(result.token);
    this.encodeError.set(result.error);
    if (result.token) {
      this.state.update((s) => ({ ...s, token: result.token }));
    }
  }

  protected async handleVerify(): Promise<void> {
    const result = await verifyJwtHs256(this.state().token, this.secret());
    this.verifyValid.set(result.valid);
    this.encodeError.set(result.error);
  }

  protected handleClear(): void {
    this.state.update((s) => ({ ...s, token: '' }));
    this.secret.set('');
    this.encodedToken.set('');
    this.verifyValid.set(null);
    this.encodeError.set(null);
  }

  protected async handleCopyToken(): Promise<void> {
    const text =
      this.state().mode === 'encode' ? this.encodedToken() || this.state().token : this.state().token;
    await this.clipboard.copy(text, 'Token copied');
  }

  protected async handleCopySignature(): Promise<void> {
    const sig = this.parts()?.signature;
    if (sig) await this.clipboard.copy(sig, 'Signature copied');
  }
}
