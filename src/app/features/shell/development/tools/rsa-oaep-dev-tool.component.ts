import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ElectronService } from '@app/core/electron/electron.service';
import { TxBannerComponent } from '@app/shared/components/feedback/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxTagComponent } from '@app/shared/components/forms/tx-tag/tx-tag.component';
import { TxTextareaComponent } from '@app/shared/components/forms/tx-textarea/tx-textarea.component';
import { pemLooksLikePrivateKey, RSA_OAEP_JAVA_TRANSFORM } from '@shared/crypto/rsa-oaep.schema';

import { DevToolClipboardService } from '../shell/dev-tool-clipboard.service';
import { DevToolLayoutComponent } from '../shell/dev-tool-layout.component';
import { DevToolModeChipComponent } from '../shell/dev-tool-mode-chip.component';
import { DevToolStatStripComponent } from '../shell/dev-tool-stat-strip.component';
import { DevToolToolbarComponent } from '../shell/dev-tool-toolbar.component';
import { createDevToolStateBinding } from './dev-tool-session.harness';

@Component({
  selector: 'app-rsa-oaep-dev-tool',
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
    TxInputComponent,
    TxTagComponent,
    TxTextareaComponent,
  ],
  templateUrl: './rsa-oaep-dev-tool.component.html',
  styleUrl: './url-dev-tool.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RsaOaepDevToolComponent {
  private readonly clipboard = inject(DevToolClipboardService);
  private readonly electron = inject(ElectronService);
  protected readonly state = createDevToolStateBinding('rsa-oaep');

  /** Never persisted to session. */
  protected readonly keyPassword = signal('');
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected readonly algorithmLabel = RSA_OAEP_JAVA_TRANSFORM;

  protected readonly showKeyPassword = computed(() => {
    if (this.state().mode === 'decode') {
      return true;
    }
    return pemLooksLikePrivateKey(this.state().pem);
  });

  protected setMode(mode: 'encode' | 'decode'): void {
    this.state.update((s) => ({ ...s, mode }));
    this.error.set(null);
  }

  protected async handleRun(): Promise<void> {
    const crypto = this.electron.bridge()?.crypto;
    if (!crypto) {
      this.error.set('RSA OAEP is only available in the desktop app.');
      return;
    }
    const s = this.state();
    const pem = s.pem.trim();
    if (!pem) {
      this.error.set('Paste a PEM key.');
      return;
    }
    if (!s.input.trim()) {
      this.error.set(s.mode === 'encode' ? 'Enter plaintext to encrypt.' : 'Enter Base64 ciphertext to decrypt.');
      return;
    }
    if (this.showKeyPassword() && !this.keyPassword().trim()) {
      this.error.set('Enter the private-key password.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const result =
        s.mode === 'encode'
          ? await crypto.encrypt({
              pem,
              keyPassword: this.keyPassword(),
              input: s.input,
            })
          : await crypto.decrypt({
              pem,
              keyPassword: this.keyPassword(),
              input: s.input,
            });
      this.state.update((prev) => ({ ...prev, output: result.output }));
    } catch (error: unknown) {
      this.error.set(ipcUserMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected handleClearSecrets(): void {
    this.keyPassword.set('');
    this.error.set(null);
  }

  protected async handleCopy(): Promise<void> {
    await this.clipboard.copy(this.state().output, 'Copied');
  }
}

function ipcUserMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'userMessage' in error) {
    const message = (error as { userMessage?: unknown }).userMessage;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message.replace(/^[A-Z_]+:\s*/, '');
  }
  return 'RSA OAEP operation failed.';
}
