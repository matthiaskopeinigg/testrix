import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TxHintComponent, TxHintLayerService } from '@testrix/ui';

import { copyToolText } from './tool-clipboard';
import {
  applyQueryPairs,
  formatQueryPairs,
  parseQueryPairs,
  transformUrl,
  type QueryPair,
  type UrlCodecKind,
  type UrlCodecMode,
} from './url-codec';
import type { WorkbenchTab } from '../workbench.store';

@Component({
  selector: 'tx-url-codec-editor',
  standalone: true,
  imports: [TxHintComponent],
  templateUrl: './url-codec-editor.component.html',
  styleUrl: './url-codec-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UrlCodecEditorComponent {
  private readonly hints = inject(TxHintLayerService);

  readonly tab = input.required<WorkbenchTab>();
  readonly mode = signal<UrlCodecMode>('encode');
  readonly kind = signal<UrlCodecKind>('component');
  readonly source = signal('');
  readonly pairs = signal<QueryPair[]>([{ key: '', value: '' }]);

  readonly result = computed(() => transformUrl(this.source(), this.mode(), this.kind()));
  readonly output = computed(() => this.result().value);
  readonly error = computed(() => this.result().error);

  setMode(mode: UrlCodecMode): void {
    this.mode.set(mode);
  }

  setKind(kind: UrlCodecKind): void {
    this.kind.set(kind);
  }

  handleSource(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLTextAreaElement))
      return;
    const value = target.value;
    this.source.set(value);
    this.pairs.set(parseQueryPairs(value));
  }

  handlePair(index: number, field: keyof QueryPair, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement))
      return;
    const next = this.pairs().map((pair, pairIndex) =>
      pairIndex === index ? { ...pair, [field]: target.value } : pair,
    );
    this.pairs.set(next);
    if (this.kind() === 'uri')
      this.source.set(applyQueryPairs(this.source(), next));
    else
      this.source.set(formatQueryPairs(next));
  }

  addPair(): void {
    this.pairs.set([...this.pairs(), { key: '', value: '' }]);
  }

  removePair(index: number): void {
    const next = this.pairs().filter((_, pairIndex) => pairIndex !== index);
    this.pairs.set(next.length > 0 ? next : [{ key: '', value: '' }]);
    if (this.kind() === 'uri')
      this.source.set(applyQueryPairs(this.source(), this.pairs()));
    else
      this.source.set(formatQueryPairs(this.pairs()));
  }

  swap(): void {
    const output = this.output();
    this.source.set(output);
    this.pairs.set(parseQueryPairs(output));
    this.mode.set(this.mode() === 'encode' ? 'decode' : 'encode');
  }

  clear(): void {
    this.source.set('');
    this.pairs.set([{ key: '', value: '' }]);
  }

  async copyOutput(event: Event): Promise<void> {
    await copyToolText(this.hints, this.output(), event);
  }
}
