import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TxCheckComponent, TxHintComponent, TxHintLayerService } from '@testrix/ui';

import {
  generatePassword,
  PASSWORD_DEFAULT_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordEntropy,
  type PasswordOptions,
} from './password-generator';
import { copyToolText } from './tool-clipboard';
import type { WorkbenchTab } from '../workbench.store';

@Component({
  selector: 'tx-password-generator-editor',
  standalone: true,
  imports: [TxCheckComponent, TxHintComponent],
  templateUrl: './password-generator-editor.component.html',
  styleUrl: './password-generator-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordGeneratorEditorComponent {
  private readonly hints = inject(TxHintLayerService);

  readonly tab = input.required<WorkbenchTab>();
  readonly minLength = PASSWORD_MIN_LENGTH;
  readonly maxLength = PASSWORD_MAX_LENGTH;
  readonly length = signal(PASSWORD_DEFAULT_LENGTH);
  readonly lowercase = signal(true);
  readonly uppercase = signal(true);
  readonly digits = signal(true);
  readonly symbols = signal(true);
  readonly lookalikes = signal(false);
  readonly secret = signal('');

  readonly options = computed<PasswordOptions>(() => ({
    length: this.length(),
    lowercase: this.lowercase(),
    uppercase: this.uppercase(),
    digits: this.digits(),
    symbols: this.symbols(),
    lookalikes: this.lookalikes(),
  }));
  readonly entropy = computed(() => passwordEntropy(this.options()));
  readonly entropyBits = computed(() => Math.round(this.entropy().bits));
  readonly canGenerate = computed(() => this.entropy().charsetSize > 0);

  constructor() {
    this.secret.set(generatePassword(this.options()));
  }

  handleLength(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    this.length.set(Number.parseInt(target.value, 10));
  }

  generate(): void {
    if (!this.canGenerate())
      return;
    this.secret.set(generatePassword(this.options()));
  }

  async generateAndCopy(event: Event): Promise<void> {
    this.generate();
    await copyToolText(this.hints, this.secret(), event);
  }

  async copySecret(event: Event): Promise<void> {
    await copyToolText(this.hints, this.secret(), event);
  }

  clear(): void {
    this.secret.set('');
  }
}
