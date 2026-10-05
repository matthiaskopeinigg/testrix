import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TxHintComponent, TxHintLayerService, TxInputComponent } from '@testrix/ui';

import { decodeJwt, encodeHs256Jwt, verifyHs256Jwt, type JwtMode } from './jwt-toolkit';
import { copyToolText } from './tool-clipboard';
import type { WorkbenchTab } from '../workbench.store';

const DEFAULT_PAYLOAD = `{
  "sub": "user-1",
  "name": "Ada",
  "iat": 1516239022
}`;

@Component({
  selector: 'tx-jwt-toolkit-editor',
  standalone: true,
  imports: [TxHintComponent, TxInputComponent],
  templateUrl: './jwt-toolkit-editor.component.html',
  styleUrl: './jwt-toolkit-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JwtToolkitEditorComponent {
  private readonly hints = inject(TxHintLayerService);
  private encodeGen = 0;
  private verifyGen = 0;

  readonly tab = input.required<WorkbenchTab>();
  readonly mode = signal<JwtMode>('decode');
  readonly token = signal('');
  readonly payloadJson = signal(DEFAULT_PAYLOAD);
  readonly secret = signal('');
  readonly encodedToken = signal('');
  readonly encodeError = signal<string | null>(null);
  readonly verifyState = signal<'idle' | 'match' | 'mismatch' | 'unsupported' | 'invalid'>('idle');

  readonly decoded = computed(() => decodeJwt(this.token()));
  readonly copyValue = computed(() => {
    if (this.mode() === 'encode')
      return this.encodedToken();
    return this.token().trim();
  });

  constructor() {
    effect(() => {
      const payload = this.payloadJson();
      const secret = this.secret();
      const gen = ++this.encodeGen;
      void this.refreshEncode(payload, secret, gen);
    });

    effect(() => {
      const token = this.token();
      const secret = this.secret();
      const gen = ++this.verifyGen;
      void this.refreshVerify(token, secret, gen);
    });
  }

  setMode(mode: JwtMode): void {
    this.mode.set(mode);
  }

  handleToken(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement)
      this.token.set(target.value);
  }

  handlePayload(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement)
      this.payloadJson.set(target.value);
  }

  swap(): void {
    if (this.mode() === 'encode') {
      this.token.set(this.encodedToken());
      this.mode.set('decode');
      return;
    }
    const parts = this.decoded().parts;
    if (parts)
      this.payloadJson.set(parts.payloadJson);
    this.mode.set('encode');
  }

  clear(): void {
    this.token.set('');
    this.payloadJson.set(DEFAULT_PAYLOAD);
    this.secret.set('');
    this.encodedToken.set('');
    this.encodeError.set(null);
    this.verifyState.set('idle');
  }

  async copyLatest(event: Event): Promise<void> {
    await copyToolText(this.hints, this.copyValue(), event);
  }

  async copyJson(event: Event, value: string): Promise<void> {
    await copyToolText(this.hints, value, event);
  }

  private async refreshEncode(payload: string, secret: string, gen: number): Promise<void> {
    if (!secret) {
      if (gen !== this.encodeGen)
        return;
      this.encodedToken.set('');
      this.encodeError.set(null);
      return;
    }
    try {
      const token = await encodeHs256Jwt(payload, secret);
      if (gen !== this.encodeGen)
        return;
      this.encodedToken.set(token);
      this.encodeError.set(null);
    } catch (error) {
      if (gen !== this.encodeGen)
        return;
      this.encodedToken.set('');
      this.encodeError.set(error instanceof Error ? error.message : 'Could not sign JWT');
    }
  }

  private async refreshVerify(token: string, secret: string, gen: number): Promise<void> {
    if (!token.trim() || !secret) {
      this.verifyState.set('idle');
      return;
    }
    const result = await verifyHs256Jwt(token, secret);
    if (gen !== this.verifyGen)
      return;
    this.verifyState.set(result);
  }
}
