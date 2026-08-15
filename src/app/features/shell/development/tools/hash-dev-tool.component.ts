import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { TxButtonComponent } from '@app/shared/components/forms/tx-button/tx-button.component';
import { TxDropdownComponent } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.component';
import type { TxDropdownOption } from '@app/shared/components/forms/tx-dropdown/tx-dropdown.types';
import { TxFormFieldComponent } from '@app/shared/components/forms/tx-form-field/tx-form-field.component';
import { TxInputComponent } from '@app/shared/components/forms/tx-input/tx-input.component';
import { TxTagComponent } from '@app/shared/components/forms/tx-tag/tx-tag.component';
import { TxTextareaComponent } from '@app/shared/components/forms/tx-textarea/tx-textarea.component';

import { DevToolClipboardService } from '../shell/dev-tool-clipboard.service';
import { DevToolLayoutComponent } from '../shell/dev-tool-layout.component';
import { DevToolStatStripComponent } from '../shell/dev-tool-stat-strip.component';
import { DevToolToolbarComponent } from '../shell/dev-tool-toolbar.component';
import { createDevToolStateBinding } from './dev-tool-session.harness';
import { hashText, hmacSha256, type HashAlgorithm } from './logic/hash.logic';

@Component({
  selector: 'app-hash-dev-tool',
  standalone: true,
  imports: [
    FormsModule,
    DevToolLayoutComponent,
    DevToolToolbarComponent,
    DevToolStatStripComponent,
    TxButtonComponent,
    TxDropdownComponent,
    TxFormFieldComponent,
    TxInputComponent,
    TxTagComponent,
    TxTextareaComponent,
  ],
  templateUrl: './hash-dev-tool.component.html',
  styleUrl: './url-dev-tool.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HashDevToolComponent {
  private readonly clipboard = inject(DevToolClipboardService);
  protected readonly state = createDevToolStateBinding('hash');

  protected readonly algorithmOptions: readonly TxDropdownOption[] = [
    { value: 'md5', label: 'MD5' },
    { value: 'sha-1', label: 'SHA-1' },
    { value: 'sha-256', label: 'SHA-256' },
    { value: 'sha-384', label: 'SHA-384' },
    { value: 'sha-512', label: 'SHA-512' },
    { value: 'hmac-sha256', label: 'HMAC-SHA256' },
  ];

  protected readonly isHmac = computed(() => this.state().algorithm === 'hmac-sha256');

  protected async handleHash(): Promise<void> {
    const s = this.state();
    const output =
      s.algorithm === 'hmac-sha256'
        ? await hmacSha256(s.key, s.input)
        : await hashText(s.algorithm as HashAlgorithm, s.input);
    this.state.update((prev) => ({ ...prev, output }));
  }

  protected async handleCopy(): Promise<void> {
    await this.clipboard.copy(this.state().output, 'Hash copied');
  }
}
