import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TxCheckComponent, TxHintComponent, TxHintLayerService } from '@testrix/ui';

import { transformBase64, type Base64Mode } from './base64-codec';
import { copyToolText } from './tool-clipboard';
import type { WorkbenchTab } from '../workbench.store';

@Component({
  selector: 'tx-base64-editor',
  standalone: true,
  imports: [TxCheckComponent, TxHintComponent],
  templateUrl: './base64-editor.component.html',
  styleUrl: './base64-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Base64EditorComponent {
  private readonly hints = inject(TxHintLayerService);

  readonly tab = input.required<WorkbenchTab>();
  readonly mode = signal<Base64Mode>('encode');
  readonly urlSafe = signal(false);
  readonly source = signal('');

  readonly result = computed(() => transformBase64(this.source(), this.mode(), this.urlSafe()));
  readonly output = computed(() => this.result().value);
  readonly error = computed(() => this.result().error);

  setMode(mode: Base64Mode): void {
    this.mode.set(mode);
  }

  handleSource(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement)
      this.source.set(target.value);
  }

  swap(): void {
    const output = this.output();
    this.source.set(output);
    this.mode.set(this.mode() === 'encode' ? 'decode' : 'encode');
  }

  clear(): void {
    this.source.set('');
  }

  async copyOutput(event: Event): Promise<void> {
    await copyToolText(this.hints, this.output(), event);
  }
}
