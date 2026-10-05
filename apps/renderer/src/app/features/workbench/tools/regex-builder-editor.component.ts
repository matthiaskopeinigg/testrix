import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TxCheckComponent, TxHintComponent, TxHintLayerService } from '@testrix/ui';

import { REGEX_FLAGS, testRegex, type RegexFlag } from './regex-tester';
import { copyToolText } from './tool-clipboard';
import type { WorkbenchTab } from '../workbench.store';

const SAMPLE_HAYSTACK = 'GET /v1/users/42 HTTP/1.1';

@Component({
  selector: 'tx-regex-builder-editor',
  standalone: true,
  imports: [TxCheckComponent, TxHintComponent],
  templateUrl: './regex-builder-editor.component.html',
  styleUrl: './regex-builder-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegexBuilderEditorComponent {
  private readonly hints = inject(TxHintLayerService);

  readonly tab = input.required<WorkbenchTab>();
  readonly pattern = signal('');
  readonly haystack = signal(SAMPLE_HAYSTACK);
  readonly flags = signal<readonly RegexFlag[]>(['g']);
  readonly flagOptions = REGEX_FLAGS;

  readonly result = computed(() => testRegex(this.pattern(), this.flags(), this.haystack()));
  readonly error = computed(() => this.result().error);
  readonly matches = computed(() => this.result().matches);
  readonly segments = computed(() => this.result().segments);

  hasFlag(flag: RegexFlag): boolean {
    return this.flags().includes(flag);
  }

  toggleFlag(flag: RegexFlag, enabled: boolean): void {
    if (enabled) {
      this.flags.set([...this.flags(), flag]);
      return;
    }
    this.flags.set(this.flags().filter((item) => item !== flag));
  }

  handlePattern(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement)
      this.pattern.set(target.value);
  }

  handleHaystack(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLTextAreaElement)
      this.haystack.set(target.value);
  }

  clear(): void {
    this.pattern.set('');
    this.haystack.set('');
  }

  async copyPattern(event: Event): Promise<void> {
    await copyToolText(this.hints, this.pattern(), event);
  }
}
