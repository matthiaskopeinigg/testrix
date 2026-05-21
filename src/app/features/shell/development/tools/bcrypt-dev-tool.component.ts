import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as bcrypt from 'bcryptjs';

import { TxBannerComponent } from '@app/shared/components/tx-banner/tx-banner.component';
import { TxButtonComponent } from '@app/shared/components/tx-button/tx-button.component';
import { TxFormFieldComponent } from '@app/shared/components/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/tx-input/tx-input.component';
import { TxSliderComponent } from '@app/shared/components/tx-slider/tx-slider.component';
import { TxTagComponent } from '@app/shared/components/tx-tag/tx-tag.component';

import { DevToolClipboardService } from '../shell/dev-tool-clipboard.service';
import { DevToolLayoutComponent } from '../shell/dev-tool-layout.component';
import { DevToolModeChipComponent } from '../shell/dev-tool-mode-chip.component';
import { DevToolStatStripComponent } from '../shell/dev-tool-stat-strip.component';
import { DevToolToolbarComponent } from '../shell/dev-tool-toolbar.component';
import { createDevToolStateBinding } from './dev-tool-session.harness';

@Component({
  selector: 'app-bcrypt-dev-tool',
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
    TxSliderComponent,
    TxTagComponent,
  ],
  templateUrl: './bcrypt-dev-tool.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BcryptDevToolComponent {
  private readonly clipboard = inject(DevToolClipboardService);
  protected readonly state = createDevToolStateBinding('bcrypt');

  /** Never persisted to session. */
  protected readonly password = signal('');

  protected readonly verifyMessage = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected setMode(mode: 'hash' | 'verify'): void {
    this.state.update((s) => ({ ...s, mode }));
    this.error.set(null);
    this.verifyMessage.set(null);
  }

  protected hashCostFromStored(): string | null {
    const hash = this.state().hash.trim();
    const match = /^\$2[aby]?\$(\d{2})\$/.exec(hash);
    return match?.[1] ?? null;
  }

  protected handleHash(): void {
    const pwd = this.password();
    if (!pwd) {
      this.error.set('Enter a password to hash.');
      return;
    }
    try {
      const hash = bcrypt.hashSync(pwd, this.state().rounds);
      this.state.update((s) => ({ ...s, hash }));
      this.error.set(null);
    } catch {
      this.error.set('Could not generate bcrypt hash.');
    }
  }

  protected handleValidate(): void {
    const pwd = this.password();
    const hashValue = this.state().hash.trim();
    if (!pwd || !hashValue) {
      this.error.set('Enter a password and hash to validate.');
      return;
    }
    try {
      const match = bcrypt.compareSync(pwd, hashValue);
      this.verifyMessage.set(match ? 'Password matches the hash.' : 'Password does not match the hash.');
      this.error.set(null);
    } catch {
      this.error.set('Invalid bcrypt hash format.');
      this.verifyMessage.set(null);
    }
  }

  protected handleClearSecrets(): void {
    this.password.set('');
    this.error.set(null);
    this.verifyMessage.set(null);
  }

  protected async handleCopyHash(): Promise<void> {
    await this.clipboard.copy(this.state().hash, 'Hash copied');
  }
}
